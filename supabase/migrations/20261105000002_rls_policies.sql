-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 002_rls_policies.sql
--
-- Row Level Security is the authorization boundary. Every table is RLS-enabled;
-- a table with no policy is invisible to the anon and authenticated roles.
--
-- The rules:
--   * `profiles` / `contacts` — strictly owner-scoped, with a moderator
--     override for disabling an account.
--   * `reports` — the author may read and edit their own (category only);
--     a moderator may read every report for the queue.
--   * `alerts_feed` — the PUBLIC projection. It carries no `author_id`
--     column at all (FR-DATA-3 / FR-NG-5).
--   * `flags` / `moderation_actions` — a citizen may insert their own flag
--     and read only their own flags; the audit trail is moderator-only.
--   * `location_shares` — the sender only. Never exposed to a feed, a view,
--     an RPC, or an admin projection.
--   * `stations` / `hotlines` — publicly readable, but only the ACTIVE rows.
--   * `job_runs` — moderator-only, and written exclusively by the
--     service-role Edge Functions.
-- =============================================================================

-- =============================================================================
-- Helper: is the current user a moderator?
-- =============================================================================

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'moderator' and disabled_at is null
  );
$$;

-- =============================================================================
-- profiles
-- =============================================================================

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- A moderator may disable or enable an account. This is the only way the
-- `disabled_at` column can change.
create policy "profiles_moderator_update"
  on public.profiles for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- A disabled account cannot mutate its own profile.
create or replace function public.profiles_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side paths (the moderation functions) set this flag for the
  -- duration of their own statement. Without the bypass, the guard would
  -- also reject the server's legitimate writes.
  if coalesce(current_setting('app.server_side_write', true), 'off') = 'on' then
    return new;
  end if;

  if old.disabled_at is not null then
    raise exception 'ACCOUNT_DISABLED' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_update_guard_trigger
  before update on public.profiles
  for each row execute function public.profiles_update_guard();

-- =============================================================================
-- contacts — strictly owner-scoped
-- =============================================================================

alter table public.contacts enable row level security;

create policy "contacts_owner_all"
  on public.contacts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- reports
--
-- The author may read their own reports and update ONLY the category. That
-- restriction is enforced in `reports_update_guard`.
-- =============================================================================

alter table public.reports enable row level security;

create policy "reports_select_own"
  on public.reports for select
  using (author_id = auth.uid());

create policy "reports_insert_own"
  on public.reports for insert
  with check (author_id = auth.uid());

create policy "reports_update_own"
  on public.reports for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- The author may change only the category. Any other column change raises.
create or replace function public.reports_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side paths (flag_report, moderation_decide) set this flag for the
  -- duration of their own statement. The guard is a CLIENT-facing rule — it
  -- must not also constrain the server's own moderation writes.
  if coalesce(current_setting('app.server_side_write', true), 'off') = 'on' then
    return new;
  end if;

  if old.author_id <> auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id
     or new.lat is distinct from old.lat
     or new.lng is distinct from old.lng
     or new.captured_at is distinct from old.captured_at
     or new.description is distinct from old.description
     or new.public_visibility is distinct from old.public_visibility
     or new.area_hierarchy is distinct from old.area_hierarchy
     or new.client_request_id is distinct from old.client_request_id
     or new.moderation_status is distinct from old.moderation_status
     or new.hide_reason is distinct from old.hide_reason
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'ONLY_CATEGORY_EDITABLE' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger reports_update_guard_trigger
  before update on public.reports
  for each row execute function public.reports_update_guard();

-- A moderator reads every report (the queue needs the full row).
create policy "reports_moderator_select"
  on public.reports for select
  using (public.is_moderator());

-- =============================================================================
-- report_media — readable only through its parent's policy
-- =============================================================================

alter table public.report_media enable row level security;

create policy "report_media_select_own"
  on public.report_media for select
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_media.report_id and r.author_id = auth.uid()
    )
  );

create policy "report_media_insert_own"
  on public.report_media for insert
  with check (
    exists (
      select 1 from public.reports r
      where r.id = report_media.report_id and r.author_id = auth.uid()
    )
  );

create policy "report_media_moderator_select"
  on public.report_media for select
  using (public.is_moderator());

-- =============================================================================
-- flags
--
-- A citizen may insert their own flag and read only the flags they cast.
-- The 3-flag threshold is enforced by the `flag_report` function, not here.
-- =============================================================================

alter table public.flags enable row level security;

create policy "flags_insert_own"
  on public.flags for insert
  with check (flagger_id = auth.uid());

create policy "flags_select_own"
  on public.flags for select
  using (flagger_id = auth.uid());

create policy "flags_moderator_select"
  on public.flags for select
  using (public.is_moderator());

-- =============================================================================
-- moderation_actions — the append-only audit trail
--
-- Moderator-only. A citizen reading the trail gets nothing.
-- =============================================================================

alter table public.moderation_actions enable row level security;

create policy "moderation_actions_moderator_select"
  on public.moderation_actions for select
  using (public.is_moderator());

-- The trail is appended by the server-side functions, never by a client.
create policy "moderation_actions_moderator_insert"
  on public.moderation_actions for insert
  with check (moderator_id = auth.uid());

-- =============================================================================
-- location_shares — the sender only
--
-- Deliberately excluded from every feed, view, RPC, and admin projection.
-- =============================================================================

alter table public.location_shares enable row level security;

create policy "location_shares_select_own"
  on public.location_shares for select
  using (sender_id = auth.uid());

create policy "location_shares_insert_own"
  on public.location_shares for insert
  with check (sender_id = auth.uid());

-- =============================================================================
-- area_lookup / geocode_cache — publicly readable reference data
-- =============================================================================

alter table public.area_lookup enable row level security;

create policy "area_lookup_select_all"
  on public.area_lookup for select
  using (true);

alter table public.geocode_cache enable row level security;

create policy "geocode_cache_select_all"
  on public.geocode_cache for select
  using (true);

-- =============================================================================
-- wrong_number_reports — the reporter may read their own
-- =============================================================================

alter table public.wrong_number_reports enable row level security;

create policy "wrong_number_reports_insert_own"
  on public.wrong_number_reports for insert
  with check (reporter_id = auth.uid());

create policy "wrong_number_reports_select_own"
  on public.wrong_number_reports for select
  using (reporter_id = auth.uid());

create policy "wrong_number_reports_moderator_select"
  on public.wrong_number_reports for select
  using (public.is_moderator());

-- =============================================================================
-- Reference data — readable by anyone, but only the ACTIVE rows.
--
-- A retired entry keeps its row so the audit trail survives; it simply stops
-- being readable by the anon key.
-- =============================================================================

alter table public.stations enable row level security;

create policy "stations_select_all"
  on public.stations for select
  using (is_active);

alter table public.hotlines enable row level security;

create policy "hotlines_select_all"
  on public.hotlines for select
  using (is_active);

-- =============================================================================
-- job_runs — moderator-only
--
-- The job functions write with the service-role key, which bypasses RLS.
-- =============================================================================

alter table public.job_runs enable row level security;

create policy "job_runs_moderator_select"
  on public.job_runs for select
  using (public.is_moderator());

-- =============================================================================
-- alerts_feed — the PUBLIC projection
--
-- It has **no `author_id` column**. The column is omitted at the view
-- level, not nulled: a nulled column would still be named `author_id` and
-- would fail the negative privacy test.
--
-- Only `visible` and `restored` reports appear. A hidden or removed report
-- is invisible to the public.
-- =============================================================================

create or replace view public.alerts_feed
with (security_invoker = true)
as
select
  r.id,
  r.category,
  r.description,
  r.area_hierarchy,
  r.captured_at,
  r.public_visibility,
  case
    when r.public_visibility = 'identified' then p.full_name
    else null
  end as author_display_name,
  exists (
    select 1 from public.report_media rm
    where rm.report_id = r.id and rm.purged_at is null
  ) as has_media,
  (
    select count(*) from public.report_media rm
    where rm.report_id = r.id and rm.purged_at is null
  )::integer as media_count
from public.reports r
left join public.profiles p on p.id = r.author_id
where r.moderation_status in ('visible', 'restored')
  and r.deleted_at is null;

grant select on public.alerts_feed to anon, authenticated;

comment on view public.alerts_feed is
  'The public feed projection. It omits author_id entirely (FR-DATA-3 / FR-NG-5).';

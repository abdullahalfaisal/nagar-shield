-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 004_auth_trigger_and_backfill.sql
--
-- Two things:
--
--   1. `handle_new_user()` — the trigger that creates a `profiles` row the
--      moment a Supabase Auth user is created. The phone number arrives in
--      `raw_user_meta_data->>'phone'` because Auth is email-primary
--      (waiver W-1); `raw_phone` is only used as a fallback.
--
--   2. The legacy backfill — copies whatever still applies from the
--      `*_legacy` tables into the canonical ones. `auth.users` and the seeded
--      accounts are never touched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auto-create the profile on signup
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := coalesce(
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'phone_number',
    new.phone
  );
  v_full_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'fullName'
  );
begin
  -- A profile without a phone cannot satisfy the NOT NULL + UNIQUE contract.
  -- The signup screen validates the phone before Auth is called, so a missing
  -- phone means a programmatic signup that bypassed the form.
  if v_phone is null or char_length(btrim(v_phone)) = 0 then
    raise exception 'PHONE_REQUIRED' using errcode = '23502';
  end if;

  insert into public.profiles (id, email, phone, full_name)
  values (new.id, new.email, btrim(v_phone), nullif(btrim(v_full_name), ''))
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Legacy backfill
--
-- The legacy dev schema stored the area hierarchy as a single jsonb blob and
-- the media as one URI. The canonical schema splits both into typed columns.
-- Only the rows that still make sense are copied; nothing is invented.
-- -----------------------------------------------------------------------------

do $$
begin
  -- profiles -----------------------------------------------------------------
  if to_regclass('public.profiles_legacy') is not null then
    insert into public.profiles (
      id, email, phone, full_name, role, locale, theme, biometric_opt_in,
      disabled_at, created_at, updated_at
    )
    select
      l.id,
      l.email,
      l.phone,
      null,
      case when l.role = 'moderator' then 'moderator'::public.app_role else 'citizen'::public.app_role end,
      coalesce(l.locale, 'bn'),
      coalesce(l.theme, 'dark'),
      coalesce(l.biometric_opt_in, false),
      l.disabled_at,
      coalesce(l.created_at, now()),
      coalesce(l.updated_at, now())
    from public.profiles_legacy l
    on conflict (id) do nothing;
  end if;

  -- reports ------------------------------------------------------------------
  if to_regclass('public.reports_legacy') is not null then
    insert into public.reports (
      id, author_id, client_request_id, storage_path, media_type, lat, lng,
      captured_at, description, category, public_visibility, moderation_status,
      area_division, area_city, area_thana, area_neighborhood,
      created_at, updated_at
    )
    select
      l.id,
      l.author_id,
      gen_random_uuid(),
      l.media_uri,
      case
        when l.media_uri ~ '\.(mp4|mov|3gp|webm)(\?|$)' then 'video'::public.media_type
        when l.media_uri ~ '\.(jpg|jpeg|png|webp|heic)(\?|$)' then 'photo'::public.media_type
        else null
      end,
      l.lat,
      l.lng,
      coalesce(l.captured_at, now()),
      l.description,
      case
        when l.category in ('theft','assault','harassment','robbery','accident','fire','medical','fraud','vandalism','suspicious','other')
          then l.category::public.report_category
        else null
      end,
      case
        when l.public_visibility = 'identified' then 'identified'::public.public_visibility
        else 'anonymous'::public.public_visibility
      end,
      case
        when l.moderation_status in ('visible','hidden_pending_review','restored','removed')
          then l.moderation_status::public.moderation_status
        else 'visible'::public.moderation_status
      end,
      l.area_hierarchy ->> 'division',
      l.area_hierarchy ->> 'city',
      l.area_hierarchy ->> 'thana',
      l.area_hierarchy ->> 'neighborhood',
      coalesce(l.created_at, now()),
      coalesce(l.created_at, now())
    from public.reports_legacy l
    on conflict (id) do nothing;
  end if;

  -- flags --------------------------------------------------------------------
  if to_regclass('public.flags_legacy') is not null then
    insert into public.flags (id, report_id, flagger_id, reason, created_at)
    select
      l.id,
      l.report_id,
      l.flagger_id,
      case
        when l.reason in ('misinformation','harassment','duplicate','off_topic','other')
          then l.reason::public.flag_reason
        else 'other'::public.flag_reason
      end,
      coalesce(l.created_at, now())
    from public.flags_legacy l
    on conflict (id) do nothing;
  end if;

  -- moderation_actions -------------------------------------------------------
  if to_regclass('public.moderation_actions_legacy') is not null then
    insert into public.moderation_actions (
      id, report_id, moderator_id, target_user_id, decision, note, created_at
    )
    select
      l.id,
      l.report_id,
      l.moderator_id,
      l.report_id,
      case
        when l.decision in ('restore','remove','disable_user')
          then l.decision::public.moderation_decision
        else 'remove'::public.moderation_decision
      end,
      coalesce(nullif(btrim(l.note), ''), 'Migrated from the legacy dev database'),
      coalesce(l.created_at, now())
    from public.moderation_actions_legacy l
    on conflict (id) do nothing;
  end if;
end
$$;

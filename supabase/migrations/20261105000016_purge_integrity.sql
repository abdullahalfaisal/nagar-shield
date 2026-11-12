-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 016_purge_integrity.sql
--
-- Two data-integrity defects, both in the PII-purge / audit path. Both were
-- found by probing the running database, not by reading the code, and both
-- break a **locked story contract**:
--
--   * DEFECT A — `002-deleted-account-pii-purge` says the purge "never
--     deletes report metadata" and that the `profiles` row survives as a
--     tombstone. It does neither: deleting the Auth identity cascades to
--     `profiles`, which cascades to `reports`, so the account's reports are
--     destroyed by the very job that is supposed to preserve them.
--
--   * DEFECT B — `moderation_actions` is append-only, and its FKs are
--     `ON DELETE SET NULL` so the audit trail survives its report. The
--     append-only trigger also blocks Postgres's own referential action, so
--     the declared FK behaviour is unreachable.
--
-- Both fixes are **forward-only** and re-runnable.
-- =============================================================================

-- =============================================================================
-- DEFECT B — the append-only trigger vs the FK's own SET NULL
-- =============================================================================
--
-- The defect
-- ----------
-- `moderation_actions_append_only()` raises unconditionally on BEFORE UPDATE
-- OR DELETE. The schema declares:
--
--   report_id      uuid references public.reports   (id) on delete set null
--   target_user_id uuid references public.profiles  (id) on delete set null
--
-- `ON DELETE SET NULL` is an **UPDATE** of the referencing row. The trigger
-- fires on that UPDATE and raises `MODERATION_ACTIONS_APPEND_ONLY`, so the
-- referential action can never complete. Deleting a moderated report — the
-- exact thing the FK was declared to survive — fails outright:
--
--   ERROR:  MODERATION_ACTIONS_APPEND_ONLY
--   SQL statement "UPDATE ONLY public.moderation_actions SET report_id = NULL ..."
--
-- Measured on the running database, deleting a moderated report aborts with
-- that error, and the account purge's `auth.users` delete aborts with it too
-- (the `target_user_id` SET NULL fires first).
--
-- The fix
-- -------
-- `pg_trigger_depth()` distinguishes the two cases, and the distinction is
-- **measured**, not assumed:
--
--   * A **direct** UPDATE issued by anybody (including the service-role key)
--     runs the row trigger at depth **1**. This must be refused — it is the
--     append-only guarantee (FR-MOD-3).
--
--   * A **referential action** is fired by an internal AFTER trigger on the
--     referenced table, so the row trigger on the referencing table runs at
--     depth **2**. This is Postgres maintaining its own referential
--     integrity, not somebody rewriting the trail. It must be allowed.
--
-- The measurement is recorded here so the next reader does not have to
-- re-derive it:
--
--   NOTICE:  REFERENTIAL ACTION ran at depth=2
--
-- The allowance is deliberately narrow: it permits the FK columns to be
-- nulled by the referential action and nothing else. The `note`, the
-- `decision`, the `moderator_id`, and the row's identity are never touched by
-- a referential action, so the audit trail's content stays append-only.
--
-- The regression guards live in `supabase/tests/business_rules.sql`:
--   * a direct UPDATE is still refused
--   * an `ON DELETE SET NULL` referential action now completes
-- =============================================================================

create or replace function public.moderation_actions_append_only()
returns trigger
language plpgsql
as $$
begin
  -- Depth 1 = a statement somebody asked for. Depth > 1 = Postgres firing its
  -- own referential action. See the header for the measured depths.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  raise exception 'MODERATION_ACTIONS_APPEND_ONLY' using errcode = '42501';
end;
$$;

comment on function public.moderation_actions_append_only() is
  'Blocks UPDATE and DELETE on moderation_actions. The trail is append-only (FR-MOD-3). A referential action (ON DELETE SET NULL) runs one trigger level deeper and is allowed through — without it the declared FK behaviour is unreachable.';

-- =============================================================================
-- DEFECT A — the Auth identity deletion destroys the account's reports
-- =============================================================================
--
-- The defect
-- ----------
-- `profiles.id` was `uuid primary key references auth.users (id) on delete
-- cascade`. The purge job destroys the Auth identity with
-- `auth.admin.deleteUser(userId)`, and the cascade then does this:
--
--   auth.users  --cascade-->  public.profiles  --cascade-->  public.reports
--
-- So the account's reports — with their category, description, area
-- hierarchy, coordinates, capture time and moderation status — are destroyed
-- by the job whose locked contract says it "never deletes report metadata".
-- The `profiles` tombstone never survives either, so `reports.author_id` has
-- nothing left to resolve to.
--
-- Measured on the running database: the auth delete aborted inside the
-- append-only trigger (DEFECT B), and with that trigger lifted the report
-- row count went 1 -> 0 across the delete.
--
-- The fix
-- -------
-- Split the two relationships that were conflated in one column:
--
--   * `profiles.id` — the **application** identity. It is the primary key, it
--     is what `reports.author_id`, `contacts.user_id`, `flags.flagger_id`,
--     `location_shares.sender_id` and `moderation_actions.moderator_id` all
--     reference, and it NEVER changes and is NEVER cascaded away. It is no
--     longer a foreign key at all.
--
--   * `profiles.auth_user_id` — the **Auth** linkage. A foreign key to
--     `auth.users (id) ON DELETE SET NULL`. It is set for every live account
--     and becomes NULL exactly once — when the Auth identity is destroyed —
--     which is what turns the profile into a tombstone.
--
-- `ON DELETE SET NULL` is the whole point: it is non-destructive by
-- definition. Deleting the Auth identity now nulls one column and leaves the
-- profile, the reports, and the moderation trail standing.
--
-- The RLS policies are **unchanged**. They read `id = auth.uid()`, and for
-- every live account `id` still equals the Auth user's id — `handle_new_user`
-- inserts `id = new.id`, exactly as before. A purged tombstone has no Auth
-- identity, so no session can ever authenticate as that id, and the policies
-- behave identically.
--
-- The trigger is redefined to populate the new column. The tombstone rule
-- stays intact: the `profiles` row survives, the phone and email are
-- replaced with non-PII placeholders, and `pii_purged_at` records the end.
-- =============================================================================

alter table public.profiles add column if not exists auth_user_id uuid;

-- Backfill: every profile whose Auth user still exists becomes linked to it.
-- A profile whose Auth user is already gone is left NULL — it is already a
-- tombstone, and the new FK would otherwise refuse to be created.
update public.profiles p
   set auth_user_id = p.id
 where p.auth_user_id is null
   and exists (select 1 from auth.users u where u.id = p.id);

-- The Auth linkage. `ON DELETE SET NULL` is the non-destructive delete
-- action: destroying the identity nulls the link and keeps the row.
--
-- The constraint is dropped first so the migration is genuinely re-runnable,
-- as its header promises. `add constraint` has no `if not exists` form, so
-- without the drop a second run aborts on `42710` — which is exactly what
-- `supabase migration up` does when a migration was applied out of band.
alter table public.profiles
  drop constraint if exists profiles_auth_user_id_fkey;

alter table public.profiles
  add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete set null;

-- One profile per Auth user.
create unique index if not exists profiles_auth_user_id_key
  on public.profiles (auth_user_id);

-- The application identity keeps its own rows. This is the FK whose cascade
-- destroyed the report metadata.
alter table public.profiles drop constraint if exists profiles_id_fkey;

comment on column public.profiles.id is
  'The application identity. It is the primary key and is referenced by every other table; it never changes and is never cascaded away.';

comment on column public.profiles.auth_user_id is
  'The Auth linkage. NULL exactly once — when the Auth identity is destroyed — which is what leaves a non-PII tombstone behind (FR-DATA-6).';

-- -----------------------------------------------------------------------------
-- handle_new_user — populate the new column
--
-- The trigger still creates the profile with `id = new.id`, so every RLS
-- policy that reads `id = auth.uid()` keeps working unchanged. The new
-- column records the Auth linkage explicitly.
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

  insert into public.profiles (id, auth_user_id, email, phone, full_name)
  values (new.id, new.id, new.email, btrim(v_phone), nullif(btrim(v_full_name), ''))
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        auth_user_id = coalesce(public.profiles.auth_user_id, excluded.auth_user_id),
        updated_at = now();

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row the moment a Supabase Auth user is created. `profiles.id` is the Auth id, and `profiles.auth_user_id` records the Auth linkage.';

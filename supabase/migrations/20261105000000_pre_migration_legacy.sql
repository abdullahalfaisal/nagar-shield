-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 000_pre_migration_legacy.sql
--
-- Two jobs, in order:
--
--   1. Rescue the legacy dev schema. The local dev database was created
--      before the canonical migrations existed and carries a hand-made schema
--      with a different shape:
--        * `flags.reason` / `profiles.role` / `reports.*` are `text`, not enums
--        * `reports.media_uri` instead of `storage_path` + `media_type`
--        * `reports.area_hierarchy` jsonb instead of four `area_*` columns
--        * `profiles` is missing `full_name`, `alternate_phone`, `biometric_*`
--
--      Those legacy tables are renamed to `*_legacy`, NOT dropped.
--      `004_legacy_data_backfill.sql` copies whatever still applies across.
--
--   2. Drop the canonical objects so `001`–`003` are re-runnable. A fresh
--      clone runs `supabase db reset` repeatedly; every canonical object must
--      go first so the migrations never fail on "already exists".
--
-- The order matters: the rescue runs FIRST. Dropping `public.profiles`
-- before the rescue would delete the legacy table instead of renaming it,
-- and the legacy rows would be lost.
--
-- `auth.users` is never touched — the seeded accounts survive untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rescue the legacy dev schema.
--
-- A table is "legacy" when it lacks a column the canonical schema requires.
-- The rename is conditional so re-running the migration is harmless.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reports' and c.relkind = 'r'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'client_request_id'
  ) then
    execute 'alter table public.reports rename to reports_legacy';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'flags' and c.relkind = 'r'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'flags' and column_name = 'reason'
      and udt_name = 'flag_reason'
  ) then
    execute 'alter table public.flags rename to flags_legacy';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'moderation_actions' and c.relkind = 'r'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'moderation_actions' and column_name = 'target_user_id'
  ) then
    execute 'alter table public.moderation_actions rename to moderation_actions_legacy';
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and c.relkind = 'r'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'biometric_fail_count'
  ) then
    execute 'alter table public.profiles rename to profiles_legacy';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Drop the canonical objects so 001-003 are idempotent.
-- -----------------------------------------------------------------------------

-- Views first (they depend on the tables).
drop view if exists public.alerts_feed cascade;

-- Functions next (they may reference the tables).
--
-- The signatures name enum types, so a plain `drop function` would fail to
-- parse on a database where the enum does not exist yet. A dynamic
-- `to_regprocedure` lookup resolves the signature only when it is present.
do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.server_side_write(text)',
    'public.flag_report(uuid, public.flag_reason)',
    'public.finalize_capture(uuid, text, public.media_type, bigint, double precision, integer, integer, double precision, double precision, timestamptz, text, public.public_visibility, public.report_category)',
    'public.reverse_geocode(double precision, double precision)',
    'public.moderation_decide(uuid, text, text)',
    'public.disable_user(uuid, text)',
    'public.set_updated_at()',
    'public.is_moderator()',
    'public.profiles_update_guard()',
    'public.reports_update_guard()',
    'public.handle_new_user()',
    'public.geocode_key(double precision, double precision)',
    'public.update_category(uuid, public.report_category)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute format('drop function %s cascade', v_signature);
    end if;
  end loop;
end
$$;

drop table if exists public.job_runs cascade;
drop table if exists public.wrong_number_reports cascade;
drop table if exists public.hotlines cascade;
drop table if exists public.stations cascade;
drop table if exists public.geocode_cache cascade;
drop table if exists public.area_lookup cascade;
drop table if exists public.location_shares cascade;
drop table if exists public.moderation_actions cascade;
drop table if exists public.flags cascade;
drop table if exists public.report_media cascade;
drop table if exists public.reports cascade;
drop table if exists public.contacts cascade;
drop table if exists public.profiles cascade;

-- Enums.
drop type if exists public.location_share_mode cascade;
drop type if exists public.share_channel cascade;
drop type if exists public.contact_group cascade;
drop type if exists public.station_type cascade;
drop type if exists public.media_type cascade;
drop type if exists public.geocode_source cascade;
drop type if exists public.app_role cascade;
drop type if exists public.public_visibility cascade;
drop type if exists public.hide_reason cascade;
drop type if exists public.moderation_decision cascade;
drop type if exists public.moderation_status cascade;
drop type if exists public.flag_reason cascade;
drop type if exists public.report_category cascade;

-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/schema_contract.sql
--
-- A structural contract test. It asserts the SHAPE of the schema that the
-- clients and the Edge Functions depend on — the table set, the RLS posture,
-- the public projection's privacy guarantee, and the presence of every RPC
-- the app calls.
--
-- It is deliberately separate from `business_rules.sql` and `read_models.sql`:
-- those test behaviour, this one tests the contract that a drift in a
-- migration would break before any behaviour test could catch it.
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/schema_contract.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- The tables the product is built on.
-- -----------------------------------------------------------------------------

create temporary table expected_tables (name text primary key) on commit drop;

insert into expected_tables (name)
values
  ('profiles'),
  ('contacts'),
  ('reports'),
  ('report_media'),
  ('flags'),
  ('moderation_actions'),
  ('location_shares'),
  ('area_lookup'),
  ('geocode_cache'),
  ('stations'),
  ('hotlines'),
  ('wrong_number_reports'),
  ('job_runs'),
  ('alerts_feed');

select 'Contract 1a: every expected table exists' as test,
       not exists (
         select 1
         from expected_tables e
         where not exists (
           select 1 from information_schema.tables t
           where t.table_schema = 'public' and t.table_name = e.name
         )
       ) as passed;

-- -----------------------------------------------------------------------------
-- Every table is RLS-enabled. A table without RLS is readable by `anon`.
--
-- `spatial_ref_sys` is excluded: it is owned by the PostGIS extension, not by
-- the application, and the extension manages its own grants.
-- -----------------------------------------------------------------------------

select 'Contract 1b: every application table is RLS-enabled' as test,
       not exists (
         select 1
         from information_schema.tables t
         where t.table_schema = 'public'
           and t.table_type = 'BASE TABLE'
           and t.table_name <> 'spatial_ref_sys'
           and not exists (
             select 1 from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relname = t.table_name
               and c.relrowsecurity
           )
       ) as passed;

-- -----------------------------------------------------------------------------
-- The public projection carries no `author_id` — the column is absent, not
-- nulled (FR-DATA-3 / FR-NG-5).
-- -----------------------------------------------------------------------------

select 'Contract 2a: the alerts_feed view omits author_id' as test,
       not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'alerts_feed'
           and column_name = 'author_id'
       ) as passed;

-- The area hierarchy is ONE jsonb document, not four columns.
select 'Contract 2b: reports.area_hierarchy is a jsonb document' as test,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'reports'
           and column_name = 'area_hierarchy'
           and data_type = 'jsonb'
       )
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'reports'
           and column_name in ('area_division', 'area_city', 'area_thana', 'area_neighborhood')
       ) as passed;

-- The media lives in its own table so the 90-day purge can delete the bytes
-- while the report metadata survives (FR-DATA-4).
select 'Contract 2c: the media lives in report_media, not on reports' as test,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'report_media'
           and column_name = 'purged_at'
       )
       and not exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'reports'
           and column_name in ('storage_path', 'media_type', 'byte_size', 'media_uri')
       ) as passed;

-- -----------------------------------------------------------------------------
-- Every RPC the app calls exists with the expected argument names.
-- -----------------------------------------------------------------------------

create temporary table expected_rpcs (
  name text primary key,
  args text not null
) on commit drop;

insert into expected_rpcs (name, args)
values
  ('resolve_login_identifier', 'p_identifier text'),
  ('alerts_feed', 'p_division text, p_city text, p_thana text, p_neighborhood text, p_cursor text, p_limit integer'),
  ('history_nearby', 'p_lat double precision, p_lng double precision, p_radius_km numeric, p_window_hours integer, p_category report_category, p_cursor text, p_limit integer'),
  ('moderation_queue', 'p_cursor text, p_limit integer'),
  ('record_biometric_attempt', 'p_success boolean'),
  ('soft_delete_account', ''),
  ('restore_account', ''),
  ('finalize_capture', 'p_client_request_id uuid, p_storage_path text, p_media_type media_type, p_byte_size bigint, p_duration_seconds double precision, p_width integer, p_height integer, p_lat double precision, p_lng double precision, p_captured_at timestamp with time zone, p_description text, p_public_visibility public_visibility, p_category report_category, p_area_hierarchy jsonb'),
  ('flag_report', 'p_report_id uuid, p_reason flag_reason'),
  ('moderation_decide', 'p_report_id uuid, p_decision text, p_note text'),
  ('disable_user', 'p_user_id uuid, p_note text'),
  ('update_category', 'p_report_id uuid, p_category report_category'),
  ('reverse_geocode', 'p_lat double precision, p_lng double precision'),
  ('nearest_thana', 'p_lat double precision, p_lng double precision, p_radius_km double precision'),
  ('job_purge_media_candidates', 'p_batch_size integer'),
  ('job_purge_deleted_accounts', 'p_batch_size integer'),
  ('job_geocode_cache_evictions', 'p_batch_size integer'),
  ('job_keep_project_awake_ping', ''),
  ('run_scheduled_job', 'p_job_name text'),
  ('refresh_job_schedules', '');

select 'Contract 3a: every expected RPC exists with the expected arguments' as test,
       not exists (
         select 1
         from expected_rpcs e
         where not exists (
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = e.name
             and pg_get_function_identity_arguments(p.oid) = e.args
         )
       ) as passed;

-- -----------------------------------------------------------------------------
-- The role check lives inside the function, not in the client. A citizen must
-- be refused by the DATABASE, so the function must be SECURITY DEFINER.
-- -----------------------------------------------------------------------------

select 'Contract 3b: moderation_queue is security definer' as test,
       exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'moderation_queue'
           and p.prosecdef
       ) as passed;

-- -----------------------------------------------------------------------------
-- The audit trail is append-only at the DATABASE level — a BEFORE UPDATE OR
-- DELETE trigger, so the service-role key cannot rewrite it either.
-- -----------------------------------------------------------------------------

select 'Contract 4a: moderation_actions has an append-only trigger' as test,
       exists (
         select 1
         from pg_trigger tg
         join pg_class c on c.oid = tg.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'moderation_actions'
           and not tg.tgisinternal
           and (
             tg.tgtype & 16 = 16  -- BEFORE UPDATE
             or tg.tgtype & 8 = 8  -- BEFORE DELETE
           )
       ) as passed;

-- -----------------------------------------------------------------------------
-- The private media bucket exists. A public bucket would leak every capture.
-- -----------------------------------------------------------------------------

select 'Contract 4b: the report-media bucket is private' as test,
       exists (
         select 1 from storage.buckets
         where id = 'report-media' and public = false
       ) as passed;

-- -----------------------------------------------------------------------------
-- The location-share audit trail is never exposed by a public read model.
-- -----------------------------------------------------------------------------

select 'Contract 4c: no public read model exposes location_shares' as test,
       not exists (
         select 1
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind in ('v', 'm')
           and pg_get_viewdef(c.oid) like '%location_shares%'
       ) as passed;

-- -----------------------------------------------------------------------------
-- The privileged write helper must not be reachable by a client key.
--
-- `server_side_write` is SECURITY DEFINER and executes a caller-supplied
-- statement. Postgres grants EXECUTE on a new function to PUBLIC by default,
-- so without an explicit REVOKE the **anon** key can run arbitrary SQL as the
-- table owner and bypass every RLS policy in the database. The regression
-- guard for that defect is `tools/probe-server-side-write.cjs`.
-- -----------------------------------------------------------------------------

select 'Contract 5a: server_side_write is not executable by anon or authenticated' as test,
       not exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'server_side_write'
           and (
             p.proacl @> ARRAY['=X/postgres']::aclitem[]
             or p.proacl @> ARRAY['anon=X/postgres']::aclitem[]
             or p.proacl @> ARRAY['authenticated=X/postgres']::aclitem[]
           )
       ) as passed;

select 'Contract 5b: server_side_write is executable by service_role' as test,
       exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'server_side_write'
           and p.proacl @> ARRAY['service_role=X/postgres']::aclitem[]
       ) as passed;

-- Every SECURITY DEFINER function in the public schema must carry an explicit
-- ACL — a function with a NULL `proacl` runs on Postgres's default grant to
-- PUBLIC, which is exactly what the defect above was.
select 'Contract 5c: every security definer function has an explicit acl' as test,
       not exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosecdef
           and p.proacl is null
       ) as passed;

-- -----------------------------------------------------------------------------
-- The scheduler is privileged. `run_scheduled_job` reads the service-role
-- credential out of the Vault and posts it to an Edge Function, so an anon
-- key must never be able to call it.
-- -----------------------------------------------------------------------------

select 'Contract 6a: the scheduler functions are not executable by anon or authenticated' as test,
       not exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('run_scheduled_job', 'refresh_job_schedules', 'job_keep_project_awake_ping')
           and (
             p.proacl @> ARRAY['=X/postgres']::aclitem[]
             or p.proacl @> ARRAY['anon=X/postgres']::aclitem[]
             or p.proacl @> ARRAY['authenticated=X/postgres']::aclitem[]
           )
       ) as passed;

select 'Contract 6b: the scheduler functions are executable by service_role' as test,
       not exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('run_scheduled_job', 'refresh_job_schedules', 'job_keep_project_awake_ping')
           and not (p.proacl @> ARRAY['service_role=X/postgres']::aclitem[])
       ) as passed;

-- The Vault holds the service-role key. No client role may read it.
select 'Contract 6c: no client role can read the vault' as test,
       not has_schema_privilege('anon', 'vault', 'usage')
       and not has_schema_privilege('authenticated', 'vault', 'usage') as passed;

-- Every job in the closed `job_runs.job_name` vocabulary has a declared
-- schedule, so a job can never be scheduled-but-undeclared or vice versa.
select 'Contract 6d: every scheduled job declares a cadence' as test,
       not exists (
         select 1
         from public.job_schedules s
         where s.job_name not in (
           'purge_media',
           'cleanup_geocode_cache',
           'purge_deleted_accounts',
           'keep_project_awake'
         )
       )
       and (select count(*) from public.job_schedules) = 4 as passed;

-- The cron expression must be a five-field expression.
select 'Contract 6e: every cron expression has five fields' as test,
       not exists (
         select 1
         from public.job_schedules
         where array_length(string_to_array(cron_expression, ' '), 1) <> 5
       ) as passed;

-- -----------------------------------------------------------------------------
-- The wrong-number report's shape.
--
-- `003-help-seek / 008-wrong-number-report`. Three properties the clients and
-- the curator's read path depend on:
--
--   * `reporter_id` is **nullable** — FR-SEEK-6 says "any user", so a
--     signed-out visitor's report must be accepted.
--   * `details` exists as its **own nullable column** — the fixed enum reason
--     and the citizen's free text are two fields, not one string.
--   * `status` uses the `pending` vocabulary — "not yet triaged" — and the
--     curator's closing states are `reviewed` and `rejected`.
-- -----------------------------------------------------------------------------

select 'Contract 7a: the wrong-number reporter is nullable' as test,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'wrong_number_reports'
           and column_name = 'reporter_id'
           and is_nullable = 'YES'
       ) as passed;

select 'Contract 7b: the wrong-number details are their own nullable column' as test,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'wrong_number_reports'
           and column_name = 'details'
           and is_nullable = 'YES'
       ) as passed;

select 'Contract 7c: the wrong-number status vocabulary is pending/reviewed/rejected' as test,
       exists (
         select 1
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public'
           and t.relname = 'wrong_number_reports'
           and c.contype = 'c'
           and c.conname = 'wrong_number_reports_status_check'
           and pg_get_constraintdef(c.oid) like '%pending%'
           and pg_get_constraintdef(c.oid) like '%reviewed%'
           and pg_get_constraintdef(c.oid) like '%rejected%'
       ) as passed;

-- The polymorphic entry reference is enforced by a trigger, because
-- `entry_id` is a plain `text` column that resolves against `stations.id` or
-- `hotlines.id` depending on `entry_type`.
select 'Contract 7d: the wrong-number entry integrity trigger exists' as test,
       exists (
         select 1 from pg_trigger tg
         join pg_class c on c.oid = tg.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'wrong_number_reports'
           and not tg.tgisinternal
           and tg.tgname = 'wrong_number_reports_entry_integrity'
       ) as passed;

rollback;

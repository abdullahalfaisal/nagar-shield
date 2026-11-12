-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 015_job_schedules.sql
--
-- The scheduler wiring for the four Edge Function jobs, plus the free-tier
-- heartbeat that keeps the project from pausing on inactivity
-- (NFR-Availability).
--
-- What this migration owns:
--   * `public.job_schedules` — the table that declares WHICH job runs on
--     WHICH cadence. The schedule lives in the database, not in a migration
--     comment and not in the operator's memory.
--   * `public.job_keep_project_awake_ping()` — the `select 1` the heartbeat
--     calls. A named function rather than a raw table read, so the heartbeat's
--     liveness check is a **function call** the database cannot optimise away
--     and cannot be satisfied from a cache.
--   * `public.run_scheduled_job(p_job_name)` — the single entry point the
--     scheduler calls. It resolves the job's function slug, reads the
--     service-role credential from the Vault, and issues the POST through
--     `pg_net`.
--   * `public.refresh_job_schedules()` — the idempotent reconciler that makes
--     `cron.job` match `public.job_schedules`.
--
-- Why the credential lives in the Vault and not in the migration:
--   * a migration is committed to the repository, and the service-role key is
--     a **server-side** secret that must never enter a repository, a mobile
--     bundle, an admin bundle, or a build artifact
--   * the Vault stores it encrypted on disk and decrypts it only at query
--     time, so a backup dump carries ciphertext
--   * the operator seeds it once, out of band:
--       select vault.create_secret('<service-role-key>', 'nagar_service_role_key');
--       select vault.create_secret('https://<project-ref>.supabase.co', 'nagar_project_url');
--     See `docs/operations/secrets.md`.
--
-- The Vault read is deliberately **not** reachable by a client key: the
-- `anon` and `authenticated` roles have no USAGE on the `vault` schema, and
-- the function that reads it is `SECURITY DEFINER` with an explicit
-- EXECUTE grant to `service_role` only.
--
-- The schedule is **reconciled**, never appended: `refresh_job_schedules()`
-- unschedules the existing `nagar-*` job by id before scheduling it again, so
-- running it twice leaves exactly the same rows. A migration that simply
-- called `cron.schedule(...)` would accumulate duplicate jobs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The extensions
--
-- `pg_cron` is the scheduler and `pg_net` is the HTTP client. Neither is
-- guaranteed to be installed on every project, and the hosted platform may
-- refuse the DDL, so the creation is guarded: a project without them keeps
-- the tables and the functions, and the operator schedules the jobs from the
-- dashboard instead.
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net is unavailable on this project; the scheduler will run in external-scheduler mode.';
  end;

  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is unavailable on this project; the scheduler will run in external-scheduler mode.';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. job_schedules — the declared cadence of every job
--
-- One row per job. `cron_expression` is the standard five-field cron
-- expression, and `enabled` is the kill switch: a disabled job keeps its
-- row (the declaration survives) but is never scheduled.
--
-- The cadences are the ones the unit brief fixes:
--
--   * `purge_media`             daily  — the 90-day window is long, and a
--                                    daily run keeps a missed purge recoverable
--                                    within a day
--   * `purge_deleted_accounts`  daily  — the 30-day recovery window is short
--   * `cleanup_geocode_cache`   weekly — the cache grows slowly and the
--                                    90-day TTL is forgiving
--   * `keep_project_awake`      every 6 hours — well inside the free tier's
--                                    inactivity-pause window
--
-- The minute offsets are deliberately not `0`: the jobs are spread across the
-- hour so they never pile onto the same minute and compete for the free
-- tier's Edge Function invocations.
-- -----------------------------------------------------------------------------

create table if not exists public.job_schedules (
  job_name text primary key
    check (job_name in (
      'purge_media',
      'cleanup_geocode_cache',
      'purge_deleted_accounts',
      'keep_project_awake'
    )),
  function_slug text not null,
  cron_expression text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.job_schedules is
  'The declared cadence of every scheduled job. Reconciled into cron.job by public.refresh_job_schedules().';

-- RLS is enabled with **no policy at all**. The table carries no secret — only
-- a job name, a function slug, and a cron expression — but the invariant is
-- that every application table is RLS-enabled, and a table with no policy is
-- readable by nobody: only the service-role key (which bypasses RLS) and the
-- `refresh_job_schedules()` function can touch it.
alter table public.job_schedules enable row level security;

insert into public.job_schedules (job_name, function_slug, cron_expression, enabled)
values
  ('purge_media', 'purge-media', '17 3 * * *', true),
  ('purge_deleted_accounts', 'purge-deleted-accounts', '23 3 * * *', true),
  ('cleanup_geocode_cache', 'cleanup-geocode-cache', '41 4 * * 0', true),
  ('keep_project_awake', 'keep-project-awake', '11 */6 * * *', true)
on conflict (job_name) do update
  set function_slug = excluded.function_slug,
      cron_expression = excluded.cron_expression,
      enabled = excluded.enabled,
      updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. job_keep_project_awake_ping — the liveness check
--
-- A `select 1` behind a function boundary. The heartbeat calls it, so the
-- project records an actual query execution, and the function is revoked
-- from every client role: the heartbeat reaches it with the service-role
-- key, and nothing else needs it.
-- -----------------------------------------------------------------------------

create or replace function public.job_keep_project_awake_ping()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select 1;
$$;

revoke execute on function public.job_keep_project_awake_ping() from public;
revoke execute on function public.job_keep_project_awake_ping() from anon;
revoke execute on function public.job_keep_project_awake_ping() from authenticated;
grant execute on function public.job_keep_project_awake_ping() to service_role;

comment on function public.job_keep_project_awake_ping() is
  'The heartbeat liveness check: a trivial query that proves the project is still serving (NFR-Availability).';

-- -----------------------------------------------------------------------------
-- 4. run_scheduled_job — the single scheduler entry point
--
-- The scheduler calls exactly this function. It:
--   1. resolves the job's function slug from `job_schedules` (an unknown or
--      disabled job raises — a typo must never become a silent no-op)
--   2. reads the project URL and the service-role key from the Vault
--   3. issues the POST through `pg_net`
--
-- `pg_net` returns a request id, not a response: the request is dispatched
-- after the transaction commits. The job's own `job_runs` row is the
-- authoritative record of whether the run succeeded.
--
-- The `search_path` is empty and every object is schema-qualified. A
-- SECURITY DEFINER function with an empty search_path cannot be hijacked by
-- a caller who controls the search path.
-- -----------------------------------------------------------------------------

create or replace function public.run_scheduled_job(p_job_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_slug text;
  v_project_url text;
  v_service_role_key text;
  v_request_id bigint;
begin
  select s.function_slug
    into v_function_slug
    from public.job_schedules s
   where s.job_name = p_job_name
     and s.enabled;

  if v_function_slug is null then
    raise exception 'JOB_NOT_SCHEDULED: %', p_job_name;
  end if;

  select decrypted_secret
    into v_project_url
    from vault.decrypted_secrets
   where name = 'nagar_project_url';

  if v_project_url is null then
    raise exception 'JOB_SECRET_MISSING: nagar_project_url';
  end if;

  select decrypted_secret
    into v_service_role_key
    from vault.decrypted_secrets
   where name = 'nagar_service_role_key';

  if v_service_role_key is null then
    raise exception 'JOB_SECRET_MISSING: nagar_service_role_key';
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/' || v_function_slug,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_service_role_key,
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    timeout_milliseconds := 30000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.run_scheduled_job(text) from public;
revoke execute on function public.run_scheduled_job(text) from anon;
revoke execute on function public.run_scheduled_job(text) from authenticated;
grant execute on function public.run_scheduled_job(text) to service_role;

comment on function public.run_scheduled_job(text) is
  'The single scheduler entry point: resolves the job slug, reads the service-role credential from the Vault, and POSTs to the Edge Function through pg_net.';

-- -----------------------------------------------------------------------------
-- 5. refresh_job_schedules — the idempotent reconciler
--
-- Makes `cron.job` match `public.job_schedules`:
--   * a job whose cron job is missing is scheduled
--   * a job whose cron job exists is **unscheduled and rescheduled**, so a
--     changed cadence takes effect and running this twice creates no
--     duplicates
--   * a job that is disabled is unscheduled and not rescheduled
--
-- It returns the number of jobs it scheduled, and it is a no-op on a
-- project without `pg_cron`.
-- -----------------------------------------------------------------------------

create or replace function public.refresh_job_schedules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_job_id bigint;
  v_scheduled integer := 0;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is not installed on this project; use an external scheduler against the same function URLs.';
    return 0;
  end if;

  -- A job that is no longer enabled must lose its cron entry.
  for v_row in
    select j.jobid
      from cron.job j
     where j.jobname like 'nagar-%'
       and not exists (
         select 1
           from public.job_schedules s
          where s.enabled
            and 'nagar-' || s.job_name = j.jobname
       )
  loop
    perform cron.unschedule(v_row.jobid);
  end loop;

  for v_row in
    select s.job_name, s.function_slug, s.cron_expression
      from public.job_schedules s
     where s.enabled
     order by s.job_name
  loop
    select j.jobid
      into v_job_id
      from cron.job j
     where j.jobname = 'nagar-' || v_row.job_name;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'nagar-' || v_row.job_name,
      v_row.cron_expression,
      format('select public.run_scheduled_job(%L);', v_row.job_name)
    );

    v_scheduled := v_scheduled + 1;
  end loop;

  return v_scheduled;
end;
$$;

revoke execute on function public.refresh_job_schedules() from public;
revoke execute on function public.refresh_job_schedules() from anon;
revoke execute on function public.refresh_job_schedules() from authenticated;
grant execute on function public.refresh_job_schedules() to service_role;

comment on function public.refresh_job_schedules() is
  'Reconciles cron.job with public.job_schedules. Idempotent: running it twice leaves the same rows.';

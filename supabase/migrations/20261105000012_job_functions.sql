-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000012_job_functions.sql
--
-- The database-side helpers the scheduled Edge Functions need.
--
-- Three things live here:
--
--   1. `finalize_capture` gains the server-resolved `area_hierarchy`. The
--      area is resolved by the Edge Function (area_lookup → geocode_cache →
--      online backup → degrade) and stored on the report. The report row's
--      `area_hierarchy` column is `NOT NULL` with a degraded default, so the
--      column can no longer be left to the default once the resolver exists.
--
--   2. The three candidate-selection RPCs. Each job's worklist is **derived,
--      never stored** — a stored queue would duplicate the age signal and
--      create a second source of truth for "what is expired".
--
--   3. Every one of them is `SECURITY DEFINER` with an **explicit** EXECUTE
--      grant to `service_role` only. The default Postgres grant to `PUBLIC`
--      is revoked — the same defect that the `server_side_write` fix
--      (migration 011) closed for the other privileged helper.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. finalize_capture — the server-resolved area hierarchy
--
-- The 13-argument version is dropped and replaced by a 14-argument one that
-- takes the server-resolved `area_hierarchy`. The old overload is dropped
-- rather than kept: a default argument on the new overload would make a
-- 13-argument call ambiguous, and Postgres would refuse to choose.
--
-- The area parameter is added at the end, after `p_category`, so the existing
-- positional callers keep working.
-- -----------------------------------------------------------------------------

drop function if exists public.finalize_capture(
  uuid, text, public.media_type, bigint, double precision, integer, integer,
  double precision, double precision, timestamptz, text, public.public_visibility,
  public.report_category
);

create or replace function public.finalize_capture(
  p_client_request_id uuid,
  p_storage_path text,
  p_media_type public.media_type,
  p_byte_size bigint,
  p_duration_seconds double precision,
  p_width integer,
  p_height integer,
  p_lat double precision,
  p_lng double precision,
  p_captured_at timestamptz,
  p_description text,
  p_public_visibility public.public_visibility,
  p_category public.report_category,
  p_area_hierarchy jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid := auth.uid();
  v_report_id uuid;
  v_area jsonb;
begin
  if v_author is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- Cap: 50 reports per day per author (FR-CAPTURE-3).
  if (select count(*) from public.reports
      where author_id = v_author and created_at > now() - interval '1 day') >= 50 then
    raise exception 'CAPTURE_RATE_LIMIT' using errcode = 'P0001';
  end if;

  -- Idempotent: an existing row for this client_request_id is returned as-is.
  select id into v_report_id
  from public.reports
  where author_id = v_author and client_request_id = p_client_request_id;

  if v_report_id is not null then
    return v_report_id;
  end if;

  -- The stored hierarchy is authoritative. A resolver that degraded still
  -- stores a complete document — `division` and `city` are always present,
  -- the thana may be null.
  v_area := coalesce(
    p_area_hierarchy,
    '{"division":"Dhaka","city":"Dhaka","thana":null,"neighborhood":null}'::jsonb
  );

  insert into public.reports (
    author_id, client_request_id, lat, lng, captured_at, description,
    category, public_visibility, area_hierarchy
  )
  values (
    v_author, p_client_request_id, p_lat, p_lng, p_captured_at, p_description,
    p_category, p_public_visibility, v_area
  )
  returning id into v_report_id;

  -- The media row is written in the same transaction as the report, so a
  -- report never exists without its media.
  insert into public.report_media (
    report_id, storage_path, media_type, byte_size, duration_seconds, width, height
  )
  values (
    v_report_id, p_storage_path, p_media_type, p_byte_size,
    p_duration_seconds, p_width, p_height
  );

  return v_report_id;
end;
$$;

revoke execute on function public.finalize_capture(
  uuid, text, public.media_type, bigint, double precision, integer, integer,
  double precision, double precision, timestamptz, text, public.public_visibility,
  public.report_category, jsonb
) from public;

grant execute on function public.finalize_capture(
  uuid, text, public.media_type, bigint, double precision, integer, integer,
  double precision, double precision, timestamptz, text, public.public_visibility,
  public.report_category, jsonb
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. job_purge_media_candidates — the 90-day media worklist
--
-- The candidate set is exactly:
--
--   SELECT rm.id, rm.storage_path, rm.byte_size
--   FROM report_media rm
--   JOIN reports r ON r.id = rm.report_id
--   WHERE rm.purged_at IS NULL
--     AND (rm.created_at < now() - interval '90 days' OR r.deleted_at IS NOT NULL)
--   ORDER BY rm.created_at ASC
--   LIMIT $batch_size;
--
-- `report_media.created_at` is indexed, so this is a single indexed range
-- scan. A withdrawn report's media is eligible **immediately** — the author
-- already asked us to remove it.
-- -----------------------------------------------------------------------------

create or replace function public.job_purge_media_candidates(p_batch_size integer)
returns table (
  id uuid,
  storage_path text,
  byte_size bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select rm.id, rm.storage_path, rm.byte_size
  from public.report_media rm
  join public.reports r on r.id = rm.report_id
  where rm.purged_at is null
    and (rm.created_at < now() - interval '90 days' or r.deleted_at is not null)
  order by rm.created_at asc
  limit greatest(1, least(coalesce(p_batch_size, 100), 500));
$$;

revoke execute on function public.job_purge_media_candidates(integer) from public;
grant execute on function public.job_purge_media_candidates(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 3. job_purge_deleted_accounts — the 30-day account PII worklist
--
-- The predicate is the whole story:
--
--   WHERE deleted_at < now() - interval '30 days' AND pii_purged_at IS NULL
--
-- The comparison is evaluated **server-side** by Postgres `now()`, so a
-- scheduler whose clock is behind can never shorten the recovery window.
-- -----------------------------------------------------------------------------

create or replace function public.job_purge_deleted_accounts(p_batch_size integer)
returns table (
  id uuid,
  deleted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.deleted_at
  from public.profiles p
  where p.deleted_at < now() - interval '30 days'
    and p.pii_purged_at is null
  order by p.deleted_at asc
  limit greatest(1, least(coalesce(p_batch_size, 100), 500));
$$;

revoke execute on function public.job_purge_deleted_accounts(integer) from public;
grant execute on function public.job_purge_deleted_accounts(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 4. job_geocode_cache_evictions — the 90-day cache worklist
--
-- The TTL is anchored on `created_at`, **not** `last_hit_at`: a hot entry
-- still expires at 90 days and is re-resolved once. That keeps the table's
-- growth bounded by the number of distinct coordinates seen in 90 days,
-- which is what keeps the 500 MB free-tier database budget honest.
-- -----------------------------------------------------------------------------

create or replace function public.job_geocode_cache_evictions(p_batch_size integer)
returns table (
  key text
)
language sql
stable
security definer
set search_path = public
as $$
  select gc.key
  from public.geocode_cache gc
  where gc.created_at < now() - interval '90 days'
  order by gc.created_at asc
  limit greatest(1, least(coalesce(p_batch_size, 500), 1000));
$$;

revoke execute on function public.job_geocode_cache_evictions(integer) from public;
grant execute on function public.job_geocode_cache_evictions(integer) to service_role;

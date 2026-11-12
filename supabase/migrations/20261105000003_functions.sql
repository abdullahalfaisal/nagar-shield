-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 003_functions.sql
--
-- Business rules live here, not in the client and not in RLS policies:
--   * `server_side_write`      — run a write with the client guards lifted
--   * `flag_report`            — 3-flag hide + 10/hour rate limit, in ONE transaction
--   * `finalize_capture`       — idempotent capture submission (offline-retry safe)
--   * `reverse_geocode`        — Dhaka-local first, online backup (waiver W-3)
--   * `nearest_thana`          — the nearest police station within 10 km → 999
--   * `moderation_decide`      — restore / remove + append-only audit row
--   * `disable_user`           — remote account disable + audit row
-- =============================================================================

-- -----------------------------------------------------------------------------
-- server_side_write
--
-- Runs a write statement with the client-facing update guards lifted.
--
-- The guards (`reports_update_guard`, `profiles_update_guard`) exist to stop
-- a user from editing columns they must not touch. They must not also stop
-- the server's own moderation writes, so those writes set the
-- `app.server_side_write` GUC for the duration of one statement.
--
-- The flag is ALWAYS cleared — including on the error path — so a later
-- statement in the same transaction is guarded again.
-- -----------------------------------------------------------------------------

create or replace function public.server_side_write(statement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.server_side_write', 'on', true);

  begin
    execute statement;
  exception when others then
    perform set_config('app.server_side_write', 'off', true);
    raise;
  end;

  perform set_config('app.server_side_write', 'off', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- flag_report
--
-- Order matters and runs in a single transaction:
--   1. rate limit — max 10 flags per hour per user
--   2. insert the flag (a repeat flag is a CONFLICT, not a second count)
--   3. 3 distinct flags on the report → hide it (flag_threshold)
--   4. 5 flags against the AUTHOR in 24 h → hide all their reports
--
-- Returns a JSON summary. Never raises for the business rules — the client
-- reads the returned status. A duplicate flag returns `duplicate`.
-- -----------------------------------------------------------------------------

create or replace function public.flag_report(
  p_report_id uuid,
  p_reason public.flag_reason
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flagger uuid := auth.uid();
  v_report record;
  v_flag_count integer;
  v_author_flags integer;
  v_hidden integer := 0;
  v_author_hidden integer := 0;
  v_rate_count integer;
begin
  if v_flagger is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- 1. Rate limit: 10 flags per hour.
  select count(*) into v_rate_count
  from public.flags
  where flagger_id = v_flagger
    and created_at > now() - interval '1 hour';

  if v_rate_count >= 10 then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_sec', 3600,
      'flag_count', v_rate_count
    );
  end if;

  select id, author_id, moderation_status into v_report
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A user cannot flag their own report.
  if v_report.author_id = v_flagger then
    return jsonb_build_object('status', 'own_report');
  end if;

  -- 2. Insert the flag. A repeat flag is a conflict — it does NOT count again.
  begin
    insert into public.flags (report_id, flagger_id, reason)
    values (p_report_id, v_flagger, p_reason);
  exception when unique_violation then
    return jsonb_build_object('status', 'duplicate');
  end;

  select count(*) into v_flag_count
  from public.flags
  where report_id = p_report_id;

  -- 3. Per-report threshold: 3 distinct flags → hide.
  if v_flag_count >= 3 and v_report.moderation_status = 'visible' then
    perform public.server_side_write(
      format(
        'update public.reports
           set moderation_status = ''hidden_pending_review'',
               hide_reason = ''flag_threshold''::public.hide_reason,
               updated_at = now()
         where id = %L and moderation_status = ''visible''',
        p_report_id
      )
    );

    v_hidden := 1;
  end if;

  -- 4. Author-level auto-hide: 5 flags against the author in 24 h.
  select count(*) into v_author_flags
  from public.flags f
  join public.reports r on r.id = f.report_id
  where r.author_id = v_report.author_id
    and f.created_at > now() - interval '24 hours';

  if v_author_flags >= 5 then
    perform public.server_side_write(
      format(
        'update public.reports
           set moderation_status = case
                 when moderation_status = ''visible''
                   then ''hidden_pending_review''::public.moderation_status
                 else moderation_status
               end,
               hide_reason = case
                 when hide_reason = ''flag_threshold''::public.hide_reason
                   then ''both''::public.hide_reason
                 when moderation_status = ''visible''
                   then ''author_auto_hide''::public.hide_reason
                 else hide_reason
               end,
               updated_at = now()
         where author_id = %L
           and (
             moderation_status = ''visible''
             or hide_reason = ''flag_threshold''::public.hide_reason
           )',
        v_report.author_id
      )
    );

    get diagnostics v_author_hidden = row_count;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'flag_count', v_flag_count,
    'report_hidden', v_hidden > 0,
    'author_flags_24h', v_author_flags,
    'author_reports_hidden', v_author_hidden
  );
end;
$$;

grant execute on function public.flag_report(uuid, public.flag_reason) to authenticated;

-- -----------------------------------------------------------------------------
-- finalize_capture
--
-- Idempotent by `(author_id, client_request_id)`. The offline queue can retry
-- a submit whose response was lost without creating a duplicate report.
--
-- The author can only update `category` afterwards (enforced by the
-- `reports_update_guard` trigger), so the visibility flag is fixed at creation.
-- -----------------------------------------------------------------------------

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
  p_category public.report_category
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid := auth.uid();
  v_report_id uuid;
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

  insert into public.reports (
    author_id, client_request_id, lat, lng, captured_at, description,
    category, public_visibility
  )
  values (
    v_author, p_client_request_id, p_lat, p_lng, p_captured_at, p_description,
    p_category, p_public_visibility
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

grant execute on function public.finalize_capture(
  uuid, text, public.media_type, bigint, double precision, integer, integer,
  double precision, double precision, timestamptz, text, public.public_visibility,
  public.report_category
) to authenticated;

-- -----------------------------------------------------------------------------
-- update_category — the author-only category edit (FR-CAPTURE-5)
--
-- The RLS trigger already restricts the author to the `category` column;
-- this RPC makes the intent explicit and returns a typed result.
-- -----------------------------------------------------------------------------

create or replace function public.update_category(
  p_report_id uuid,
  p_category public.report_category
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid := auth.uid();
begin
  if v_author is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.server_side_write(
    format(
      'update public.reports
         set category = %L::public.report_category, updated_at = now()
       where id = %L and author_id = %L',
      p_category, p_report_id, v_author
    )
  );

  return jsonb_build_object('report_id', p_report_id, 'category', p_category);
end;
$$;

grant execute on function public.update_category(uuid, public.report_category) to authenticated;

-- -----------------------------------------------------------------------------
-- reverse_geocode (waiver W-3 — Dhaka-local first)
--
-- Resolution order:
--   1. the exact rounded-coordinate cache hit
--   2. the nearest `area_lookup` centroid (the curated Dhaka-local table)
--   3. the nearest cached point within ~110 m
--   4. a degraded result with the coordinate only
--
-- The function NEVER makes a network call. The online Nominatim backup is
-- called by the Edge Function, which then writes the result into the cache.
-- -----------------------------------------------------------------------------

create or replace function public.reverse_geocode(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_key text := public.geocode_key(p_lat, p_lng);
begin
  -- 1. Exact cache hit.
  select * into v_row
  from public.geocode_cache
  where key = v_key
  limit 1;

  if found then
    return jsonb_build_object(
      'area_hierarchy', v_row.area_hierarchy,
      'source', v_row.source
    );
  end if;

  -- 2. The curated Dhaka-local table — the PRIMARY source.
  --
  -- The match is capped at `max_radius_km`. Without the cap the nearest
  -- centroid always wins, so a coordinate 200 km away would be labelled
  -- "Dhanmondi" — a fabricated address, which is exactly what the degraded
  -- path exists to avoid. A thana is roughly 5–7 km across, so 7 km is the
  -- widest match that is still truthful.
  select
    jsonb_build_object(
      'division', a.division,
      'city', a.city,
      'thana', a.thana,
      'neighborhood', a.neighborhood
    ) as area_hierarchy,
    'local'::public.geocode_source as source
  into v_row
  from public.area_lookup a
  where st_dwithin(
    a.centroid::geography,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    7000  -- 7 km
  )
  order by a.centroid <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  limit 1;

  if found then
    return jsonb_build_object(
      'area_hierarchy', v_row.area_hierarchy,
      'source', v_row.source
    );
  end if;

  -- 3. The nearest cached point within ~110 m.
  select * into v_row
  from public.geocode_cache
  where key like substr(v_key, 1, length(v_key) - 6) || '%'
  limit 1;

  if found then
    return jsonb_build_object(
      'area_hierarchy', v_row.area_hierarchy,
      'source', v_row.source
    );
  end if;

  -- 4. Degraded: the coordinate only. Never a fabricated street address.
  return jsonb_build_object(
    'area_hierarchy', jsonb_build_object(
      'division', null,
      'city', null,
      'thana', null,
      'neighborhood', null
    ),
    'source', 'degraded'
  );
end;
$$;

grant execute on function public.reverse_geocode(double precision, double precision)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- geocode_key — the rounded-coordinate cache key
-- -----------------------------------------------------------------------------

create or replace function public.geocode_key(p_lat double precision, p_lng double precision)
returns text
language sql
immutable
as $$
  select format(
    '%s_%s',
    round(p_lat::numeric, 3),
    round(p_lng::numeric, 3)
  );
$$;

grant execute on function public.geocode_key(double precision, double precision)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- nearest_thana
--
-- FR-SEEK-3: the nearest **active police station** within 10 km. When no
-- station falls inside the radius the call routes to **999** — the fallback
-- is returned as a row with `phone = '999'` and `fallback = true`, so the
-- client never has to re-derive the rule.
--
-- The distance is a straight-line haversine, computed in SQL so the 10 km
-- rule is enforced server-side rather than in the app.
-- -----------------------------------------------------------------------------

create or replace function public.nearest_thana(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10
)
returns table (
  id text,
  name text,
  name_bn text,
  phone text,
  distance_km double precision,
  fallback boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select
    s.id,
    s.name,
    s.name_bn,
    s.phone,
    round(
      (6371 * acos(
        least(1, greatest(-1,
          cos(radians(p_lat)) * cos(radians(s.lat))
          * cos(radians(s.lng) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(s.lat))
        )
      ))
    )::numeric, 3
    )::double precision as distance_km
  into v_row
  from public.stations s
  where s.station_type = 'police'
    and s.is_active
    and (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(p_lat)) * cos(radians(s.lat))
          * cos(radians(s.lng) - radians(p_lng))
          + sin(radians(p_lat)) * sin(radians(s.lat))
        ))
      )
    ) <= p_radius_km
  order by
    (6371 * acos(
      least(1, greatest(-1,
        cos(radians(p_lat)) * cos(radians(s.lat))
        * cos(radians(s.lng) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(s.lat))
      ))
    )) asc
  limit 1;

  if found then
    return query select v_row.id, v_row.name, v_row.name_bn, v_row.phone, v_row.distance_km, false;
    return;
  end if;

  -- No station inside the radius → route to 999.
  return query
    select null::text, null::text, null::text, '999'::text, null::double precision, true;
end;
$$;

grant execute on function public.nearest_thana(double precision, double precision, double precision)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- moderation_decide
--
-- restore / remove + an append-only audit row. A note is mandatory (FR-MOD-3).
-- The audit row is written in the same transaction as the decision.
-- -----------------------------------------------------------------------------

create or replace function public.moderation_decide(
  p_report_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator uuid := auth.uid();
  v_report record;
begin
  if v_moderator is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_note is null or char_length(btrim(p_note)) = 0 then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;

  if p_decision not in ('restore', 'remove') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_decision = 'restore' then
    perform public.server_side_write(
      format(
        'update public.reports
           set moderation_status = ''restored'', hide_reason = null, updated_at = now()
         where id = %L',
        p_report_id
      )
    );
  else
    perform public.server_side_write(
      format(
        'update public.reports
           set moderation_status = ''removed'', updated_at = now()
         where id = %L',
        p_report_id
      )
    );
  end if;

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (p_report_id, v_moderator, v_report.author_id, p_decision::public.moderation_decision, p_note);

  return jsonb_build_object('status', 'ok', 'report_id', p_report_id, 'decision', p_decision);
end;
$$;

grant execute on function public.moderation_decide(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- disable_user
--
-- Disables the account and writes the audit row in one transaction.
-- A moderator cannot disable themselves.
-- -----------------------------------------------------------------------------

create or replace function public.disable_user(p_user_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator uuid := auth.uid();
begin
  if v_moderator is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_user_id = v_moderator then
    raise exception 'CANNOT_DISABLE_SELF' using errcode = '22023';
  end if;

  if p_note is null or char_length(btrim(p_note)) = 0 then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;

  perform public.server_side_write(
    format(
      'update public.profiles
         set disabled_at = now(), updated_at = now()
       where id = %L and disabled_at is null',
      p_user_id
    )
  );

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (null, v_moderator, p_user_id, 'disable_user', p_note);

  return jsonb_build_object('status', 'ok', 'user_id', p_user_id);
end;
$$;

grant execute on function public.disable_user(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

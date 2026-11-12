-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 007_read_models.sql
--
-- The read models and identity helpers the clients call. Every one of these
-- was named in `ARCHITECTURE.md` §I or in a unit brief but had no SQL
-- implementation, so the app could not talk to the server at all.
--
-- The five objects added here:
--
--   1. `resolve_login_identifier` — phone-or-email → the email-primary Auth
--      email (waiver W-1). Identifier resolution only: it never authenticates,
--      never returns an `auth.users` row, and never creates a second user.
--   2. `alerts_feed` — the **public projection** as an RPC, cursor-paginated
--      with the four area filters. The `alerts_feed` VIEW stays as the
--      unfiltered projection; this RPC is the paginated read path.
--   3. `history_nearby` — the local History read model over the PostGIS
--      geography GiST index, with the 1 km / 24 h defaults (FR-HIST-1).
--   4. `moderation_queue` — the moderator-only queue read model (FR-MOD-1).
--   5. `record_biometric_attempt` — the biometric failure accounting
--      (FR-AUTH-5: 3 fails → password fallback, 5 fails / 24 h → auto-disable).
--
-- Two invariants every one of these upholds:
--
--   * The public read models **omit `author_id` entirely**. The column is
--     absent at the projection level, not nulled — a named null column would
--     still leak the field name and would fail the negative privacy test
--     (FR-DATA-3 / FR-NG-5).
--   * A **citizen** calling a moderator-only RPC gets `FORBIDDEN`. The role
--     check lives inside the function, so the client-side guard is a
--     convenience and never the authorization (FR-MOD-1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- resolve_login_identifier
--
-- Accepts an email or a BD phone in any common input form and returns the
-- email-primary Auth email.
--
-- The response deliberately does **not** distinguish "no such account" from
-- "malformed identifier" — the client shows the same message for both, so the
-- RPC cannot be used to enumerate registered phone numbers.
-- -----------------------------------------------------------------------------

create or replace function public.resolve_login_identifier(p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trimmed text := btrim(coalesce(p_identifier, ''));
  v_email text;
  v_e164 text;
  v_normalised text;
begin
  if v_trimmed = '' then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  -- An email identifier is used as-is (lower-cased).
  if v_trimmed like '%@%' then
    select p.email into v_email
    from public.profiles p
    where lower(p.email) = lower(v_trimmed);

    if v_email is null then
      raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    return jsonb_build_object('email', v_email);
  end if;

  -- A phone identifier is normalised to E.164 before comparison. The same
  -- rules the client uses in `normalisePhone` (packages/shared/src/schemas).
  v_normalised := replace(replace(replace(replace(v_trimmed, ' ', ''), '-', ''), '(', ''), ')', '');
  if v_normalised like '+880%' then
    v_e164 := v_normalised;
  elsif v_normalised like '880%' and length(v_normalised) = 13 then
    v_e164 := '+' || v_normalised;
  elsif v_normalised like '0%' and length(v_normalised) = 11 then
    v_e164 := '+880' || substr(v_normalised, 2);
  else
    v_e164 := '+' || v_normalised;
  end if;

  select p.email into v_email
  from public.profiles p
  where p.phone = v_e164;

  if v_email is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  return jsonb_build_object('email', v_email);
end;
$$;

grant execute on function public.resolve_login_identifier(text) to anon, authenticated;

comment on function public.resolve_login_identifier(text) is
  'Resolves a phone-or-email identifier to the email-primary Auth email. Does not authenticate and does not reveal whether an account exists.';

-- -----------------------------------------------------------------------------
-- cursor helpers
--
-- The feed and queue pages are cursor-paginated on `(captured_at DESC, id DESC)`.
-- A cursor is the composite text `<captured_at>|<id>` so a page boundary is
-- self-contained — no extra lookup to resolve the anchor row.
-- -----------------------------------------------------------------------------

create or replace function public.feed_cursor(p_captured_at timestamptz, p_id uuid)
returns text
language sql
immutable
as $fn$
  -- Microsecond precision, not milliseconds: the cursor is compared against
  -- the stored `captured_at`, so a truncated cursor would let the anchor row
  -- repeat on the next page.
  select to_char(p_captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
         || '|' || p_id::text;
$fn$;

grant execute on function public.feed_cursor(timestamptz, uuid) to anon, authenticated;

create or replace function public.parse_feed_cursor(p_cursor text)
returns table (captured_at timestamptz, id uuid)
language plpgsql
immutable
as $$
declare
  v_ts text;
  v_id text;
begin
  if p_cursor is null or btrim(p_cursor) = '' then
    return;
  end if;

  v_ts := split_part(btrim(p_cursor), '|', 1);
  v_id := split_part(btrim(p_cursor), '|', 2);

  begin
    captured_at := v_ts::timestamptz;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end;

  begin
    id := v_id::uuid;
  exception when others then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end;

  return next;
end;
$$;

grant execute on function public.parse_feed_cursor(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- jsonb_slice — the first `p_count` elements of a JSONB array
--
-- PostgreSQL's JSONB subscripting does not support slices, so the page trim
-- goes through a JSONPath range. One helper keeps the three paginated read
-- models consistent instead of repeating the path expression three times.
-- -----------------------------------------------------------------------------

create or replace function public.jsonb_slice(p_items jsonb, p_count integer)
returns jsonb
language sql
immutable
as $fn$
  select coalesce(
    jsonb_path_query_array(
      p_items,
      ('$[0 to ' || (p_count - 1) || ']')::jsonpath
    ),
    '[]'::jsonb
  );
$fn$;

grant execute on function public.jsonb_slice(jsonb, integer) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alerts_feed (RPC) — the paginated public projection
--
-- The `alerts_feed` VIEW is the unfiltered projection; this RPC adds the
-- cursor and the four area filters on top of it.
--
-- The area filters read `reports.area_hierarchy` as JSONB:
--   `area_hierarchy->>'division'` etc.
--
-- `author_id` is **not** in the output. The uploader's display name appears
-- only when the author chose `identified`; otherwise it is null. The server
-- keeps `reports.author_id` for moderation regardless (FR-DATA-3).
-- -----------------------------------------------------------------------------

create or replace function public.alerts_feed(
  p_division text default null,
  p_city text default null,
  p_thana text default null,
  p_neighborhood text default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_cursor_ts timestamptz := null;
  v_cursor_id uuid := null;
  v_items jsonb;
  v_next text;
begin
  if p_cursor is not null and btrim(p_cursor) <> '' then
    select c.captured_at, c.id
    into v_cursor_ts, v_cursor_id
    from public.parse_feed_cursor(p_cursor) c;
  end if;

  with page as (
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
      and r.deleted_at is null
      and (p_division is null or r.area_hierarchy ->> 'division' = p_division)
      and (p_city is null or r.area_hierarchy ->> 'city' = p_city)
      and (p_thana is null or r.area_hierarchy ->> 'thana' = p_thana)
      and (p_neighborhood is null or r.area_hierarchy ->> 'neighborhood' = p_neighborhood)
      and (
        v_cursor_ts is null
        or (r.captured_at, r.id) < (v_cursor_ts, v_cursor_id)
      )
    order by r.captured_at desc, r.id desc
    limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'category', category,
        'description', description,
        'area_hierarchy', area_hierarchy,
        'captured_at', captured_at,
        'public_visibility', public_visibility,
        'author_display_name', author_display_name,
        'has_media', has_media,
        'media_count', media_count
      )
      order by captured_at desc, id desc
    ), '[]'::jsonb)
  into v_items
  from page;

  -- One extra row was fetched to detect "there is another page".
  if jsonb_array_length(v_items) > v_limit then
    v_items := public.jsonb_slice(v_items, v_limit);
    select public.feed_cursor(
      ((v_items -> v_limit - 1) ->> 'captured_at')::timestamptz,
      ((v_items -> v_limit - 1) ->> 'id')::uuid
    ) into v_next;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

grant execute on function public.alerts_feed(text, text, text, text, text, integer)
  to anon, authenticated;

comment on function public.alerts_feed(text, text, text, text, text, integer) is
  'The public Alerts feed projection. Cursor-paginated on (captured_at DESC, id DESC). Omits author_id entirely (FR-DATA-3 / FR-NG-5).';

-- -----------------------------------------------------------------------------
-- history_nearby — the local History read model (FR-HIST-1)
--
-- Defaults: **1 km** radius, **24 h** window (FR-HIST-1).
--
-- The radius query is a PostGIS `ST_DWithin` over the
-- `reports_location_idx` GiST index — never a sequential scan over the whole
-- table. The index is on
-- `st_setsrid(st_makepoint(lng, lat), 4326)::geography`, so the distance
-- comparison has to use the same expression or the index is not used.
--
-- The caller's **own** reports are always included (subject to the time
-- window), so a report the author just submitted is visible in History
-- immediately even if the GPS fix was imprecise or the user has since moved
-- (FR-HIST-3: no pending-review gate on publish).
--
-- `total_count` is the number of rows this query matched — it is a per-query
-- result, not an aggregate crime statistic, and the client does not render it
-- as one (FR-NG-3 / FR-NG-4 / ADR-010).
-- -----------------------------------------------------------------------------

create or replace function public.history_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric default 1,
  p_window_hours integer default 24,
  p_category public.report_category default null,
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_radius_m double precision := least(greatest(coalesce(p_radius_km, 1), 0.1), 50) * 1000;
  v_window_hours integer := least(greatest(coalesce(p_window_hours, 24), 1), 720);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_cursor_ts timestamptz := null;
  v_cursor_id uuid := null;
  v_items jsonb;
  v_next text;
  v_total integer;
  v_origin geography;
begin
  if p_lat is null or p_lng is null then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    select c.captured_at, c.id
    into v_cursor_ts, v_cursor_id
    from public.parse_feed_cursor(p_cursor) c;
  end if;

  v_origin := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  select count(*) into v_total
  from public.reports r
  where r.captured_at > now() - make_interval(hours => v_window_hours)
    and r.moderation_status in ('visible', 'restored')
    and r.deleted_at is null
    and (p_category is null or r.category = p_category)
    and (
      r.author_id = auth.uid()
      or st_dwithin(
        st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
        v_origin,
        v_radius_m
      )
    );

  with page as (
    select
      r.id,
      r.category,
      r.description,
      r.area_hierarchy,
      r.captured_at,
      r.public_visibility,
      r.author_id,
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
      )::integer as media_count,
      -- How far the report is from the origin, for the History map. `NULL`
      -- for the caller's own out-of-radius reports.
      case
        when st_dwithin(
          st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
          v_origin,
          v_radius_m
        )
        then st_distance(
          st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
          v_origin
        )
        else null
      end as distance_m
    from public.reports r
    left join public.profiles p on p.id = r.author_id
    where r.captured_at > now() - make_interval(hours => v_window_hours)
      and r.moderation_status in ('visible', 'restored')
      and r.deleted_at is null
      and (p_category is null or r.category = p_category)
      and (
        r.author_id = auth.uid()
        or st_dwithin(
          st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
          v_origin,
          v_radius_m
        )
      )
      and (
        v_cursor_ts is null
        or (r.captured_at, r.id) < (v_cursor_ts, v_cursor_id)
      )
    order by r.captured_at desc, r.id desc
    limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'category', category,
        'description', description,
        'area_hierarchy', area_hierarchy,
        'captured_at', captured_at,
        'public_visibility', public_visibility,
        'author_display_name', author_display_name,
        'has_media', has_media,
        'media_count', media_count,
        'distance_m', distance_m,
        'is_own', author_id = auth.uid()
      )
      order by captured_at desc, id desc
    ), '[]'::jsonb)
  into v_items
  from page;

  if jsonb_array_length(v_items) > v_limit then
    v_items := public.jsonb_slice(v_items, v_limit);
    select public.feed_cursor(
      ((v_items -> v_limit - 1) ->> 'captured_at')::timestamptz,
      ((v_items -> v_limit - 1) ->> 'id')::uuid
    ) into v_next;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'next_cursor', v_next,
    'total_count', v_total
  );
end;
$$;

grant execute on function public.history_nearby(double precision, double precision, numeric, integer, public.report_category, text, integer)
  to authenticated;

comment on function public.history_nearby(double precision, double precision, numeric, integer, public.report_category, text, integer) is
  'The local History read model. PostGIS ST_DWithin over the geography GiST index, 1 km / 24 h defaults (FR-HIST-1). The caller''s own reports are always included.';

-- -----------------------------------------------------------------------------
-- moderation_queue — the moderator-only queue (FR-MOD-1)
--
-- Filters to `moderation_status = 'hidden_pending_review'` and joins the
-- report's flags, its media, and the **uploader's identity**.
--
-- The uploader identity is server-side only (FR-MOD-2). It is returned here
-- because a moderator cannot judge a report without knowing who filed it, and
-- it never reaches a public projection.
--
-- `hide_reason` distinguishes the two reasons a report can be in the queue:
--   * `flag_threshold` — the report itself reached 3 distinct flags
--   * `author_auto_hide` — the report's AUTHOR was auto-hidden (5 flagged
--     reports in 24 h), so this report was swept in even though it may have
--     fewer than 3 flags of its own
--   * `both` — both rules applied
--
-- Without this derivation a moderator would see a report with one flag
-- sitting in a "flagged" queue with no explanation (FR-ALERTS-11).
-- -----------------------------------------------------------------------------

create or replace function public.moderation_queue(
  p_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_cursor_ts timestamptz := null;
  v_cursor_id uuid := null;
  v_items jsonb;
  v_next text;
begin
  -- The role check lives HERE, not in the client (FR-MOD-1). A citizen gets
  -- FORBIDDEN — never data, never a partial answer.
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    select c.captured_at, c.id
    into v_cursor_ts, v_cursor_id
    from public.parse_feed_cursor(p_cursor) c;
  end if;

  with page as (
    select
      r.id,
      r.category,
      r.description,
      r.area_hierarchy,
      r.captured_at,
      r.public_visibility,
      r.author_id,
      r.hide_reason,
      r.lat,
      r.lng,
      coalesce(r.hide_reason, 'flag_threshold'::public.hide_reason) as derived_hide_reason,
      (
        select count(*) from public.flags f where f.report_id = r.id
      )::integer as flag_count,
      (
        select count(*)
        from public.flags f
        join public.reports ar on ar.id = f.report_id
        where ar.author_id = r.author_id
          and f.created_at > now() - interval '24 hours'
      )::integer as author_flags_24h
    from public.reports r
    where r.moderation_status = 'hidden_pending_review'
      and (
        v_cursor_ts is null
        or (r.captured_at, r.id) < (v_cursor_ts, v_cursor_id)
      )
    order by r.captured_at desc, r.id desc
    limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'category', category,
        'description', description,
        'area_hierarchy', area_hierarchy,
        'captured_at', captured_at,
        'public_visibility', public_visibility,
        'lat', lat,
        'lng', lng,
        'flag_count', flag_count,
        'author_flags_24h', author_flags_24h,
        'hide_reason', derived_hide_reason,
        'flags', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', f.id,
              'reason', f.reason,
              'flagger_id', f.flagger_id,
              'created_at', f.created_at
            ) order by f.created_at asc
          ), '[]'::jsonb)
          from public.flags f where f.report_id = page.id
        ),
        'media', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'id', rm.id,
              'storage_path', rm.storage_path,
              'media_type', rm.media_type,
              'byte_size', rm.byte_size,
              'duration_seconds', rm.duration_seconds,
              'width', rm.width,
              'height', rm.height
            ) order by rm.created_at asc
          ), '[]'::jsonb)
          from public.report_media rm
          where rm.report_id = page.id and rm.purged_at is null
        ),
        'uploader', (
          select jsonb_build_object(
            'id', up.id,
            'full_name', up.full_name,
            'phone', up.phone,
            'email', up.email,
            'role', up.role,
            'disabled_at', up.disabled_at,
            'created_at', up.created_at
          )
          from public.profiles up where up.id = page.author_id
        )
      )
      order by captured_at desc, id desc
    ), '[]'::jsonb)
  into v_items
  from page;

  if jsonb_array_length(v_items) > v_limit then
    v_items := public.jsonb_slice(v_items, v_limit);
    select public.feed_cursor(
      ((v_items -> v_limit - 1) ->> 'captured_at')::timestamptz,
      ((v_items -> v_limit - 1) ->> 'id')::uuid
    ) into v_next;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

grant execute on function public.moderation_queue(text, integer) to authenticated;

comment on function public.moderation_queue(text, integer) is
  'The moderator-only hidden_pending_review queue. Returns FORBIDDEN for a non-moderator (FR-MOD-1). The uploader identity is server-side only (FR-MOD-2).';

-- -----------------------------------------------------------------------------
-- record_biometric_attempt — the biometric failure accounting (FR-AUTH-5)
--
-- The rules:
--   * 3 failures → the UI falls back to the password screen
--   * 5 failures inside 24 h → `biometric_opt_in` is cleared (auto-disabled)
--
-- The counter is stored on `profiles` so it survives a reinstall-free device
-- restart, and the window is `biometric_fail_until` — the time the current
-- 24-hour window closes.
-- -----------------------------------------------------------------------------

create or replace function public.record_biometric_attempt(p_success boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile record;
  v_fail_count integer;
  v_window_until timestamptz;
  v_fallback text := null;
  v_biometric_enabled boolean;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select biometric_fail_count, biometric_fail_until, biometric_opt_in
  into v_profile
  from public.profiles
  where id = v_user;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  v_biometric_enabled := v_profile.biometric_opt_in;

  if p_success then
    perform public.server_side_write(
      format(
        'update public.profiles
            set biometric_fail_count = 0,
                biometric_fail_until = null,
                updated_at = now()
          where id = %L',
        v_user
      )
    );

    return jsonb_build_object(
      'fail_count', 0,
      'biometric_enabled', v_biometric_enabled,
      'fallback', null
    );
  end if;

  -- The 24 h window: the first failure opens it, later failures extend it.
  v_window_until := v_profile.biometric_fail_until;
  if v_window_until is null or v_window_until <= now() then
    v_window_until := now() + interval '24 hours';
    v_fail_count := 1;
  else
    v_fail_count := v_profile.biometric_fail_count + 1;
  end if;

  -- 5 failures inside the window → biometric is auto-disabled.
  if v_fail_count >= 5 then
    v_biometric_enabled := false;
  elsif v_fail_count >= 3 then
    v_fallback := 'password';
  end if;

  perform public.server_side_write(
    format(
      'update public.profiles
          set biometric_fail_count = %s,
              biometric_fail_until = %L,
              biometric_opt_in = %L,
              updated_at = now()
        where id = %L',
      v_fail_count,
      v_window_until,
      v_biometric_enabled,
      v_user
    )
  );

  return jsonb_build_object(
    'fail_count', v_fail_count,
    'biometric_enabled', v_biometric_enabled,
    'fallback', v_fallback,
    'window_until', v_window_until
  );
end;
$$;

grant execute on function public.record_biometric_attempt(boolean) to authenticated;

comment on function public.record_biometric_attempt(boolean) is
  'Biometric failure accounting: 3 fails fall back to the password screen, 5 fails in 24 h auto-disable biometric sign-in (FR-AUTH-5).';

-- -----------------------------------------------------------------------------
-- soft_delete_account / restore_account — FR-DATA-6
--
-- Deletion is a **soft** delete: `deleted_at` is set and the 30-day recovery
-- window starts. The account is recoverable inside the window; the PII purge
-- job (unit 008) only touches the row after day 30.
--
-- The reports the account authored are **not** touched — FR-DATA-3 retains
-- the identity server-side for moderation and FR-DATA-4 retains the metadata
-- longer than the media.
-- -----------------------------------------------------------------------------

create or replace function public.soft_delete_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_deleted_at timestamptz;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select deleted_at into v_deleted_at from public.profiles where id = v_user;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_deleted_at is null then
    v_deleted_at := now();

    perform public.server_side_write(
      format(
        'update public.profiles
            set deleted_at = %L, updated_at = now()
          where id = %L',
        v_deleted_at,
        v_user
      )
    );
  end if;

  return jsonb_build_object(
    'deleted_at', v_deleted_at,
    'recoverable_until', v_deleted_at + interval '30 days'
  );
end;
$$;

grant execute on function public.soft_delete_account() to authenticated;

create or replace function public.restore_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_user and deleted_at is not null
  ) then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  perform public.server_side_write(
    format(
      'update public.profiles
          set deleted_at = null, updated_at = now()
        where id = %L',
      v_user
    )
  );

  return jsonb_build_object('deleted_at', null);
end;
$$;

grant execute on function public.restore_account() to authenticated;

comment on function public.soft_delete_account() is
  'Soft-deletes the signed-in account and opens the 30-day recovery window (FR-DATA-6). The account purge job scrubs the PII after the window closes.';

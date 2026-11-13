-- ---------------------------------------------------------------------------
-- 20261105000027_history_nearby_coordinates.sql
--
-- Story: `006-alerts / 008-history-map`
--
-- The History map renders the reports inside the **current filter set**. The
-- map needs each report's own coordinates to place its marker, and the read
-- model already computes them — it uses `st_setsrid(st_makepoint(r.lng, r.lat),
-- 4326)::geography` for the radius test and for `distance_m`.
--
-- The coordinates were simply not selected. This migration adds `lat` and
-- `lng` to the projection so the map needs **no second geometry query** —
-- AC: "The report's own coordinates come from the read model … no additional
-- geometry query is issued."
--
-- Why forward-only
-- ---------------
-- `history_nearby` was created in migration
-- `20261105000007_read_models.sql`. That migration has been applied, so it is
-- never edited; the function is replaced here with the same body plus the two
-- columns.
--
-- The privacy position is unchanged
-- ---------------------------------
-- `lat` and `lng` are the coordinates of a **citizen's own report**. They were
-- already stored on `reports` and were already readable by anyone who could
-- read the report row — the radius query has always compared them. Adding
-- them to the projection does not widen who may read them: the function is
-- `security definer`, it is granted to `authenticated` only, and it still
-- returns only rows the caller could already see (visible / restored reports
-- that are either the caller's own or inside the radius).
--
-- `author_id` is still **not** in the projection. The public read path remains
-- author-free (FR-DATA-3 / FR-NG-5).
-- ---------------------------------------------------------------------------

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
      -- The marker coordinates for the History map. The columns are carried
      -- through unchanged — no rounding happens here, because the map marker
      -- and the radius test must agree on the same point.
      r.lat,
      r.lng,
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
        'lat', lat,
        'lng', lng,
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
  'The local History read model. PostGIS ST_DWithin over the geography GiST index, 1 km / 24 h defaults (FR-HIST-1). The caller''s own reports are always included. Carries lat/lng for the History map (008-history-map).';

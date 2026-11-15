-- ---------------------------------------------------------------------------
-- 20261105000039_history_own_reports_ignore_filters.sql
--
-- Story: `005-history / own reports` (FR-HIST-3)
--
-- A citizen's own report must appear in History straight after they file it,
-- "regardless of the filters". `history_nearby` only honoured that for the
-- radius: the 24 h window and the category filter were applied to the
-- caller's own rows too. A report whose captured time was older than the
-- window, or whose category did not match the selected one, was visible in
-- the home feed (which has no window) but missing from History.
--
-- The function is replaced here with the same body, except that the window
-- and category conditions now sit inside the branch for other people's
-- reports. The caller's own visible reports are always returned. The privacy
-- position is unchanged: a caller only ever gains rows they authored, and
-- `author_id` is still not in the projection.
--
-- Why forward-only
-- ---------------
-- `history_nearby` was last replaced in `20261105000027`. That migration has
-- been applied, so it is never edited.
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
  where r.moderation_status in ('visible', 'restored')
    and r.deleted_at is null
    and (
      r.author_id = auth.uid()
      or (
        r.captured_at > now() - make_interval(hours => v_window_hours)
        and (p_category is null or r.category = p_category)
        and st_dwithin(
          st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
          v_origin,
          v_radius_m
        )
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
    where r.moderation_status in ('visible', 'restored')
      and r.deleted_at is null
      and (
        r.author_id = auth.uid()
        or (
          r.captured_at > now() - make_interval(hours => v_window_hours)
          and (p_category is null or r.category = p_category)
          and st_dwithin(
            st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
            v_origin,
            v_radius_m
          )
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
  'The local History read model. PostGIS ST_DWithin over the geography GiST index, 1 km / 24 h defaults (FR-HIST-1). The caller''s own visible reports are always included, regardless of radius, window and category (FR-HIST-3). Carries lat/lng for the History map (008-history-map).';

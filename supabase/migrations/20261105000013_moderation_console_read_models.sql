-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 20261105000013_moderation_console_read_models.sql
--
-- Three **moderator-only** read models for the admin console.
--
-- Why they exist:
--   * `profiles` is RLS-scoped to the owner (`profiles_select_own` is
--     `id = auth.uid()`). A moderator therefore CANNOT read another
--     account's row through PostgREST — and it must not be able to read
--     *every* account either. The console needs a **targeted lookup** by an
--     exact phone / email / profile id, and nothing else.
--   * `moderation_queue` returns only the `hidden_pending_review` page. The
--     review detail must also render a report that has already been decided
--     (`restored` / `removed`), because the audit trail links to the report's
--     **current** state.
--   * The audit trail needs a **cursor-paginated** read ordered by
--     `(created_at DESC, id DESC)`. A plain PostgREST select would need an
--     `or=(...)` composite filter, which is fragile to compose in the client.
--
-- All three follow the same posture as the existing moderator RPCs:
--   * `SECURITY DEFINER` + an explicit `is_moderator()` check **inside** the
--     function — a citizen gets `FORBIDDEN`, never a partial answer.
--   * `EXECUTE` revoked from `PUBLIC` and `anon`, granted to `authenticated`.
--   * No coordinate or media payload in the audit payload — the trail points
--     at a report, it never duplicates the report's contents.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- moderation_report_detail — one report, in full, for the review screen
--
-- Returns the report, every flag on it, its media, the **uploader's
-- identity** (server-side only — FR-MOD-2), and the prior decisions for the
-- same report.
--
-- It reads any report a moderator may read, not only the queued ones: the
-- audit trail links to a report's current state, and that state may be
-- `restored` or `removed` already.
-- -----------------------------------------------------------------------------

create or replace function public.moderation_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  -- The role check lives HERE, not in the client (FR-MOD-1).
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', r.id,
    'category', r.category,
    'description', r.description,
    'area_hierarchy', r.area_hierarchy,
    'captured_at', r.captured_at,
    'public_visibility', r.public_visibility,
    'moderation_status', r.moderation_status,
    'hide_reason', r.hide_reason,
    'lat', r.lat,
    'lng', r.lng,
    'created_at', r.created_at,
    'flag_count', (
      select count(*)::integer from public.flags f where f.report_id = r.id
    ),
    'flags', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'reason', f.reason,
          'flagger_id', f.flagger_id,
          'created_at', f.created_at
        ) order by f.created_at asc
      ), '[]'::jsonb)
      from public.flags f where f.report_id = r.id
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
          'height', rm.height,
          'created_at', rm.created_at
        ) order by rm.created_at asc
      ), '[]'::jsonb)
      from public.report_media rm
      where rm.report_id = r.id and rm.purged_at is null
    ),
    'uploader', (
      select jsonb_build_object(
        'id', up.id,
        'full_name', up.full_name,
        'phone', up.phone,
        'email', up.email,
        'role', up.role,
        'disabled_at', up.disabled_at,
        'deleted_at', up.deleted_at,
        'created_at', up.created_at
      )
      from public.profiles up where up.id = r.author_id
    ),
    'prior_actions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', ma.id,
          'moderator_id', ma.moderator_id,
          'decision', ma.decision,
          'note', ma.note,
          'created_at', ma.created_at
        ) order by ma.created_at desc
      ), '[]'::jsonb)
      from public.moderation_actions ma where ma.report_id = r.id
    )
  )
  into v_report
  from public.reports r
  where r.id = p_report_id;

  if v_report is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_report;
end;
$$;

revoke execute on function public.moderation_report_detail(uuid) from public;
revoke execute on function public.moderation_report_detail(uuid) from anon;
grant execute on function public.moderation_report_detail(uuid) to authenticated;

comment on function public.moderation_report_detail(uuid) is
  'The moderator-only report review detail: the report, every flag, its media, the uploader identity (server-side only), and the prior decisions. FORBIDDEN for a non-moderator (FR-MOD-1, FR-MOD-2).';

-- -----------------------------------------------------------------------------
-- moderator_search_users — a targeted account lookup
--
-- An **exact** match on the phone, the email, or the profile id. It is not a
-- user directory, not a fuzzy search, and not a bulk listing: the console is
-- a targeted tool, and a moderator has no business browsing every account.
--
-- The per-user report count is moderation context about **one** account. It
-- is not an aggregate — there is no total, no distribution, and no chart
-- (FR-NG-3 / FR-NG-4 / ADR-010).
-- -----------------------------------------------------------------------------

create or replace function public.moderator_search_users(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
begin
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- An empty query is not a "list everything" request. It matches nothing.
  if v_query = '' then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(item order by item->>'phone')
      from (
        select jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'phone', p.phone,
          'email', p.email,
          'role', p.role,
          'disabled_at', p.disabled_at,
          'deleted_at', p.deleted_at,
          'created_at', p.created_at,
          'report_count', (
            select count(*)::integer from public.reports r where r.author_id = p.id
          )
        ) as item
        from public.profiles p
        where p.id::text = v_query
           or p.phone = v_query
           or lower(p.email) = lower(v_query)
        limit 20
      ) matched
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.moderator_search_users(text) from public;
revoke execute on function public.moderator_search_users(text) from anon;
grant execute on function public.moderator_search_users(text) to authenticated;

comment on function public.moderator_search_users(text) is
  'The moderator-only exact-match account lookup (phone / email / profile id) with a per-user report count. Not a directory, not a listing, never an aggregate (FR-NG-3).';

-- -----------------------------------------------------------------------------
-- moderation_audit_feed — the append-only trail, cursor-paginated
--
-- Ordered by `(created_at DESC, id DESC)` with the **same** composite cursor
-- format as the feeds (`<iso>|<uuid>`), so one cursor helper serves all three
-- paginated read models.
--
-- The payload carries ids, the decision, the note, and the timestamp. It
-- carries **no** coordinates, **no** description, and **no** media — the
-- trail points at a report, it never duplicates the report's contents.
-- -----------------------------------------------------------------------------

create or replace function public.moderation_audit_feed(
  p_cursor text default null,
  p_limit integer default 20,
  p_decision text default null
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
  v_decision public.moderation_decision := null;
  v_items jsonb;
  v_next text;
begin
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    select c.captured_at, c.id
    into v_cursor_ts, v_cursor_id
    from public.parse_feed_cursor(p_cursor) c;
  end if;

  if p_decision is not null and btrim(p_decision) <> '' then
    if btrim(p_decision) not in ('restore', 'remove', 'disable_user') then
      raise exception 'VALIDATION_FAILED' using errcode = '22023';
    end if;
    v_decision := btrim(p_decision)::public.moderation_decision;
  end if;

  with page as (
    select
      ma.id,
      ma.report_id,
      ma.moderator_id,
      ma.target_user_id,
      ma.decision,
      ma.note,
      ma.created_at,
      mp.full_name as moderator_full_name
    from public.moderation_actions ma
    left join public.profiles mp on mp.id = ma.moderator_id
    where (v_decision is null or ma.decision = v_decision)
      and (
        v_cursor_ts is null
        or (ma.created_at, ma.id) < (v_cursor_ts, v_cursor_id)
      )
    order by ma.created_at desc, ma.id desc
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'report_id', report_id,
      'moderator_id', moderator_id,
      'moderator_display_name', moderator_full_name,
      'target_user_id', target_user_id,
      'decision', decision,
      'note', note,
      'created_at', created_at
    ) order by created_at desc, id desc
  ), '[]'::jsonb)
  into v_items
  from page;

  if jsonb_array_length(v_items) > v_limit then
    v_items := public.jsonb_slice(v_items, v_limit);
    select public.feed_cursor(
      ((v_items -> v_limit - 1) ->> 'created_at')::timestamptz,
      ((v_items -> v_limit - 1) ->> 'id')::uuid
    ) into v_next;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

revoke execute on function public.moderation_audit_feed(text, integer, text) from public;
revoke execute on function public.moderation_audit_feed(text, integer, text) from anon;
grant execute on function public.moderation_audit_feed(text, integer, text) to authenticated;

comment on function public.moderation_audit_feed(text, integer, text) is
  'The moderator-only append-only action trail, newest first, cursor-paginated on (created_at DESC, id DESC). Carries ids, the decision, the note, and the timestamp — never report contents (FR-MOD-3).';

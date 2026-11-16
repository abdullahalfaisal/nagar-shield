-- =============================================================================
-- 20261105000041_moderator_directory_and_hide.sql
--
-- Three moderator-only additions for the admin console:
--
--   * moderator_list_users      — a cursor-paginated list of accounts
--   * moderator_feed_reports    — the public feed as a moderator sees it: shown reports
--                                 and the ones a moderator hid by hand
--   * moderation_hide           — take a published report out of the public feed
--
-- A hidden report goes back to `hidden_pending_review` with hide_reason
-- 'manual', so it appears in the review queue and is shown again with the
-- existing `moderation_decide('restore')`. Every hide writes an audit row.
--
-- Note: `moderator_search_users` (migration 013) is still the exact-match
-- lookup that returns full contact details. The list below is for browsing, so
-- the console masks the phone and email in it.
-- =============================================================================

alter type public.moderation_decision add value if not exists 'hide';

-- -----------------------------------------------------------------------------
-- moderator_list_users
-- -----------------------------------------------------------------------------

create or replace function public.moderator_list_users(
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_cursor_ts timestamptz := null;
  v_cursor_id uuid := null;
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

  with page as (
    select
      p.id,
      p.full_name,
      p.phone,
      p.email,
      p.role,
      p.disabled_at,
      p.deleted_at,
      p.created_at,
      (select count(*)::integer from public.reports r where r.author_id = p.id) as report_count
    from public.profiles p
    where p.pii_purged_at is null
      and (
        v_cursor_ts is null
        or (p.created_at, p.id) < (v_cursor_ts, v_cursor_id)
      )
    order by p.created_at desc, p.id desc
    limit v_limit + 1
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'full_name', full_name,
        'phone', phone,
        'email', email,
        'role', role,
        'disabled_at', disabled_at,
        'deleted_at', deleted_at,
        'created_at', created_at,
        'report_count', report_count
      )
      order by created_at desc, id desc
    ), '[]'::jsonb)
  into v_items
  from page;

  if jsonb_array_length(v_items) > v_limit then
    v_items := public.jsonb_slice(v_items, v_limit);
    v_next := (v_items -> (v_limit - 1) ->> 'created_at') || '|' || (v_items -> (v_limit - 1) ->> 'id');
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

revoke execute on function public.moderator_list_users(text, integer) from public;
revoke execute on function public.moderator_list_users(text, integer) from anon;
grant execute on function public.moderator_list_users(text, integer) to authenticated;

comment on function public.moderator_list_users(text, integer) is
  'Moderator-only, cursor-paginated list of accounts with a per-user report count.';

-- -----------------------------------------------------------------------------
-- moderator_feed_reports
-- -----------------------------------------------------------------------------

create or replace function public.moderator_feed_reports(
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
      r.id, r.category, r.description, r.area_hierarchy, r.captured_at,
      (r.moderation_status = 'hidden_pending_review') as is_hidden
    from public.reports r
    where (
        r.moderation_status in ('visible', 'restored')
        or (r.moderation_status = 'hidden_pending_review' and r.hide_reason = 'manual')
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
        'hidden', is_hidden
      )
      order by captured_at desc, id desc
    ), '[]'::jsonb)
  into v_items
  from page;

  if jsonb_array_length(v_items) > v_limit then
    v_items := public.jsonb_slice(v_items, v_limit);
    v_next := (v_items -> (v_limit - 1) ->> 'captured_at') || '|' || (v_items -> (v_limit - 1) ->> 'id');
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

revoke execute on function public.moderator_feed_reports(text, integer) from public;
revoke execute on function public.moderator_feed_reports(text, integer) from anon;
grant execute on function public.moderator_feed_reports(text, integer) to authenticated;

comment on function public.moderator_feed_reports(text, integer) is
  'Moderator-only, cursor-paginated list of the public feed: shown reports plus the ones a moderator hid by hand.';

-- -----------------------------------------------------------------------------
-- moderation_hide
-- -----------------------------------------------------------------------------

create or replace function public.moderation_hide(p_report_id uuid, p_note text)
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

  select * into v_report
    from public.reports
   where id = p_report_id
     for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only a report that is shown can be hidden. A hidden or removed report is
  -- a conflict, so a second moderator cannot write a second audit row.
  if v_report.moderation_status not in ('visible', 'restored') then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  perform public.server_side_write(
    format(
      'update public.reports
         set moderation_status = ''hidden_pending_review'',
             hide_reason = ''manual'',
             updated_at = now()
       where id = %L and moderation_status in (''visible'', ''restored'')',
      p_report_id
    )
  );

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (p_report_id, v_moderator, v_report.author_id, 'hide'::public.moderation_decision, p_note);

  return jsonb_build_object('status', 'ok', 'report_id', p_report_id);
end;
$$;

revoke execute on function public.moderation_hide(uuid, text) from public;
revoke execute on function public.moderation_hide(uuid, text) from anon;
grant execute on function public.moderation_hide(uuid, text) to authenticated;

comment on function public.moderation_hide(uuid, text) is
  'Takes a published report out of the public feed (back to pending review, hide_reason manual) and writes the audit row. Show it again with moderation_decide restore.';

-- -----------------------------------------------------------------------------
-- The audit feed accepts the new decision as a filter.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.moderation_audit_feed(text, integer, text)'::regprocedure)
    into v_def;

  v_def := replace(
    v_def,
    $old$not in ('restore', 'remove', 'disable_user')$old$,
    $new$not in ('restore', 'remove', 'disable_user', 'hide')$new$
  );

  execute v_def;
end;
$$;

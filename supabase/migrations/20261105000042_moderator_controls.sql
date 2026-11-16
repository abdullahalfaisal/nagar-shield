-- =============================================================================
-- 20261105000042_moderator_controls.sql
--
-- More moderator controls for the admin console, all moderator-only and all
-- audited in `moderation_actions`:
--
--   * moderation_enable_user         — re-enable a disabled account
--   * moderation_restore_account     — restore a soft-deleted account in its 30 days
--   * moderator_declined_reports     — reports declined in the last 7 days
--   * moderation_undo_decline        — put a declined report back in the review queue
--   * moderator_wrong_number_reports — reports of wrong hotline / station numbers
--   * moderator_resolve_wrong_number — mark one reviewed or rejected
-- =============================================================================

alter type public.moderation_decision add value if not exists 'enable_user';
alter type public.moderation_decision add value if not exists 'restore_account';
alter type public.moderation_decision add value if not exists 'undo_remove';

-- -----------------------------------------------------------------------------
-- moderation_enable_user
-- -----------------------------------------------------------------------------

create or replace function public.moderation_enable_user(p_user_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator uuid := auth.uid();
  v_target record;
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

  select id, disabled_at into v_target
    from public.profiles
   where id = p_user_id
     for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only a disabled account can be enabled. Anything else is a conflict, so a
  -- second moderator cannot write a second audit row.
  if v_target.disabled_at is null then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  perform public.server_side_write(
    format(
      'update public.profiles
          set disabled_at = null, updated_at = now()
        where id = %L and disabled_at is not null',
      p_user_id
    )
  );

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (null, v_moderator, p_user_id, 'enable_user'::public.moderation_decision, p_note);

  return jsonb_build_object('status', 'ok', 'user_id', p_user_id);
end;
$$;

revoke execute on function public.moderation_enable_user(uuid, text) from public;
revoke execute on function public.moderation_enable_user(uuid, text) from anon;
grant execute on function public.moderation_enable_user(uuid, text) to authenticated;

comment on function public.moderation_enable_user(uuid, text) is
  'Re-enables a disabled account and writes the audit row in the same transaction.';

-- -----------------------------------------------------------------------------
-- moderation_restore_account
-- -----------------------------------------------------------------------------

create or replace function public.moderation_restore_account(p_user_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator uuid := auth.uid();
  v_target record;
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

  select id, deleted_at, pii_purged_at into v_target
    from public.profiles
   where id = p_user_id
     for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_target.deleted_at is null then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  -- The same 30-day window as the user's own restore, on the server's clock.
  if v_target.pii_purged_at is not null or now() >= v_target.deleted_at + interval '30 days' then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  perform public.server_side_write(
    format(
      'update public.profiles
          set deleted_at = null, updated_at = now()
        where id = %L',
      p_user_id
    )
  );

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (null, v_moderator, p_user_id, 'restore_account'::public.moderation_decision, p_note);

  return jsonb_build_object('status', 'ok', 'user_id', p_user_id);
end;
$$;

revoke execute on function public.moderation_restore_account(uuid, text) from public;
revoke execute on function public.moderation_restore_account(uuid, text) from anon;
grant execute on function public.moderation_restore_account(uuid, text) to authenticated;

comment on function public.moderation_restore_account(uuid, text) is
  'Restores a soft-deleted account inside its 30-day window and writes the audit row.';

-- -----------------------------------------------------------------------------
-- moderator_declined_reports
-- -----------------------------------------------------------------------------

create or replace function public.moderator_declined_reports(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(item order by declined_at desc)
      from (
        select
          jsonb_build_object(
            'id', r.id,
            'category', r.category,
            'description', r.description,
            'area_hierarchy', r.area_hierarchy,
            'captured_at', r.captured_at,
            'declined_at', a.declined_at
          ) as item,
          a.declined_at
        from public.reports r
        join lateral (
          select max(ma.created_at) as declined_at
            from public.moderation_actions ma
           where ma.report_id = r.id and ma.decision = 'remove'
        ) a on true
        where r.moderation_status = 'removed'
          and a.declined_at > now() - interval '7 days'
        order by a.declined_at desc
        limit v_limit
      ) declined
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.moderator_declined_reports(integer) from public;
revoke execute on function public.moderator_declined_reports(integer) from anon;
grant execute on function public.moderator_declined_reports(integer) to authenticated;

comment on function public.moderator_declined_reports(integer) is
  'Moderator-only list of reports declined in the last 7 days, newest decision first.';

-- -----------------------------------------------------------------------------
-- moderation_undo_decline
-- -----------------------------------------------------------------------------

create or replace function public.moderation_undo_decline(p_report_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator uuid := auth.uid();
  v_report record;
  v_declined_at timestamptz;
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

  if v_report.moderation_status <> 'removed' then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  select max(created_at) into v_declined_at
    from public.moderation_actions
   where report_id = p_report_id and decision = 'remove';

  -- The undo window is 7 days from the decline, on the server's clock.
  if v_declined_at is null or v_declined_at <= now() - interval '7 days' then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  -- Back to the review queue, so the report gets a fresh decision.
  perform public.server_side_write(
    format(
      'update public.reports
          set moderation_status = ''hidden_pending_review'', hide_reason = null, updated_at = now()
        where id = %L and moderation_status = ''removed''',
      p_report_id
    )
  );

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (p_report_id, v_moderator, v_report.author_id, 'undo_remove'::public.moderation_decision, p_note);

  return jsonb_build_object('status', 'ok', 'report_id', p_report_id);
end;
$$;

revoke execute on function public.moderation_undo_decline(uuid, text) from public;
revoke execute on function public.moderation_undo_decline(uuid, text) from anon;
grant execute on function public.moderation_undo_decline(uuid, text) to authenticated;

comment on function public.moderation_undo_decline(uuid, text) is
  'Puts a report declined in the last 7 days back in the review queue and writes the audit row.';

-- -----------------------------------------------------------------------------
-- Wrong-number reports
-- -----------------------------------------------------------------------------

create or replace function public.moderator_wrong_number_reports(
  p_status text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_status is not null and btrim(p_status) <> ''
     and btrim(p_status) not in ('pending', 'reviewed', 'rejected') then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(item order by created_at desc)
      from (
        select
          jsonb_build_object(
            'id', w.id,
            'entry_type', w.entry_type,
            'entry_id', w.entry_id,
            'reason', w.reason,
            'details', w.details,
            'status', w.status,
            'created_at', w.created_at,
            'anonymous', (w.reporter_id is null)
          ) as item,
          w.created_at
        from public.wrong_number_reports w
        where p_status is null or btrim(p_status) = '' or w.status = btrim(p_status)
        order by w.created_at desc
        limit v_limit
      ) reports
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.moderator_wrong_number_reports(text, integer) from public;
revoke execute on function public.moderator_wrong_number_reports(text, integer) from anon;
grant execute on function public.moderator_wrong_number_reports(text, integer) to authenticated;

comment on function public.moderator_wrong_number_reports(text, integer) is
  'Moderator-only list of wrong-number reports, newest first, optionally filtered by status.';

create or replace function public.moderator_resolve_wrong_number(p_report_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('pending', 'reviewed', 'rejected') then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  update public.wrong_number_reports
     set status = p_status
   where id = p_report_id;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object('status', 'ok', 'report_id', p_report_id);
end;
$$;

revoke execute on function public.moderator_resolve_wrong_number(uuid, text) from public;
revoke execute on function public.moderator_resolve_wrong_number(uuid, text) from anon;
grant execute on function public.moderator_resolve_wrong_number(uuid, text) to authenticated;

comment on function public.moderator_resolve_wrong_number(uuid, text) is
  'Sets a wrong-number report to pending, reviewed or rejected. Moderator-only.';

-- -----------------------------------------------------------------------------
-- The audit feed accepts the new decisions as a filter.
-- -----------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.moderation_audit_feed(text, integer, text)'::regprocedure)
    into v_def;

  v_def := replace(
    v_def,
    $old$not in ('restore', 'remove', 'disable_user', 'hide')$old$,
    $new$not in ('restore', 'remove', 'disable_user', 'hide', 'enable_user', 'restore_account', 'undo_remove')$new$
  );

  execute v_def;
end;
$$;

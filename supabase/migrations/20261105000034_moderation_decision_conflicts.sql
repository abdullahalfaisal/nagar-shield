-- =============================================================================
-- Moderation decisions — the conflict and refusal guarantees
--
-- `007-moderation / 003-restore-remove-decision` and
-- `007-moderation / 004-disable-a-user`.
--
-- Three server-side guarantees the stories require and the shipped functions
-- did not make. Each was found by reading the function bodies against the
-- stories' acceptance criteria — the surfaces rendered, and the console hid
-- the buttons that should not be offered, but the **database** was the
-- boundary and it did not hold.
--
-- =============================================================================
--
-- 1. `moderation_decide` had no CONFLICT guard.
--
--    The function selected the report, then updated it **unconditionally**
--    and inserted the audit row **unconditionally**. So a second decision on
--    an already-decided report:
--
--      * overwrote `moderation_status` (a `restored` report could be
--        `removed` and vice versa), and
--      * wrote a **second** `moderation_actions` row.
--
--    That breaks two things at once. The story says "the row count for the
--    report is exactly 1, not 0 and not 2" — the audit trail is supposed to
--    be append-only *evidence*, and a trail with two decisions on one report
--    records a decision that never happened. And the console's `CONFLICT`
--    branch was dead code: nothing could ever return `CONFLICT` from this
--    path.
--
--    The fix: the transition is conditional on the report still being
--    `hidden_pending_review`, and the audit row is written **only** when the
--    transition actually happened. A report that is already `restored`,
--    `removed` or `visible` raises `CONFLICT` and nothing is written.
--
--    The conditional update and the audit insert stay in the same
--    transaction, so a partial decision is still impossible.
--
-- 2. `disable_user` did not check the target's role.
--
--    The story says "a moderator cannot disable another moderator at MVP",
--    with the rejection server-side. The console hid the button, but the
--    function only refused **self**-disabling — so a moderator could disable
--    another moderator by calling the API directly. A UI that hides a button
--    is not a guarantee; the database is.
--
-- 3. `disable_user` had no NOT_FOUND and no CONFLICT.
--
--    It updated `where id = p_user_id and disabled_at is null` and then
--    inserted the audit row regardless of whether the update had matched a
--    row. So:
--
--      * disabling a **non-existent** user wrote an audit row for a user
--        who does not exist and returned success; and
--      * disabling an **already-disabled** user wrote a **second** audit row
--        and returned success, instead of `CONFLICT`.
--
--    The audit trail would then claim a moderator disabled someone twice, or
--    disabled someone who was never there.
--
--    The fix: the target's existence and its current state are both checked
--    before anything is written.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- moderation_decide — one decision per report.
--
-- The `for update` lock is what makes the check-then-write atomic. Two
-- moderators deciding the same report at the same moment would otherwise
-- both read `hidden_pending_review` and both write.
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
  v_updated integer;
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

  -- The lock is held for the rest of the transaction, so a second moderator
  -- cannot slip a decision in between the check and the write.
  select * into v_report
    from public.reports
   where id = p_report_id
     for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- The report is only ever decided while it is **pending review**. A report
  -- that is already `restored`, `removed`, or plain `visible` has had its
  -- one decision, and a second attempt is a conflict — not a re-decision.
  if v_report.moderation_status <> 'hidden_pending_review' then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  -- The transition is conditional, and the audit row is written only when it
  -- matched a row. `v_updated` is the proof that the decision happened.
  if p_decision = 'restore' then
    perform public.server_side_write(
      format(
        'update public.reports
           set moderation_status = ''restored'', hide_reason = null, updated_at = now()
         where id = %L and moderation_status = ''hidden_pending_review''',
        p_report_id
      )
    );
  else
    perform public.server_side_write(
      format(
        'update public.reports
           set moderation_status = ''removed'', updated_at = now()
         where id = %L and moderation_status = ''hidden_pending_review''',
        p_report_id
      )
    );
  end if;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Nothing moved, so nothing is recorded. The report is not in the state
    -- the transition required.
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
  values (p_report_id, v_moderator, v_report.author_id, p_decision::public.moderation_decision, p_note);

  return jsonb_build_object('status', 'ok', 'report_id', p_report_id, 'decision', p_decision);
end;
$$;

comment on function public.moderation_decide(uuid, text, text) is
  'Restores or removes a report that is pending review, and writes the audit row in the same transaction. One decision per report: a second decision on an already-decided report raises CONFLICT and writes nothing.';

-- -----------------------------------------------------------------------------
-- disable_user — the target's role and current state are the server's business.
-- -----------------------------------------------------------------------------

create or replace function public.disable_user(p_user_id uuid, p_note text)
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

  if p_user_id = v_moderator then
    raise exception 'CANNOT_DISABLE_SELF' using errcode = '22023';
  end if;

  if p_note is null or char_length(btrim(p_note)) = 0 then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;

  -- The target is locked for the rest of the transaction, so two
  -- moderators cannot both disable the same user and both write an audit
  -- row.
  select id, role, disabled_at into v_target
    from public.profiles
   where id = p_user_id
     for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A moderator cannot disable another moderator at MVP. The console hides
  -- the button, but the button is not the boundary — the function is.
  if v_target.role = 'moderator' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- An already-disabled account is a conflict, not a second decision. The
  -- `disabled_at` value keeps its original — the audit trail records that
  -- one moderator disabled this user, once.
  if v_target.disabled_at is not null then
    raise exception 'CONFLICT' using errcode = '23505';
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

comment on function public.disable_user(uuid, text) is
  'Disables a citizen account and writes the audit row in the same transaction. A moderator cannot disable themselves or another moderator, and an already-disabled account raises CONFLICT without a second audit row.';

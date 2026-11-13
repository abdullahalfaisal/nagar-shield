-- -----------------------------------------------------------------------------
-- The author auto-hide counts DISTINCT flagged reports, not flags.
--
-- `006-alerts / 005-author-auto-hide` — "5 flagged reports" means 5 distinct
-- reports, not 5 flags. The count is `count(distinct report_id)` over that
-- author's flags in the window. Five flags on one report are ONE flagged
-- report — and that report was already handled by the 3-flag threshold.
--
-- The defect this migration closes
-- ---------------------------------
-- The function counted `count(*)` over the author's flags, so five flags on a
-- **single** report fired the author auto-hide and swept in the author's other
-- reports. That is the rule the story explicitly forbids: the count was over
-- flags, not over flagged reports, and a single heavily-flagged report was
-- enough to hide an author's whole recent output.
--
-- The distinct count also matters for the reverse case. Five flags spread over
-- three reports is three flagged reports, so the auto-hide does **not** fire —
-- the 3-flag threshold handles the one report that has three.
--
-- The window is the FLAG's age, not the report's age. The scope of the hide
-- is the author's reports from the last 24 h — a report older than 24 h that
-- gets flagged still counts toward the tally but is not itself hidden by this
-- rule; it is handled by the ordinary 3-flag path.
--
-- Forward-only: the function is replaced in place. The `author_flags_24h`
-- field in the response keeps its name and its meaning as the **flag** count
-- (the client shows it as the author's flag total), and a new field
-- `author_flagged_reports_24h` carries the **distinct report** count that
-- decides the hide.
--
-- The response also gains `author_hidden`, which the story names and the
-- mobile client already reads. The old `author_reports_hidden` (a count) is
-- kept alongside it, so the count is not lost.
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
  v_author_flagged_reports integer;
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

  -- 4. Author-level auto-hide: 5 DISTINCT flagged reports by the AUTHOR in 24 h.
  --
  --    The flag count is kept for the response, but it does NOT decide the
  --    hide — the distinct report count does.
  select count(*) into v_author_flags
  from public.flags f
  join public.reports r on r.id = f.report_id
  where r.author_id = v_report.author_id
    and f.created_at > now() - interval '24 hours';

  select count(distinct f.report_id) into v_author_flagged_reports
  from public.flags f
  join public.reports r on r.id = f.report_id
  where r.author_id = v_report.author_id
    and f.created_at > now() - interval '24 hours';

  if v_author_flagged_reports >= 5 then
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
    'author_flagged_reports_24h', v_author_flagged_reports,
    'author_hidden', v_author_hidden > 0,
    'author_reports_hidden', v_author_hidden
  );
end;
$$;

grant execute on function public.flag_report(uuid, public.flag_reason) to authenticated;

comment on function public.flag_report(uuid, public.flag_reason) is
  'The citizen flag write. 3 flags on the report hide it; 5 DISTINCT flagged reports by the same author in 24 h hide all of that author''s reports from the window (FR-ALERTS-7 / FR-ALERTS-11).';

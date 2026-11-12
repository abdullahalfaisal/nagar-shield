-- What does the append-only trigger raise, exactly, and how?
--
-- The test asserts the error equals 'MODERATION_ACTIONS_APPEND_ONLY'. The
-- trigger raises with `errcode = '42501'`, so `sqlerrm` may carry a
-- PREFIX: "42501: MODERATION_ACTIONS_APPEND_ONLY" or similar. This probe
-- prints the raw string and the SQLSTATE.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111501', 'err2@test.local',
        json_build_object('phone', '+8801711000501'));

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111502', 'err2mod@test.local',
        json_build_object('phone', '+8801711000502'));

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (null, '11111111-1111-1111-1111-111111111502', null, 'remove', 'err2 probe');

\echo '--- as the service role (bypasses RLS, reaches the trigger) ---'
set local role service_role;

do $$
declare
  v_state text;
  v_msg text;
begin
  begin
    update public.moderation_actions set note = 'rewritten' where note = 'err2 probe';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    raise notice 'UPDATE sqlstate=[%] message=[%]', v_state, v_msg;
  end;
end;
$$;

do $$
declare
  v_state text;
  v_msg text;
begin
  begin
    delete from public.moderation_actions where note = 'err2 probe';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    raise notice 'DELETE sqlstate=[%] message=[%]', v_state, v_msg;
  end;
end;
$$;

reset role;

rollback;

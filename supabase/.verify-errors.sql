-- Why did B1, B3 and C6 fail? The guard, or the assertion?

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111201', 'err@test.local',
        json_build_object('phone', '+8801711000201'));

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111202', 'errmod@test.local',
        json_build_object('phone', '+8801711000202'));

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (null, '11111111-1111-1111-1111-111111111202', null, 'remove', 'error probe');

do $$
begin
  update public.moderation_actions set note = 'rewritten' where note = 'error probe';
exception when others then
  raise notice 'UPDATE error = [%]', sqlerrm;
end;
$$;

do $$
begin
  delete from public.moderation_actions where note = 'error probe';
exception when others then
  raise notice 'DELETE error = [%]', sqlerrm;
end;
$$;

do $$
begin
  update public.profiles set deleted_at = null where id = '11111111-1111-1111-1111-111111111201';
  raise notice 'C6 (deleted_at already NULL): ALLOWED, no error';
exception when others then
  raise notice 'C6 (deleted_at already NULL) error = [%]', sqlerrm;
end;
$$;

\echo '--- now with a SET deleted_at ---'
update public.profiles set deleted_at = now() - interval '40 days' where id = '11111111-1111-1111-1111-111111111201';

do $$
begin
  update public.profiles set deleted_at = null where id = '11111111-1111-1111-1111-111111111201';
  raise notice 'UNEXPECTED: the clear was ALLOWED';
exception when others then
  raise notice 'C6 (deleted_at SET) error = [%]', sqlerrm;
end;
$$;

rollback;

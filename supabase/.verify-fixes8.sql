-- Verify 8 — the INSERT and DELETE paths, measured precisely.
--
-- The earlier probe's DO block raised its NOTICE whether or not the DELETE
-- affected a row, so it proved nothing. This one reads GET DIAGNOSTICS.

\echo '=== can a client DELETE its own profile row? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999906', 'deleteme@test.local',
        json_build_object('phone', '+8801711009906'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999906","role":"authenticated"}';

do $$
declare
  v_rows integer;
begin
  delete from public.profiles where id = '99999999-9999-4999-8999-999999999906';
  get diagnostics v_rows = row_count;
  raise notice 'the DELETE affected % row(s)', v_rows;
end;
$$;

reset role;

select 'the profile row still exists (the DELETE was refused)' as test,
       (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999906') = 1 as passed;

rollback;

\echo ''
\echo '=== the reachable INSERT escalation: signup WITHOUT a phone ==='
\echo '--- the trigger raises PHONE_REQUIRED, so no profile row is created ---'

begin;

\echo '--- and the auth user still exists ---'
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('99999999-9999-4999-8999-999999999908', 'nophone@test.local', '{}'::jsonb);
  raise notice 'the auth user was created';
exception when others then
  raise notice 'the auth insert failed: %', sqlerrm;
end;
$$;

select 'the auth user EXISTS but the profile does not' as test,
       (select count(*) from auth.users where id = '99999999-9999-4999-8999-999999999908') = 1
   and (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999908') = 0 as passed;

\echo '--- the client now inserts its own profile with the moderator role ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999908","role":"authenticated"}';

do $$
begin
  insert into public.profiles (id, auth_user_id, phone, email, role)
  values ('99999999-9999-4999-8999-999999999908',
          '99999999-9999-4999-8999-999999999908',
          '+8801711009908', 'nophone@test.local', 'moderator');
  raise notice 'UNEXPECTED: the INSERT was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

select 'no moderator row was created' as test,
       (select count(*) from public.profiles
         where id = '99999999-9999-4999-8999-999999999908' and role = 'moderator') = 0 as passed;

rollback;

\echo ''
\echo '=== can a client point auth_user_id at ANOTHER user? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999909', 'victim@test.local',
        json_build_object('phone', '+8801711009909'));

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999910', 'thief@test.local',
        json_build_object('phone', '+8801711009910'));

delete from public.profiles where id = '99999999-9999-4999-8999-999999999910';

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999910","role":"authenticated"}';

do $$
begin
  insert into public.profiles (id, auth_user_id, phone, email)
  values ('99999999-9999-4999-8999-999999999910',
          '99999999-9999-4999-8999-999999999909',
          '+8801711009910', 'thief@test.local');
  raise notice 'UNEXPECTED: the INSERT pointed at another user was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

rollback;

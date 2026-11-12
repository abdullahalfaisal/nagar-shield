-- Verify 7 — is the INSERT escalation REACHABLE?
--
-- The insert policy is `with check (id = auth.uid())`, so a client may insert
-- a row with their own id and any role. It is blocked today only because
-- the profile row already exists (the signup trigger created it) and there
-- is no DELETE policy on `profiles`.
--
-- The question: can a client reach a state where their profile row is
-- missing, and then insert one with `role = 'moderator'`?

\echo '=== can a client DELETE its own profile row? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999906', 'deleteme@test.local',
        json_build_object('phone', '+8801711009906'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999906","role":"authenticated"}';

\echo '--- the DELETE policies on profiles ---'
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'profiles' and cmd = 'DELETE';

do $$
begin
  delete from public.profiles where id = '99999999-9999-4999-8999-999999999906';
  raise notice 'UNEXPECTED: the client DELETED its own profile';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

rollback;

\echo ''
\echo '=== so: the signup trigger always creates the profile first ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999906', 'deleteme@test.local',
        json_build_object('phone', '+8801711009906'));

select 'the trigger created the profile at signup' as test,
       (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999906') = 1 as passed;

select 'and its role is citizen' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999906') = 'citizen' as passed;

\echo ''
\echo '=== but if the row were missing, would the INSERT carry a role? ==='
\echo '--- simulate: the row is gone, the auth user is not ---'

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999907', 'inserts@test.local',
        json_build_object('phone', '+8801711009907'));

-- Remove the profile the way a cascade would, leaving the auth user intact.
delete from public.profiles where id = '99999999-9999-4999-8999-999999999907';

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999907","role":"authenticated"}';

do $$
begin
  insert into public.profiles (id, auth_user_id, phone, email, role)
  values ('99999999-9999-4999-8999-999999999907',
          '99999999-9999-4999-8999-999999999907',
          '+8801711009907', 'inserts@test.local', 'moderator');
  raise notice 'the INSERT was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

select 'the row now exists' as test,
       (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999907') = 1 as passed;

select 'and its role is moderator' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999907') = 'moderator' as passed;

rollback;

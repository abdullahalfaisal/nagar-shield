-- Verify 9 — the signup path and the closed INSERT hole.
--
--   S1: the signup trigger still creates the profile (the insert guard must
--       NOT break the normal signup).
--   S2: the created profile is a citizen with the right phone.
--   S3: a client INSERT with role = 'moderator' is normalised to citizen.
--   S4: a client INSERT cannot write another account's phone/email.
--   S5: a client INSERT cannot claim another account's auth linkage.
--   S6: the seeded / backfilled rows are untouched.

\echo '=== S1/S2: the signup path still works ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999911', 'signup@test.local',
        json_build_object('phone', '+8801711009911', 'full_name', 'New Citizen'));

select 'S1: the trigger created the profile' as test,
       (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999911') = 1 as passed;

select 'S2: the profile is a citizen with the right phone' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999911') = 'citizen'
   and (select phone from public.profiles where id = '99999999-9999-4999-8999-999999999911') = '+8801711009911'
   and (select full_name from public.profiles where id = '99999999-9999-4999-8999-999999999911') = 'New Citizen' as passed;

select 'S2b: the auth linkage was recorded' as test,
       (select auth_user_id = '99999999-9999-4999-8999-999999999911'
          from public.profiles where id = '99999999-9999-4999-8999-999999999911') as passed;

rollback;

\echo ''
\echo '=== S3: a client INSERT with role = moderator ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999912', 'ins@test.local',
        json_build_object('phone', '+8801711009912'));

-- Remove the profile the trigger made, so the client's INSERT is the one that lands.
delete from public.profiles where id = '99999999-9999-4999-8999-999999999912';

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999912","role":"authenticated"}';

insert into public.profiles (id, auth_user_id, phone, email, role, disabled_at, pii_purged_at, deleted_at)
values ('99999999-9999-4999-8999-999999999912',
        '99999999-9999-4999-8999-999999999912',
        '+8801711009912', 'ins@test.local', 'moderator',
        now(), now(), now());

reset role;

select 'S3: the role was normalised to citizen' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999912') = 'citizen' as passed;

select 'S3b: the server-managed columns were reset' as test,
       (select disabled_at is null from public.profiles where id = '99999999-9999-4999-8999-999999999912')
   and (select pii_purged_at is null from public.profiles where id = '99999999-9999-4999-8999-999999999912')
   and (select deleted_at is null from public.profiles where id = '99999999-9999-4999-8999-999999999912') as passed;

rollback;

\echo ''
\echo '=== S4: a client INSERT cannot write another account''s phone ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999913', 'owner@test.local',
        json_build_object('phone', '+8801711009913'));

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999914', 'thief@test.local',
        json_build_object('phone', '+8801711009914'));

delete from public.profiles where id = '99999999-9999-4999-8999-999999999914';

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999914","role":"authenticated"}';

insert into public.profiles (id, auth_user_id, phone, email)
values ('99999999-9999-4999-8999-999999999914',
        '99999999-9999-4999-8999-999999999914',
        '+8801711009913', 'stolen@test.local');

reset role;

select 'S4: the phone came from the Auth identity, not the client' as test,
       (select phone from public.profiles where id = '99999999-9999-4999-8999-999999999914') = '+8801711009914' as passed;

select 'S4b: the email came from the Auth identity' as test,
       (select email from public.profiles where id = '99999999-9999-4999-8999-999999999914') = 'thief@test.local' as passed;

rollback;

\echo ''
\echo '=== S5: a client INSERT cannot claim another account''s auth linkage ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999915', 'victim@test.local',
        json_build_object('phone', '+8801711009915'));

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999916', 'thief2@test.local',
        json_build_object('phone', '+8801711009916'));

delete from public.profiles where id = '99999999-9999-4999-8999-999999999916';

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999916","role":"authenticated"}';

insert into public.profiles (id, auth_user_id, phone, email)
values ('99999999-9999-4999-8999-999999999916',
        '99999999-9999-4999-8999-999999999915',
        '+8801711009916', 'thief2@test.local');

reset role;

select 'S5: the linkage was forced to the caller''s own Auth user' as test,
       (select auth_user_id = '99999999-9999-4999-8999-999999999916'
          from public.profiles where id = '99999999-9999-4999-8999-999999999916') as passed;

rollback;

\echo ''
\echo '=== S6: the seeded rows are untouched ==='

select 'S6: the seeded moderator is still a moderator' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-1111111111a2') = 'moderator' as passed;

select 'S6b: every live profile is linked to its Auth user' as test,
       count(*) = 3 as passed
  from public.profiles
 where auth_user_id is not null;

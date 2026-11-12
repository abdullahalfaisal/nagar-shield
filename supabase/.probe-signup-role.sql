-- Probe — the signup role. The insert guard must NOT break a real signup.
--
-- GoTrue connects as `supabase_auth_admin`, so the signup INSERT runs under
-- THAT role, not under `authenticated` and not under `postgres`. If the
-- guard treated `supabase_auth_admin` as a client, it would strip the
-- moderator role from every signup and break the seed.
--
-- What the guard must do:
--   * `supabase_auth_admin` (GoTrue) -> the SERVER. It may set any column.
--   * `authenticated` / `anon`        -> the CLIENT. Columns are normalised.
--   * `service_role`                  -> the SERVER.
--
-- The seed depends on this: migration 010 inserts the moderator profile
-- with `role = 'moderator'`.

\echo '=== the signup role can set the role ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111301', 'signupmod@test.local',
        json_build_object('phone', '+8801711000301'));

\echo '--- what role does the signup insert run under? ---'
select 'the trigger-created profile is a citizen' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111301') = 'citizen' as passed;

\echo '--- now as supabase_auth_admin, the way GoTrue signs up ---'
set local role supabase_auth_admin;

select 'can supabase_auth_admin UPDATE the profile role?' as probe,
       has_table_privilege('supabase_auth_admin', 'public.profiles', 'update') as has_update;

update public.profiles
   set role = 'moderator'
 where id = '11111111-1111-1111-1111-111111111301';

reset role;

select 'the role was set (the guard let the server through)' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111301') = 'moderator' as passed;

rollback;

\echo ''
\echo '=== the INSERT under supabase_auth_admin ==='

begin;

\echo '--- a direct INSERT as supabase_auth_admin, with a moderator role ---'
set local role supabase_auth_admin;

insert into public.profiles (id, auth_user_id, phone, email, role)
values ('11111111-1111-1111-1111-111111111302',
        '11111111-1111-1111-1111-111111111302',
        '+8801711000302', 'authinsert@test.local', 'moderator')
on conflict (id) do nothing;

reset role;

select 'the role was set on the INSERT too' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111302') = 'moderator' as passed;

rollback;

\echo ''
\echo '=== and the SEED path (migration 010 runs as postgres) ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111303', 'seed@test.local',
        json_build_object('phone', '+8801711000303'));

\echo '--- postgres sets the role, as the seed does ---'
update public.profiles set role = 'moderator' where id = '11111111-1111-1111-1111-111111111303';

select 'the seed role was set' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111303') = 'moderator' as passed;

rollback;

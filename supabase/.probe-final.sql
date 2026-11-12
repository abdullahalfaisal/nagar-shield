-- Probe 11 — the remaining questions for the fix design.
--
-- Q1: does deleting the Auth identity really destroy the profile AND the
--     reports? (DEFECT A)
--
-- Q2: can an UNAUTHENTICATED client resolve a phone number to an email via
--     a direct `profiles` select? (the dual-identifier login path)
--
-- Q3: what does `auth.uid()` / `current_user` read as under each role? (the
--     discriminator the column guard should use)

\echo '=== Q1: the auth delete cascade ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-8444-444444444441', 'cascade@test.local',
        json_build_object('phone', '+8801711004441'));

insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '44444444-4444-4444-8444-444444444440',
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444439',
  23.7461, 90.3774, now(), 'cascade probe', 'theft', 'anonymous', 'visible'
);

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values ('44444444-4444-4444-8444-444444444440',
        '11111111-1111-1111-1111-1111111111a2',
        '44444444-4444-4444-8444-444444444441',
        'remove', 'cascade probe');

select 'before: profile + report + audit all exist' as test,
       (select count(*) from public.profiles where id = '44444444-4444-4444-8444-444444444441') = 1
   and (select count(*) from public.reports where id = '44444444-4444-4444-8444-444444444440') = 1
   and (select count(*) from public.moderation_actions where target_user_id = '44444444-4444-4444-8444-444444444441') = 1 as passed;

\echo '--- the purge destroys the Auth identity ---'
delete from auth.users where id = '44444444-4444-4444-8444-444444444441';

select 'after: the PROFILE row survived (tombstone intact)' as test,
       (select count(*) from public.profiles where id = '44444444-4444-4444-8444-444444444441') = 1 as passed;

select 'after: the REPORT row survived' as test,
       (select count(*) from public.reports where id = '44444444-4444-4444-8444-444444444440') = 1 as passed;

select 'after: the AUDIT row survived' as test,
       (select count(*) from public.moderation_actions where target_user_id = '44444444-4444-4444-8444-444444444441') = 1 as passed;

rollback;

\echo ''
\echo '=== Q2: can an unauthenticated client read a profile by phone? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('55555555-5555-4555-8555-555555555551', 'phone-login@test.local',
        json_build_object('phone', '+8801711005551'));

set local role anon;

select 'the anon client sees the profile row by phone' as test,
       count(*) = 1 as passed
  from public.profiles
 where phone = '+8801711005551';

select 'the anon client sees the EMAIL by phone' as test,
       count(*) = 1 as passed
  from public.profiles
 where phone = '+8801711005551' and email = 'phone-login@test.local';

\echo '--- the purpose-built RPC, in contrast ---'
select 'resolve_login_identifier resolves it for anon' as test,
       (public.resolve_login_identifier('+8801711005551') ->> 'email') = 'phone-login@test.local' as passed;

reset role;

rollback;

\echo ''
\echo '=== Q3: the guard discriminators under each role ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('66666666-6666-4666-8666-666666666661', 'disc@test.local',
        json_build_object('phone', '+8801711006661'));

\echo '--- as anon (an unauthenticated request) ---'
set local role anon;
select 'anon: auth.uid()' as probe, auth.uid()::text as value
 union all select 'anon: current_user', current_user
 union all select 'anon: session_user', session_user;
reset role;

\echo '--- as authenticated (a signed-in citizen) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666661","role":"authenticated"}';
select 'authenticated: auth.uid()' as probe, auth.uid()::text as value
 union all select 'authenticated: current_user', current_user
 union all select 'authenticated: session_user', session_user;
reset role;

\echo '--- as service_role (a server request) ---'
set local role service_role;
select 'service_role: auth.uid()' as probe, auth.uid()::text as value
 union all select 'service_role: current_user', current_user
 union all select 'service_role: session_user', session_user;
reset role;

rollback;

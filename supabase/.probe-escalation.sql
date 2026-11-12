-- Probe 9 — the privilege-escalation check, run correctly.
--
-- The earlier probe ran as `postgres`, which has BYPASSRLS. RLS was not
-- applied, so its result proved nothing. This probe impersonates the client
-- exactly the way PostgREST does: `set local role authenticated` plus the
-- `request.jwt.claims` GUC. RLS and the guards then apply for real.

\echo '=== the escalation attempt, as an authenticated citizen ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999901', 'escalate@test.local',
        json_build_object('phone', '+8801711009901'));

select 'the citizen starts as a citizen' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'citizen' as passed;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999901","role":"authenticated"}';

\echo '--- RLS is now enforced: the citizen reads only its own row ---'
select 'the citizen can see its own profile' as test,
       count(*) = 1 as passed
  from public.profiles
 where id = '99999999-9999-4999-8999-999999999901';

\echo '--- the citizen tries to promote itself to moderator ---'
update public.profiles
   set role = 'moderator'
 where id = '99999999-9999-4999-8999-999999999901';

select 'the citizen did NOT become a moderator' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'citizen' as passed;

\echo '--- the citizen tries to clear its own disabled_at ---'
update public.profiles
   set disabled_at = null
 where id = '99999999-9999-4999-8999-999999999901';

\echo '--- the citizen tries to clear its own pii_purged_at ---'
update public.profiles
   set pii_purged_at = null
 where id = '99999999-9999-4999-8999-999999999901';

\echo '--- the citizen tries to clear its own deleted_at (undo the soft delete) ---'
update public.profiles
   set deleted_at = null
 where id = '99999999-9999-4999-8999-999999999901';

reset role;

rollback;

\echo ''
\echo '=== does the escalation survive the moderator check? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999902', 'escalate2@test.local',
        json_build_object('phone', '+8801711009902'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999902","role":"authenticated"}';

update public.profiles set role = 'moderator' where id = '99999999-9999-4999-8999-999999999902';

select 'is_moderator() now returns true for the escalated citizen' as test,
       public.is_moderator() as passed;

reset role;

rollback;

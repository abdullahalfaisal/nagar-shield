-- Probe 8 — the grants on `profiles`, and the column-guard question.
--
-- Q1: does `authenticated` hold a table-wide UPDATE on `profiles`, or only
--     column-level UPDATE on a safe subset? This decides whether a new
--     server-managed column (`auth_user_id`) needs an explicit column grant.
--
-- Q2: can a citizen UPDATE their own `role` to 'moderator'? The policy
--     `profiles_update_own` says "using (id = auth.uid())" with no column
--     restriction, and the guard trigger only checks `disabled_at`.

\echo '=== Q1: the privileges on public.profiles ==='

select grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and table_name = 'profiles'
 order by grantee, privilege_type;

\echo ''
\echo '--- the column-level UPDATE grants ---'

select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'profiles'
 order by grantee, column_name, privilege_type;

\echo ''
\echo '=== Q2: can a citizen promote themselves to moderator? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999901', 'escalate@test.local',
        json_build_object('phone', '+8801711009901'));

select 'the citizen starts as a citizen' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'citizen' as passed;

\echo '--- the citizen tries to promote themselves ---'
update public.profiles
   set role = 'moderator'
 where id = '99999999-9999-4999-8999-999999999901';

select 'the citizen did NOT become a moderator' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'citizen' as passed;

rollback;

\echo ''
\echo '=== Q3: the roles and their RLS bypass ==='

select rolname, rolbypassrls, rolsuper
  from pg_roles
 where rolname in ('service_role', 'authenticated', 'anon', 'authenticator', 'postgres');

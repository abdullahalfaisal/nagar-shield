-- Probe 12 — the role discriminator the profiles guard will rely on.
--
-- The guard is a SECURITY DEFINER trigger function, so `current_user` inside
-- it is the OWNER, not the caller. The candidate discriminators are:
--
--   * `current_user`          — changed by SECURITY DEFINER. Unusable.
--   * `session_user`          — the session's authenticated role.
--   * `current_setting('role')` — the `role` GUC, set by `SET LOCAL ROLE`.
--   * `auth.role()`           — the VERIFIED JWT's role claim.
--
-- Under PostgREST the connection authenticates as `authenticator` and then
-- does `SET LOCAL ROLE <jwt role>`, so the measurement must imitate that.

\echo '=== the discriminator, measured inside a SECURITY DEFINER trigger ==='

begin;

create table public.probe_roles (
  id uuid primary key default gen_random_uuid(),
  seen_session text,
  seen_current text,
  seen_role_setting text,
  seen_auth_role text,
  seen_auth_uid text
);

create or replace function public.probe_roles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.probe_roles (
    seen_session, seen_current, seen_role_setting, seen_auth_role, seen_auth_uid
  ) values (
    session_user,
    current_user,
    current_setting('role', true),
    auth.role(),
    auth.uid()::text
  );
  return new;
end;
$$;

create trigger probe_roles_trg
  before insert on public.probe_roles
  for each row execute function public.probe_roles_guard();

\echo '--- as anon ---'
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into public.probe_roles default values;
reset role;

\echo '--- as authenticated (a citizen) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666661","role":"authenticated"}';
insert into public.probe_roles default values;
reset role;

\echo '--- as service_role (the server) ---'
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.probe_roles default values;
reset role;

\echo ''
\echo '--- what the guard actually saw ---'
select seen_session, seen_current, seen_role_setting, seen_auth_role, seen_auth_uid
  from public.probe_roles
 order by seen_auth_role;

rollback;

\echo ''
\echo '=== is auth.role() executable by the client roles? ==='

select p.proname, p.prosecdef,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p
 join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'auth'
   and p.proname in ('uid', 'role', 'email');

\echo ''
\echo '=== is is_moderator() executable by the client roles? ==='

select has_function_privilege('anon', 'public.is_moderator()', 'execute') as anon_exec,
       has_function_privilege('authenticated', 'public.is_moderator()', 'execute') as auth_exec,
       has_function_privilege('service_role', 'public.is_moderator()', 'execute') as service_exec;

\echo ''
\echo '=== what does auth.role() return under each JWT? ==='

begin;
select 'anon jwt' as probe, auth.role() as role from (select set_config('request.jwt.claims', '{"role":"anon"}', true)) s
 union all select 'authenticated jwt', auth.role() from (select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666661","role":"authenticated"}', true)) s
 union all select 'service_role jwt', auth.role() from (select set_config('request.jwt.claims', '{"role":"service_role"}', true)) s
 union all select 'no jwt at all', auth.role();
rollback;

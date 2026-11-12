-- Probe 13 — the role discriminator, measured correctly.
--
-- The previous probe recursed: the trigger inserted into the same table the
-- trigger fired on. This one records the reading in a temp table instead.

\echo '=== the discriminator, read inside a SECURITY DEFINER function ==='

begin;

create or replace function public.probe_read_roles()
returns table (
  seen_session text,
  seen_current text,
  seen_role_setting text,
  seen_auth_role text,
  seen_auth_uid text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select session_user, current_user, current_setting('role', true), auth.role(), auth.uid()::text;
end;
$$;

\echo '--- as anon ---'
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select * from public.probe_read_roles();
reset role;

\echo '--- as authenticated (a citizen) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666661","role":"authenticated"}';
select * from public.probe_read_roles();
reset role;

\echo '--- as service_role (the server) ---'
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select * from public.probe_read_roles();
reset role;

\echo ''
\echo '--- the same, but reached through a SECURITY DEFINER hop (as a real RPC is) ---'

create or replace function public.probe_hop()
returns text
language sql
security definer
set search_path = public
as $$
  select 'session=' || session_user || ' current=' || current_user
    || ' role_setting=' || current_setting('role', true)
    || ' auth_role=' || auth.role();
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666661","role":"authenticated"}';
select 'through the hop: ' || public.probe_hop() as reading;
reset role;

rollback;

\echo ''
\echo '=== is_moderator() from inside the guard? (it is SECURITY DEFINER) ==='

begin;

create or replace function public.probe_mod()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_moderator();
$$;

grant execute on function public.probe_mod() to anon, authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data)
values ('77777777-7777-4777-8777-777777777701', 'mod-probe@test.local',
        json_build_object('phone', '+8801711007701', 'role', 'moderator'));

\echo '--- the seeded profile role ---'
select role from public.profiles where id = '77777777-7777-4777-8777-777777777701';

set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777701","role":"authenticated"}';
select 'is_moderator() through the hop = ' || public.probe_mod()::text as reading;
reset role;

rollback;

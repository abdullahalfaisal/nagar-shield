-- Probe 14 — the role discriminator, compact.
begin;
create or replace function public.probe_read_roles()
returns text language plpgsql security definer set search_path = public as $$
begin
  return 'session=' || session_user
    || ' current=' || current_user
    || ' role_guc=' || current_setting('role', true)
    || ' auth_role=' || auth.role();
end; $$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select 'ANON:      ' || public.probe_read_roles();
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666661","role":"authenticated"}';
select 'AUTH:      ' || public.probe_read_roles();
reset role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select 'SERVICE:   ' || public.probe_read_roles();
reset role;

select 'NO-JWT:    ' || public.probe_read_roles();
rollback;

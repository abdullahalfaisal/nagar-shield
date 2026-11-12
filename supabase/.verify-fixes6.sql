-- Verify 6 — the INSERT path.
--
-- `profiles_update_guard` is a BEFORE UPDATE trigger. The INSERT path has its
-- own policy:
--
--   create policy "profiles_insert_own" on public.profiles for insert
--     with check (id = auth.uid());
--
-- If that policy is the only thing standing between a citizen and a
-- moderator, then the citizen can INSERT their own row with
-- `role = 'moderator'` — the same escalation as the UPDATE path, one door
-- further down the hall.

\echo '=== the INSERT escalation ==='

begin;

\echo '--- a citizen inserts their own profile with the moderator role ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999904","role":"authenticated"}';

do $$
begin
  insert into public.profiles (id, auth_user_id, phone, email, role)
  values ('99999999-9999-4999-8999-999999999904',
          '99999999-9999-4999-8999-999999999904',
          '+8801711009904', 'escalate-insert@test.local', 'moderator');
  raise notice 'UNEXPECTED: the INSERT was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

select 'the row exists' as test,
       count(*) = 1 as passed
  from public.profiles
 where id = '99999999-9999-4999-8999-999999999904';

select 'its role is moderator' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999904') = 'moderator' as passed;

rollback;

\echo ''
\echo '=== what a client INSERT can set? ==='

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999905","role":"authenticated"}';

do $$
begin
  insert into public.profiles (id, auth_user_id, phone, email, role, disabled_at, pii_purged_at, deleted_at)
  values ('99999999-9999-4999-8999-999999999905',
          '99999999-9999-4999-8999-999999999905',
          '+8801711009905', 'escalate-insert2@test.local', 'moderator',
          now(), now(), now());
  raise notice 'UNEXPECTED: the INSERT with every server column was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

rollback;

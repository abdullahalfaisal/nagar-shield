-- Verify 3 — the two open questions.
--
--   C5: a citizen cannot clear a SET deleted_at.
--   C6: a moderator CAN disable and re-enable another account.
--
-- C6 matters because the guard now gates `disabled_at` behind
-- `is_moderator()`, and the previous run showed `UPDATE 0` — zero rows
-- changed. The question is WHY: was the guard refusing it, or was the RLS
-- policy `profiles_moderator_update` the thing that matched no rows?

\echo '=== C5: a citizen cannot clear a SET deleted_at ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999902', 'undelete@test.local',
        json_build_object('phone', '+8801711009902'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999902","role":"authenticated"}';

\echo '--- the account is 40 days into its recovery window ---'
update public.profiles
   set deleted_at = now() - interval '40 days'
 where id = '99999999-9999-4999-8999-999999999902';

select 'C5-setup: deleted_at is set' as test,
       (select deleted_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999902') as passed;

\echo '--- now the citizen tries to clear it ---'
do $$
begin
  update public.profiles set deleted_at = null where id = '99999999-9999-4999-8999-999999999902';
  raise notice 'UNEXPECTED: clearing a SET deleted_at was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

select 'C5: the citizen cannot escape the purge window' as test,
       (select deleted_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999902') as passed;

reset role;

rollback;

\echo ''
\echo '=== C6: why did the moderator disable report UPDATE 0? ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999903', 'target@test.local',
        json_build_object('phone', '+8801711009903'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';

\echo '--- is the moderator recognised? ---'
select 'is_moderator() = ' || public.is_moderator()::text as reading;

\echo '--- can the moderator SEE the target row under RLS? ---'
select 'the moderator sees the target' as test,
       count(*) = 1 as passed
  from public.profiles
 where id = '99999999-9999-4999-8999-999999999903';

\echo '--- which policies apply to this UPDATE? ---'
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'profiles'
 order by policyname;

\echo '--- the disable itself ---'
update public.profiles
   set disabled_at = now()
 where id = '99999999-9999-4999-8999-999999999903';

select 'C6a: the moderator disabled the account' as test,
       (select disabled_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

\echo '--- the re-enable ---'
update public.profiles
   set disabled_at = null
 where id = '99999999-9999-4999-8999-999999999903';

select 'C6b: the moderator re-enabled the account' as test,
       (select disabled_at is null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

reset role;

rollback;

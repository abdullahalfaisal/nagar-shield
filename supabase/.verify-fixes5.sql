-- Verify 5 — isolate the moderator's direct UPDATE: RLS or the guard?
--
-- The trigger is dropped entirely for one run. If the update still reports
-- UPDATE 0, the RLS policy is what excluded the row, not the guard.

\echo '=== with NO trigger on profiles at all ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999903', 'target@test.local',
        json_build_object('phone', '+8801711009903'));

\echo '--- does the profile row exist at all? (as the table owner) ---'
select 'the target profile EXISTS' as test,
       count(*) = 1 as passed
  from public.profiles
 where id = '99999999-9999-4999-8999-999999999903';

drop trigger profiles_update_guard_trigger on public.profiles;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';

\echo '--- the moderator updates the target, with no trigger ---'
update public.profiles
   set disabled_at = now()
 where id = '99999999-9999-4999-8999-999999999903';

\echo '--- what does is_moderator() read in THIS session? ---'
select 'is_moderator() = ' || public.is_moderator()::text as reading;

\echo '--- and the moderator profile itself ---'
select 'the moderator row' as probe, id::text, role::text,
       (disabled_at is null)::text as not_disabled
  from public.profiles
 where id = '11111111-1111-1111-1111-1111111111a2';

reset role;

rollback;

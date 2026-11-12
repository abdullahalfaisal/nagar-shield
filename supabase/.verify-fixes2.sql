-- Verify 2 — the two assertions that Verify 1 got wrong, checked properly.
--
--   A4 (rewritten): the audit row's `target_user_id` now still RESOLVES to
--   the surviving tombstone. It is not nulled, because the profile row no
--   longer disappears — which is better than nulled. The assertion was wrong.
--
--   C5 (new): a citizen whose `deleted_at` IS set must not be able to clear
--   it. Verify 1 set it to null when it was already null, so the guard
--   correctly saw "no change" and allowed it. The real escape needs a set
--   value.
--
--   C6 (new): a moderator MUST still be able to disable another account and
--   to re-enable one, through the documented policy path.

\echo '=== A4 (rewritten): the audit trail still resolves the target ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-8444-444444444441', 'cascade@test.local',
        json_build_object('phone', '+8801711004441'));

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values (null,
        '11111111-1111-1111-1111-1111111111a2',
        '44444444-4444-4444-8444-444444444441',
        'remove', 'cascade probe');

delete from auth.users where id = '44444444-4444-4444-8444-444444444441';

select 'A4: the audit row survived' as test,
       (select count(*) from public.moderation_actions where note = 'cascade probe') = 1 as passed;

select 'A4b: the target STILL RESOLVES to the surviving tombstone' as test,
       (select target_user_id = '44444444-4444-4444-8444-444444444441'
          from public.moderation_actions where note = 'cascade probe') as passed;

rollback;

\echo ''
\echo '=== C5: a citizen cannot clear a SET deleted_at ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999902', 'undelete@test.local',
        json_build_object('phone', '+8801711009902'));

\echo '--- the account is 40 days into its recovery window ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999902","role":"authenticated"}';

perform_placeholder := null;

do $$
begin
  update public.profiles
     set deleted_at = now() - interval '40 days'
   where id = '99999999-9999-4999-8999-999999999902';
end;
$$;

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
\echo '=== C6: a moderator can still disable and re-enable ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999903', 'target@test.local',
        json_build_object('phone', '+8801711009903'));

-- The moderator account (seeded: 11111111-1111-1111-1111-1111111111a2).
select 'the moderator account is a moderator' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-1111111111a2') = 'moderator' as passed;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-1111111111a2","role":"authenticated"}';

\echo '--- the moderator disables another account ---'
update public.profiles
   set disabled_at = now()
 where id = '99999999-9999-4999-8999-999999999903';

select 'C6a: the moderator disabled the account' as test,
       (select disabled_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

\echo '--- the moderator re-enables it ---'
update public.profiles
   set disabled_at = null
 where id = '99999999-9999-4999-8999-999999999903';

select 'C6b: the moderator re-enabled the account' as test,
       (select disabled_at is null from public.profiles where id = '99999999-9999-4999-8999-999999999903') as passed;

\echo '--- but the moderator cannot change their OWN role ---'
do $$
begin
  update public.profiles set role = 'citizen' where id = '11111111-1111-1111-1111-1111111111a2';
  raise notice 'UNEXPECTED: the moderator changed their own role';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

reset role;

rollback;

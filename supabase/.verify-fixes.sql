-- Verify 1 — every fixed defect, exercised end to end.
--
--   A. The auth delete no longer destroys the profile, the reports, or the
--      audit trail (DEFECT A).
--   B. A direct UPDATE of the audit trail is still refused, and an
--      `ON DELETE SET NULL` referential action now completes (DEFECT B).
--   C. A citizen can no longer promote themselves to moderator (DEFECT C).
--   D. The purge can scrub a DISABLED account (DEFECT D).
--   E. The citizen can still edit the columns it owns.
--   F. The server-side write paths still work.

\echo '=== A: the auth delete preserves the tombstone, the report and the trail ==='

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

delete from auth.users where id = '44444444-4444-4444-8444-444444444441';

select 'A1: the profile tombstone SURVIVED the auth delete' as test,
       (select count(*) from public.profiles where id = '44444444-4444-4444-8444-444444444441') = 1 as passed;

select 'A2: the report row SURVIVED the auth delete' as test,
       (select count(*) from public.reports where id = '44444444-4444-4444-8444-444444444440') = 1 as passed;

select 'A3: the report metadata is INTACT' as test,
       (select category from public.reports where id = '44444444-4444-4444-8444-444444444440') = 'theft'
   and (select description from public.reports where id = '44444444-4444-4444-8444-444444444440') = 'cascade probe' as passed;

select 'A4: the audit row SURVIVED, with its FK nulled' as test,
       (select count(*) from public.moderation_actions where note = 'cascade probe') = 1
   and (select target_user_id is null from public.moderation_actions where note = 'cascade probe') as passed;

select 'A5: the auth linkage was nulled (that is the tombstone marker)' as test,
       (select auth_user_id is null from public.profiles where id = '44444444-4444-4444-8444-444444444441') as passed;

select 'A6: reports.author_id still resolves to the tombstone' as test,
       (select p.id is not null from public.reports r join public.profiles p on p.id = r.author_id
        where r.id = '44444444-4444-4444-8444-444444444440') as passed;

rollback;

\echo ''
\echo '=== B: the audit trail is still append-only, and the FK action now completes ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('88888888-8888-4888-8888-888888888888', 'fk-probe@test.local',
        json_build_object('phone', '+8801711008888'));

insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '88888888-8888-4888-8888-888888888887',
  '88888888-8888-4888-8888-888888888888',
  '88888888-8888-4888-8888-888888888886',
  23.7461, 90.3774, now(), 'fk probe', 'theft', 'anonymous', 'visible'
);

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values ('88888888-8888-4888-8888-888888888887',
        '11111111-1111-1111-1111-1111111111a2',
        '88888888-8888-4888-8888-888888888888',
        'remove', 'fk probe');

\echo '--- a DIRECT update of the trail must still be refused ---'
do $$
begin
  update public.moderation_actions set note = 'rewritten' where note = 'fk probe';
  raise notice 'UNEXPECTED: the direct update was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

select 'B1: the direct update changed nothing' as test,
       (select note from public.moderation_actions where note = 'fk probe') = 'fk probe' as passed;

\echo '--- deleting the referenced report must now SUCCEED ---'
delete from public.reports where id = '88888888-8888-4888-8888-888888888887';

select 'B2: the audit row survived its report, with report_id nulled' as test,
       (select count(*) from public.moderation_actions where note = 'fk probe') = 1
   and (select report_id is null from public.moderation_actions where note = 'fk probe') as passed;

select 'B3: the note itself was NOT touched' as test,
       (select note from public.moderation_actions where note = 'fk probe') = 'fk probe' as passed;

rollback;

\echo ''
\echo '=== C: a citizen can no longer escalate ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999901', 'escalate@test.local',
        json_build_object('phone', '+8801711009901'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999901","role":"authenticated"}';

do $$
begin
  update public.profiles set role = 'moderator' where id = '99999999-9999-4999-8999-999999999901';
  raise notice 'UNEXPECTED: the self-promotion was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

select 'C1: the citizen is still a citizen' as test,
       (select role from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'citizen' as passed;

select 'C2: is_moderator() is still false' as test,
       public.is_moderator() = false as passed;

do $$
begin
  update public.profiles set pii_purged_at = now() where id = '99999999-9999-4999-8999-999999999901';
  raise notice 'UNEXPECTED: forging the purge stamp was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

select 'C3: the citizen cannot forge its own purge stamp' as test,
       (select pii_purged_at from public.profiles where id = '99999999-9999-4999-8999-999999999901') is null as passed;

do $$
begin
  update public.profiles set deleted_at = null where id = '99999999-9999-4999-8999-999999999901';
  raise notice 'UNEXPECTED: clearing deleted_at was ALLOWED';
exception when others then
  raise notice 'refused as expected: %', sqlerrm;
end;
$$;

\echo '--- but the citizen CAN still edit the columns it owns ---'
update public.profiles
   set full_name = 'Still Mine', locale = 'en', theme = 'light'
 where id = '99999999-9999-4999-8999-999999999901';

select 'C4: the citizen can still edit its own display columns' as test,
       (select full_name from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'Still Mine'
   and (select locale from public.profiles where id = '99999999-9999-4999-8999-999999999901') = 'en' as passed;

reset role;

rollback;

\echo ''
\echo '=== D: the purge can scrub a DISABLED account ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('77777777-7777-4777-8777-777777777799', 'disabled-probe@test.local',
        json_build_object('phone', '+8801711007777'));

update public.profiles
   set disabled_at = now() - interval '60 days',
       deleted_at = now() - interval '31 days'
 where id = '77777777-7777-4777-8777-777777777799';

\echo '--- the purge write, as service_role (the job runner) ---'
set local role service_role;

update public.profiles
   set phone = 'purged-abcdefghijkl', email = 'purged-abcdefghijkl'
 where id = '77777777-7777-4777-8777-777777777799';

update public.profiles
   set pii_purged_at = now()
 where id = '77777777-7777-4777-8777-777777777799';

reset role;

select 'D1: the disabled account WAS scrubbed' as test,
       (select phone from public.profiles where id = '77777777-7777-4777-8777-777777777799') = 'purged-abcdefghijkl' as passed;

select 'D2: the purge stamp was written' as test,
       (select pii_purged_at is not null from public.profiles where id = '77777777-7777-4777-8777-777777777799') as passed;

rollback;

\echo ''
\echo '=== E: the server-side write paths still work ==='

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('55555555-5555-4555-8555-555555555551', 'paths@test.local',
        json_build_object('phone', '+8801711005551'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555551","role":"authenticated"}';

\echo '--- the biometric accounting (a server_side_write path) ---'
select public.record_biometric_attempt(false) ->> 'fail_count' as fail_count;

select 'E1: the biometric counter moved' as test,
       (select biometric_fail_count from public.profiles where id = '55555555-5555-4555-8555-555555555551') = 1 as passed;

\echo '--- the soft delete / restore path ---'
select public.soft_delete_account() ->> 'deleted_at' is not null as soft_deleted;
select public.restore_account() ->> 'deleted_at' is null as restored;

select 'E2: the soft delete and restore still work' as test,
       (select deleted_at from public.profiles where id = '55555555-5555-4555-8555-555555555551') is null as passed;

reset role;

rollback;

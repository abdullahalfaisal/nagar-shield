-- Probe: does deleting an auth user destroy the account's reports?
--
-- The purge job calls `auth.admin.deleteUser(userId)` and expects the
-- `profiles` row to survive as a tombstone. `profiles.id` references
-- `auth.users (id) on delete cascade`, so the cascade deletes the profile,
-- which cascades to `reports`. This probe proves it.

begin;

-- A throwaway account, a report it authored, and a moderation audit row on
-- that report (the state a moderated account is in).
insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-4999-8999-999999999999', 'purge-probe@test.local',
        json_build_object('phone', '+8801711009999'));

insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '99999999-9999-4999-8999-999999999998',
  '99999999-9999-4999-8999-999999999999',
  '99999999-9999-4999-8999-999999999997',
  23.7461, 90.3774, now(), 'purge probe', 'theft', 'anonymous', 'visible'
);

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values ('99999999-9999-4999-8999-999999999998',
        '11111111-1111-1111-1111-1111111111a2',
        '99999999-9999-4999-8999-999999999999',
        'remove', 'purge probe');

\echo '--- BEFORE the auth delete ---'
select
  (select count(*) from public.reports where id = '99999999-9999-4999-8999-999999999998') as report_rows,
  (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999999') as profile_rows,
  (select count(*) from public.moderation_actions where target_user_id = '99999999-9999-4999-8999-999999999999') as audit_rows;

\echo '--- deleting the auth user (what the purge job does) ---'
delete from auth.users where id = '99999999-9999-4999-8999-999999999999';

\echo '--- AFTER the auth delete ---'
select
  (select count(*) from public.reports where id = '99999999-9999-4999-8999-999999999998') as report_rows,
  (select count(*) from public.profiles where id = '99999999-9999-4999-8999-999999999999') as profile_rows,
  (select count(*) from public.moderation_actions where target_user_id = '99999999-9999-4999-8999-999999999999') as audit_rows;

rollback;

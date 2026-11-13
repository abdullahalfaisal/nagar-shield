-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/moderation_conflicts.sql
--
-- The server-side guarantees behind the moderation console's two decisions
-- and the account-deletion window.
--
--   M — `moderation_decide` must record **exactly one** decision per report.
--   N — `disable_user` must refuse a moderator target, a missing target, and
--       an already-disabled target.
--   D — `restore_account` must be time-boxed to its 30-day window, and a
--       soft-deleted account must not be able to write.
--
-- Why these exist
-- ---------------
-- The console **hides** the buttons that should not be offered — the disable
-- button is hidden on a moderator row, and the conflict banner has a branch
-- for a decision that has already been made. But a hidden button is not a
-- guarantee. The functions accepted a second decision, wrote a second audit
-- row, disabled another moderator, and restored an account past its window.
--
-- Every assertion below runs as a **client**, through the same mechanism
-- PostgREST uses. The `postgres` superuser has BYPASSRLS, so a suite that
-- ran as the superuser would see none of these defects.
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/moderation_conflicts.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('22222222-2222-2222-2222-222222222201', 'mod1@test.local',
   json_build_object('phone', '+8801711000201')),
  ('22222222-2222-2222-2222-222222222202', 'mod2@test.local',
   json_build_object('phone', '+8801711000202')),
  ('22222222-2222-2222-2222-222222222203', 'othermod@test.local',
   json_build_object('phone', '+8801711000203')),
  ('22222222-2222-2222-2222-222222222204', 'citizen@test.local',
   json_build_object('phone', '+8801711000204')),
  ('22222222-2222-2222-2222-222222222205', 'victim@test.local',
   json_build_object('phone', '+8801711000205')),
  ('22222222-2222-2222-2222-222222222206', 'deleted@test.local',
   json_build_object('phone', '+8801711000206'));

-- The `handle_new_user` trigger created the six profiles. Two of them are
-- moderators — one is the caller, one is the target of the role check.
update public.profiles
   set role = 'moderator'
 where id in ('22222222-2222-2222-2222-222222222201',
              '22222222-2222-2222-2222-222222222203');

-- A report that is pending review, so a decision on it is legitimate.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status, hide_reason
)
values (
  '22222222-2222-2222-2222-2222222222a1',
  '22222222-2222-2222-2222-222222222204',
  '33333333-3333-3333-3333-3333333333a1',
  23.8103, 90.4125, now(), 'a report to moderate',
  null, 'anonymous', 'hidden_pending_review', 'flag_threshold'
);

-- A second report, for the double-decision assertions.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status, hide_reason
)
values (
  '22222222-2222-2222-2222-2222222222a2',
  '22222222-2222-2222-2222-222222222204',
  '33333333-3333-3333-3333-3333333333a2',
  23.8103, 90.4125, now(), 'another report to moderate',
  null, 'anonymous', 'hidden_pending_review', 'flag_threshold'
);

-- -----------------------------------------------------------------------------
-- The client impersonation helper
-- -----------------------------------------------------------------------------

create or replace function pg_temp.as_client(user_id uuid, statement text)
returns text
language plpgsql
as $w$
declare
  v_error text := '';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_id, 'role', 'authenticated')::text, true);

  begin
    execute statement;
  exception when others then
    v_error := sqlerrm;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_error;
end;
$w$;

-- The same, but as the server: the service-role key, which bypasses RLS.
create or replace function pg_temp.as_service(statement text)
returns text
language plpgsql
as $w$
declare
  v_error text := '';
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims',
                     json_build_object('role', 'service_role')::text, true);

  begin
    execute statement;
  exception when others then
    v_error := sqlerrm;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_error;
end;
$w$;

-- =============================================================================
-- M — one decision per report
-- =============================================================================

-- The first decision succeeds and records exactly one audit row.
select 'Test M1: the first decision is accepted' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a1',
                  'restore',
                  'restored by the test');$w$
       ) = '' as passed;

select 'Test M2: the first decision wrote exactly one audit row' as test,
       (select count(*) from public.moderation_actions
         where report_id = '22222222-2222-2222-2222-2222222222a1') = 1 as passed;

select 'Test M3: the report is now restored' as test,
       (select moderation_status from public.reports
         where id = '22222222-2222-2222-2222-2222222222a1') = 'restored' as passed;

-- The second decision is refused with CONFLICT.
select 'Test M4: a second decision on the same report is refused with CONFLICT' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a1',
                  'remove',
                  'a second, contradictory decision');$w$
       ) = 'CONFLICT' as passed;

-- The refusal wrote **no** second row. This is the assertion that matters:
-- the trail must record the one decision that happened, not two.
select 'Test M5: the refused second decision wrote NO second audit row' as test,
       (select count(*) from public.moderation_actions
         where report_id = '22222222-2222-2222-2222-2222222222a1') = 1 as passed;

-- The status was not overwritten by the refused decision.
select 'Test M6: the refused decision did not overwrite the status' as test,
       (select moderation_status from public.reports
         where id = '22222222-2222-2222-2222-2222222222a1') = 'restored' as passed;

-- The first decision is still the one on record.
select 'Test M7: the recorded decision is still the original one' as test,
       (select decision from public.moderation_actions
         where report_id = '22222222-2222-2222-2222-2222222222a1') = 'restore' as passed;

-- The second report, decided once, is the same story — the guard is on the
-- report's state, not on the particular report id.
select 'Test M8: the second decision on another report is refused with CONFLICT' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a2',
                  'restore',
                  'the first decision');$w$
       ) = '' as passed;

select 'Test M9: the second decision on that report is refused with CONFLICT' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a2',
                  'remove',
                  'a second decision');$w$
       ) = 'CONFLICT' as passed;

select 'Test M10: that report also has exactly one audit row' as test,
       (select count(*) from public.moderation_actions
         where report_id = '22222222-2222-2222-2222-2222222222a2') = 1 as passed;

-- A **visible** report has had no decision at all, so a decision on it is
-- also a conflict — there is nothing pending review to decide.
select 'Test M11: a decision on a report that is not pending review is refused with CONFLICT' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a1',
                  'remove',
                  'a decision on a decided report');$w$
       ) = 'CONFLICT' as passed;

-- A report that does not exist is NOT_FOUND, and writes nothing.
select 'Test M12: a decision on a missing report is refused with NOT_FOUND' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-222222222299',
                  'restore',
                  'a decision on a report that does not exist');$w$
       ) = 'NOT_FOUND' as passed;

select 'Test M13: the missing-report decision wrote no audit row' as test,
       (select count(*) from public.moderation_actions
         where report_id = '22222222-2222-2222-2222-222222222299') = 0 as passed;

-- A non-moderator is still refused, and writes nothing.
select 'Test M14: a non-moderator cannot decide' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222204',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a2',
                  'restore',
                  'a citizen trying to decide');$w$
       ) = 'FORBIDDEN' as passed;

select 'Test M15: the non-moderator decision wrote no audit row' as test,
       (select count(*) from public.moderation_actions
         where report_id = '22222222-2222-2222-2222-2222222222a2'
           and moderator_id = '22222222-2222-2222-2222-222222222204') = 0 as passed;

-- An empty note is still refused, and writes nothing.
select 'Test M16: a decision with an empty note is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.moderation_decide(
                  '22222222-2222-2222-2222-2222222222a2',
                  'restore',
                  '   ');$w$
       ) = 'NOTE_REQUIRED' as passed;

-- =============================================================================
-- N — disable_user's refusals
-- =============================================================================

-- A moderator disables a citizen. That is the legitimate path.
select 'Test N1: a moderator can disable a citizen' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222205',
                  'disabled by the test');$w$
       ) = '' as passed;

select 'Test N2: the disabled_at is set' as test,
       (select disabled_at is not null from public.profiles
         where id = '22222222-2222-2222-2222-222222222205') as passed;

select 'Test N3: the disable wrote exactly one audit row' as test,
       (select count(*) from public.moderation_actions
         where target_user_id = '22222222-2222-2222-2222-222222222205'
           and decision = 'disable_user') = 1 as passed;

-- The same account, disabled again, is a CONFLICT — and writes no second row.
select 'Test N4: disabling an already-disabled account is refused with CONFLICT' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222205',
                  'a second disable');$w$
       ) = 'CONFLICT' as passed;

select 'Test N5: the refused re-disable wrote NO second audit row' as test,
       (select count(*) from public.moderation_actions
         where target_user_id = '22222222-2222-2222-2222-222222222205'
           and decision = 'disable_user') = 1 as passed;

-- A moderator cannot disable another moderator. The console hides the button;
-- this is the guarantee.
select 'Test N6: a moderator cannot disable another moderator' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222203',
                  'disabling a fellow moderator');$w$
       ) = 'FORBIDDEN' as passed;

select 'Test N7: the refused moderator disable did NOT set disabled_at' as test,
       (select disabled_at is null from public.profiles
         where id = '22222222-2222-2222-2222-222222222203') as passed;

select 'Test N8: the refused moderator disable wrote no audit row' as test,
       (select count(*) from public.moderation_actions
         where target_user_id = '22222222-2222-2222-2222-222222222203') = 0 as passed;

-- A moderator cannot disable themselves.
select 'Test N9: a moderator cannot disable themselves' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222201',
                  'disabling myself');$w$
       ) = 'CANNOT_DISABLE_SELF' as passed;

-- A target that does not exist is NOT_FOUND, and writes nothing. The old
-- function wrote an audit row for a user who was never there.
select 'Test N10: disabling a user who does not exist is refused with NOT_FOUND' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222299',
                  'disabling a user who does not exist');$w$
       ) = 'NOT_FOUND' as passed;

select 'Test N11: the missing-target disable wrote no audit row' as test,
       (select count(*) from public.moderation_actions
         where target_user_id = '22222222-2222-2222-2222-222222222299') = 0 as passed;

-- A non-moderator cannot disable anyone.
select 'Test N12: a non-moderator cannot disable an account' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222204',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222206',
                  'a citizen trying to disable');$w$
       ) = 'FORBIDDEN' as passed;

select 'Test N13: the non-moderator disable did NOT set disabled_at' as test,
       (select disabled_at is null from public.profiles
         where id = '22222222-2222-2222-2222-222222222206') as passed;

-- An empty note is refused, and writes nothing.
select 'Test N14: a disable with an empty note is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222201',
         $w$select public.disable_user(
                  '22222222-2222-2222-2222-222222222206',
                  '   ');$w$
       ) = 'NOTE_REQUIRED' as passed;

-- =============================================================================
-- D — the deletion window, and the writes a deleted account may not make
-- =============================================================================

-- The account soft-deletes itself.
select 'Test D1: an account can soft-delete itself' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$select public.soft_delete_account();$w$
       ) = '' as passed;

select 'Test D2: the deleted_at is set' as test,
       (select deleted_at is not null from public.profiles
         where id = '22222222-2222-2222-2222-222222222206') as passed;

-- The account can still read — it needs to read to see the recovery screen.
select 'Test D3: a deleted account can still read its own profile' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$select count(*) from public.profiles
            where id = '22222222-2222-2222-2222-222222222206';$w$
       ) = '' as passed;

-- But it may not WRITE. The old guard asked only about `disabled_at`, so a
-- soft-deleted account could still create contacts and file reports.
select 'Test D4: a deleted account cannot insert a contact' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$insert into public.contacts (user_id, name, phone)
            values ('22222222-2222-2222-2222-222222222206', 'a contact', '+8801711000999');$w$
       ) <> '' as passed;

select 'Test D5: the deleted account''s contact insert wrote NO row' as test,
       (select count(*) from public.contacts
         where phone = '+8801711000999') = 0 as passed;

select 'Test D6: a deleted account cannot share a location' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$insert into public.location_shares (sender_id, lat, lng, share_channel)
            values ('22222222-2222-2222-2222-222222222206', 23.8103, 90.4125, 'app');$w$
       ) <> '' as passed;

select 'Test D7: the deleted account''s location share wrote NO row' as test,
       (select count(*) from public.location_shares
         where sender_id = '22222222-2222-2222-2222-222222222206') = 0 as passed;

-- The account can still restore itself inside the window — that is the
-- whole point of the grace period.
select 'Test D8: a deleted account can restore itself inside the window' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$select public.restore_account();$w$
       ) = '' as passed;

select 'Test D9: the restore cleared the deleted_at' as test,
       (select deleted_at is null from public.profiles
         where id = '22222222-2222-2222-2222-222222222206') as passed;

-- The account can write again once it is restored.
select 'Test D10: a restored account can write again' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$insert into public.contacts (user_id, name, phone)
            values ('22222222-2222-2222-2222-222222222206', 'a contact', '+8801711000999');$w$
       ) = '' as passed;

-- Now the window. A deletion dated **31 days ago** is past its 30 days, so
-- the restore must be refused.
update public.profiles
   set deleted_at = now() - interval '31 days'
 where id = '22222222-2222-2222-2222-222222222206';

select 'Test D11: a restore past the 30-day window is refused with VALIDATION_FAILED' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$select public.restore_account();$w$
       ) = 'VALIDATION_FAILED' as passed;

select 'Test D12: the refused restore did NOT clear the deleted_at' as test,
       (select deleted_at is not null from public.profiles
         where id = '22222222-2222-2222-2222-222222222206') as passed;

-- A deletion dated **29 days ago** is still inside the window, so the
-- restore must succeed. The boundary is inclusive of the window and
-- exclusive of its end.
update public.profiles
   set deleted_at = now() - interval '29 days'
 where id = '22222222-2222-2222-2222-222222222206';

select 'Test D13: a restore inside the 30-day window succeeds' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$select public.restore_account();$w$
       ) = '' as passed;

select 'Test D14: the inside-window restore cleared the deleted_at' as test,
       (select deleted_at is null from public.profiles
         where id = '22222222-2222-2222-2222-222222222206') as passed;

-- A restore of an account that was never deleted is a conflict, not a
-- silent no-op.
select 'Test D15: restoring an account that is not deleted is refused with CONFLICT' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$select public.restore_account();$w$
       ) = 'CONFLICT' as passed;

-- The deleted account's writes are still refused after the restore failed
-- once — the state is what matters, not the attempt.
update public.profiles
   set deleted_at = now() - interval '31 days'
 where id = '22222222-2222-2222-2222-222222222206';

select 'Test D16: an account past its window still cannot write' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-222222222206',
         $w$insert into public.contacts (user_id, name, phone)
            values ('22222222-2222-2222-2222-222222222206', 'another', '+8801711000998');$w$
       ) <> '' as passed;

rollback;

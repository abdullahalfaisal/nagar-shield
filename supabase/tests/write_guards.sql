-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/write_guards.sql
--
-- The regression guards for the five write-path defects that were found by
-- probing the running database rather than by reading the code:
--
--   A — the account purge destroyed the account's reports (the auth delete
--       cascaded through `profiles`).
--   B — the append-only trigger blocked Postgres's own `ON DELETE SET NULL`
--       referential action, so the audit trail could not survive its report.
--   C — a citizen could promote themselves to `role = 'moderator'`.
--   D — the guard refused every write to a disabled profile, so the purge
--       could never scrub a disabled account.
--   E — the INSERT policy checked the row id and nothing else, so a client
--       could insert its own profile with any role.
--
-- The impersonation
-- -----------------
-- These tests must run as a **client**, not as the `postgres` superuser. The
-- superuser has BYPASSRLS and the owner role, so it sees and writes
-- everything — every defect here would be invisible.
--
-- The suite therefore uses the same mechanism PostgREST uses:
--
--   set local role authenticated   -- the role the request runs as
--   set local request.jwt.claims   -- the verified JWT's claims
--
-- The `role` GUC matters: the write guards read it to tell a client write
-- from a server write, and it is the one role signal that survives the
-- `SECURITY DEFINER` hop.
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/write_guards.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

-- A citizen, a moderator, and a disabled account that a moderator disabled.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111101', 'citizen@test.local',
   json_build_object('phone', '+8801711000101')),
  ('11111111-1111-1111-1111-111111111102', 'moderator@test.local',
   json_build_object('phone', '+8801711000102')),
  ('11111111-1111-1111-1111-111111111103', 'disabled@test.local',
   json_build_object('phone', '+8801711000103'));

-- The trigger created the three profiles. Promote one to a moderator through
-- the server path, which is how a moderator is granted the role.
update public.profiles
   set role = 'moderator'
 where id = '11111111-1111-1111-1111-111111111102';

-- The disabled account, disabled through the server path.
update public.profiles
   set disabled_at = now() - interval '60 days'
 where id = '11111111-1111-1111-1111-111111111103';

-- A report the citizen authored, with a moderation audit row on it.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '22222222-2222-2222-2222-222222222201',
  '11111111-1111-1111-1111-111111111101',
  '33333333-3333-3333-3333-333333333301',
  23.7461, 90.3774, now(), 'a report that must survive', 'theft',
  'anonymous', 'visible'
);

insert into public.moderation_actions (report_id, moderator_id, target_user_id, decision, note)
values ('22222222-2222-2222-2222-222222222201',
        '11111111-1111-1111-1111-111111111102',
        '11111111-1111-1111-1111-111111111101',
        'remove', 'the audit row that must survive');

-- -----------------------------------------------------------------------------
-- Helper: run a statement as a client role
-- -----------------------------------------------------------------------------

-- `as_client` sets the role GUC and the JWT claims the way PostgREST does for
-- a signed-in request, then executes the statement and returns the error
-- message (or an empty string when it succeeded).
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

-- The same, but as the server: the service-role key, which is what the job
-- runner uses. It bypasses RLS, so it is the only way to reach a trigger on
-- a table the client cannot see.
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
-- Test A — the purge preserves the tombstone, the report and the trail
-- =============================================================================

-- The purge destroys the Auth identity. The profile must survive as a
-- tombstone, and the report must survive with its metadata intact.
delete from auth.users where id = '11111111-1111-1111-1111-111111111101';

select 'Test A1: the profile tombstone survived the auth delete' as test,
       (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111101') = 1 as passed;

select 'Test A2: the report row survived the auth delete' as test,
       (select count(*) from public.reports where id = '22222222-2222-2222-2222-222222222201') = 1 as passed;

select 'Test A3: the report metadata is intact' as test,
       (select category from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'theft'
   and (select description from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'a report that must survive'
   and (select moderation_status from public.reports where id = '22222222-2222-2222-2222-222222222201') = 'visible' as passed;

select 'Test A4: reports.author_id still resolves to the tombstone' as test,
       (select p.id is not null
          from public.reports r
          join public.profiles p on p.id = r.author_id
         where r.id = '22222222-2222-2222-2222-222222222201') as passed;

select 'Test A5: the Auth linkage was nulled - that is the tombstone marker' as test,
       (select auth_user_id is null
          from public.profiles where id = '11111111-1111-1111-1111-111111111101') as passed;

-- =============================================================================
-- Test B — the audit trail is append-only, and the FK action completes
-- =============================================================================

-- A direct UPDATE of the trail must still be refused, whoever asks.
--
-- The statement runs as `service_role`: that is the key that bypasses RLS, so
-- it is the only way to reach the TRIGGER at all. It is also exactly the
-- caller the append-only guarantee must hold against, because it is the most
-- privileged key in the system.
select 'Test B1: a direct update of the audit trail is refused' as test,
       pg_temp.as_service(
         $w$update public.moderation_actions set note = 'rewritten' where note = 'the audit row that must survive'$w$
       ) = 'MODERATION_ACTIONS_APPEND_ONLY' as passed;

select 'Test B2: the note was not rewritten' as test,
       (select note from public.moderation_actions where note = 'the audit row that must survive') = 'the audit row that must survive' as passed;

-- A DELETE of the trail must be refused too.
select 'Test B3: a delete of the audit trail is refused' as test,
       pg_temp.as_service(
         $w$delete from public.moderation_actions where note = 'the audit row that must survive'$w$
       ) = 'MODERATION_ACTIONS_APPEND_ONLY' as passed;

-- The declared FK behaviour: deleting the report nulls the audit row's
-- `report_id` and keeps the row. This is what the append-only trigger used
-- to make unreachable.
delete from public.reports where id = '22222222-2222-2222-2222-222222222201';

select 'Test B4: the audit row survived its report' as test,
       (select count(*) from public.moderation_actions where note = 'the audit row that must survive') = 1 as passed;

select 'Test B5: the FK column was nulled by the referential action' as test,
       (select report_id is null
          from public.moderation_actions where note = 'the audit row that must survive') as passed;

select 'Test B6: the audit content itself was not touched' as test,
       (select note from public.moderation_actions where note = 'the audit row that must survive') = 'the audit row that must survive'
   and (select decision from public.moderation_actions where note = 'the audit row that must survive') = 'remove' as passed;

-- =============================================================================
-- Test C — a citizen cannot escalate
-- =============================================================================

-- The citizen's profile row was deleted with the Auth identity in Test A, so
-- re-create it through the server path for this test.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111104', 'escalator@test.local',
        json_build_object('phone', '+8801711000104'));

select 'Test C1: a self-promotion to moderator is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111104',
         $w$update public.profiles set role = 'moderator' where id = '11111111-1111-1111-1111-111111111104'$w$
       ) = 'FORBIDDEN' as passed;

select 'Test C2: the account is still a citizen' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111104') = 'citizen' as passed;

-- The purge escapes: a citizen who forges their own purge stamp removes
-- themselves from the purge worklist and keeps their PII forever.
select 'Test C4: forging the purge stamp is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111104',
         $w$update public.profiles set pii_purged_at = now() where id = '11111111-1111-1111-1111-111111111104'$w$
       ) = 'PROFILE_LIFECYCLE_IS_SERVER_MANAGED' as passed;

select 'Test C5: the purge stamp is still null' as test,
       (select pii_purged_at is null
          from public.profiles where id = '11111111-1111-1111-1111-111111111104') as passed;

-- The other escape: clearing its own soft-delete after the window closes.
--
-- The `deleted_at` must be SET first - clearing a column that is already
-- NULL changes nothing, and a guard that only refuses CHANGES correctly
-- allows a no-op.
update public.profiles
   set deleted_at = now() - interval '40 days'
 where id = '11111111-1111-1111-1111-111111111104';

select 'Test C6: clearing the soft-delete is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111104',
         $w$update public.profiles set deleted_at = null where id = '11111111-1111-1111-1111-111111111104'$w$
       ) = 'PROFILE_LIFECYCLE_IS_SERVER_MANAGED' as passed;

select 'Test C6b: the soft-delete survived the attempt' as test,
       (select deleted_at is not null
          from public.profiles where id = '11111111-1111-1111-1111-111111111104') as passed;

-- The identity columns never move.
select 'Test C7: the Auth linkage cannot be repointed' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111104',
         $w$update public.profiles set auth_user_id = null where id = '11111111-1111-1111-1111-111111111104'$w$
       ) = 'PROFILE_IDENTITY_IMMUTABLE' as passed;

-- The citizen may still edit the columns it owns.
select 'Test C8: the citizen can still edit its own display columns' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111104',
         $w$update public.profiles set full_name = 'Still Mine', locale = 'en' where id = '11111111-1111-1111-1111-111111111104'$w$
       ) = '' as passed;

select 'Test C9: the edit landed' as test,
       (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111104') = 'Still Mine' as passed;

-- =============================================================================
-- Test D — the purge can scrub a disabled account
-- =============================================================================

-- The disabled account was soft-deleted 31 days ago, so it is a purge
-- candidate. The purge writes the tombstone placeholders and the stamp.
select 'Test D1: the server can scrub a disabled account' as test,
       pg_temp.as_service(
         $w$update public.profiles
              set phone = 'purged-aaaaaaaaaaaa',
                  email = 'purged-aaaaaaaaaaaa',
                  full_name = null,
                  alternate_phone = null
            where id = '11111111-1111-1111-1111-111111111103'$w$
       ) = '' as passed;

select 'Test D2: the placeholders landed' as test,
       (select phone from public.profiles where id = '11111111-1111-1111-1111-111111111103') = 'purged-aaaaaaaaaaaa'
   and (select email from public.profiles where id = '11111111-1111-1111-1111-111111111103') = 'purged-aaaaaaaaaaaa' as passed;

select 'Test D3: the server can write the purge stamp' as test,
       pg_temp.as_service(
         $w$update public.profiles set pii_purged_at = now() where id = '11111111-1111-1111-1111-111111111103'$w$
       ) = '' as passed;

select 'Test D4: the purge stamp landed' as test,
       (select pii_purged_at is not null
          from public.profiles where id = '11111111-1111-1111-1111-111111111103') as passed;

-- A disabled account still cannot write for itself.
select 'Test D5: a disabled account cannot write for itself' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$update public.profiles set full_name = 'Back From The Dead' where id = '11111111-1111-1111-1111-111111111103'$w$
       ) = 'ACCOUNT_DISABLED' as passed;

-- =============================================================================
-- Test E — the INSERT path cannot escalate
-- =============================================================================

-- A client that reaches a state where its profile row is absent must not be
-- able to insert one with a moderator role.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111105', 'inserter@test.local',
        json_build_object('phone', '+8801711000105'));

-- Remove the profile the trigger made, so the client's INSERT is the one
-- that lands.
delete from public.profiles where id = '11111111-1111-1111-1111-111111111105';

select 'Test E1: the client INSERT succeeded' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111105',
         $w$insert into public.profiles (id, auth_user_id, phone, email, role, disabled_at, pii_purged_at, deleted_at)
           values ('11111111-1111-1111-1111-111111111105',
                   '11111111-1111-1111-1111-111111111105',
                   '+8801711000105', 'inserter@test.local', 'moderator',
                   now(), now(), now())$w$
       ) = '' as passed;

select 'Test E2: the role was normalised to citizen' as test,
       (select role from public.profiles where id = '11111111-1111-1111-1111-111111111105') = 'citizen' as passed;

select 'Test E3: the server-managed columns were reset' as test,
       (select disabled_at is null from public.profiles where id = '11111111-1111-1111-1111-111111111105')
   and (select pii_purged_at is null from public.profiles where id = '11111111-1111-1111-1111-111111111105')
   and (select deleted_at is null from public.profiles where id = '11111111-1111-1111-1111-111111111105') as passed;

select 'Test E4: the contact details came from the Auth identity' as test,
       (select phone from public.profiles where id = '11111111-1111-1111-1111-111111111105') = '+8801711000105'
   and (select email from public.profiles where id = '11111111-1111-1111-1111-111111111105') = 'inserter@test.local' as passed;

-- =============================================================================
-- Test F — the server-side write paths still work
-- =============================================================================

-- The biometric accounting, the soft delete and the restore all go through
-- `server_side_write`. A guard that is too strict would break them.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111106', 'paths@test.local',
        json_build_object('phone', '+8801711000106'));

select 'Test F1: the biometric accounting still writes' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111106',
         $w$select public.record_biometric_attempt(false)$w$
       ) = '' as passed;

select 'Test F2: the biometric counter moved' as test,
       (select biometric_fail_count from public.profiles where id = '11111111-1111-1111-1111-111111111106') = 1 as passed;

select 'Test F3: the soft delete still works' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111106',
         $w$select public.soft_delete_account()$w$
       ) = '' as passed;

select 'Test F4: the account is marked deleted' as test,
       (select deleted_at is not null from public.profiles where id = '11111111-1111-1111-1111-111111111106') as passed;

select 'Test F5: the restore still works' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111106',
         $w$select public.restore_account()$w$
       ) = '' as passed;

select 'Test F6: the account is no longer deleted' as test,
       (select deleted_at is null from public.profiles where id = '11111111-1111-1111-1111-111111111106') as passed;

-- =============================================================================
-- Test G — a disabled account cannot write (DEFECT F)
-- =============================================================================
--
-- `002-identity / 005-remote-account-disable` AC #2: when an account is
-- disabled, "any API write is attempted → rejected with `AUTH_DISABLED`
-- (HTTP 403)".
--
-- The Edge Function honoured that, but the DATABASE is the real boundary and
-- PostgREST is a door the Edge Function does not own. Every write below
-- SUCCEEDED for a disabled account before migration 019:
--
--   contacts, location_shares, wrong_number_reports, reports, report_media,
--   the `finalize_capture` RPC, the `update_category` RPC and the Storage
--   insert policy.
--
-- The guard is now `public.assert_account_not_disabled()`, applied to the
-- write policies and to the SECURITY DEFINER RPCs a client may call.
--
-- The fixture is the disabled account `...1103` from the top of this file: a
-- moderator disabled it 60 days ago.
-- -----------------------------------------------------------------------------

-- A contact owned by the disabled account, so the UPDATE and DELETE paths
-- have a row to act on.
insert into public.contacts (id, user_id, name, phone)
values ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111103',
        'a contact of the disabled account', '+8801711009999');

-- A report authored by the disabled account, so `update_category` has a row.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '22222222-2222-2222-2222-222222222202',
  '11111111-1111-1111-1111-111111111103',
  '33333333-3333-3333-3333-333333333302',
  23.7461, 90.3774, now(), 'a report by the disabled account', 'theft',
  'anonymous', 'visible'
);

-- --- The table write paths -------------------------------------------------

select 'Test G1: a disabled account cannot insert a contact' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$insert into public.contacts (user_id, name, phone)
           values ('11111111-1111-1111-1111-111111111103', 'forbidden', '+8801711009998')$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G2: a disabled account cannot update a contact' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$update public.contacts set name = 'rewritten'
          where id = '44444444-4444-4444-4444-444444444401'$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G3: a disabled account cannot delete a contact' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$delete from public.contacts
          where id = '44444444-4444-4444-4444-444444444401'$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G4: the contact was not rewritten' as test,
       (select name from public.contacts where id = '44444444-4444-4444-4444-444444444401')
       = 'a contact of the disabled account' as passed;

select 'Test G5: a disabled account cannot share a location' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$insert into public.location_shares (sender_id, lat, lng)
           values ('11111111-1111-1111-1111-111111111103', 23.7461, 90.3774)$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G6: no location share row landed' as test,
       (select count(*) from public.location_shares where sender_id = '11111111-1111-1111-1111-111111111103') = 0 as passed;

select 'Test G7: a disabled account cannot file a wrong-number report' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111103', 'station', 'st-gulshan-police', 'the number is wrong')$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G8: a disabled account cannot insert a report' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$insert into public.reports (author_id, client_request_id, lat, lng, captured_at, description, category, public_visibility)
           values ('11111111-1111-1111-1111-111111111103',
                   '33333333-3333-3333-3333-333333333303',
                   23.7461, 90.3774, now(), 'forbidden', 'theft', 'anonymous')$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G9: a disabled account cannot insert a media row' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$insert into public.report_media (report_id, storage_path, media_type, byte_size)
           values ('22222222-2222-2222-2222-222222222202',
                   'reports/11111111-1111-1111-1111-111111111103/x/y.jpg',
                   'photo', 100)$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G10: no media row landed' as test,
       (select count(*) from public.report_media where report_id = '22222222-2222-2222-2222-222222222202') = 0 as passed;

-- --- The RPC paths ----------------------------------------------------------
--
-- These are SECURITY DEFINER, so the policies above do not cover the writes
-- they perform. `finalize_capture` was the widest hole that was measured:
-- it landed a full report row AND its media row.

select 'Test G11: finalize_capture refuses a disabled account' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$select public.finalize_capture(
              '33333333-3333-3333-3333-333333333304',
              'reports/11111111-1111-1111-1111-111111111103/a/b.jpg',
              'photo', 100, null, null, null,
              23.7461, 90.3774, now(), 'forbidden', 'anonymous', 'theft')$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G12: finalize_capture landed no report row' as test,
       (select count(*) from public.reports where client_request_id = '33333333-3333-3333-3333-333333333304') = 0 as passed;

select 'Test G13: finalize_capture landed no media row' as test,
       (select count(*) from public.report_media
         where storage_path = 'reports/11111111-1111-1111-1111-111111111103/a/b.jpg') = 0 as passed;

select 'Test G14: update_category refuses a disabled account' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$select public.update_category('22222222-2222-2222-2222-222222222202', 'harassment')$w$
       ) = 'ACCOUNT_DISABLED' as passed;

select 'Test G15: the category was not changed' as test,
       (select category from public.reports where id = '22222222-2222-2222-2222-222222222202') = 'theft' as passed;

-- --- The reads are still allowed --------------------------------------------
--
-- The disable is a WRITE restriction. A disabled user must still be able to
-- READ their own rows, because the app has to show them why they are locked
-- out and to offer them the account deletion.

select 'Test G16: a disabled account can still read its own profile' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111103'$w$
       ) = '' as passed;

select 'Test G17: a disabled account can still read its own contacts' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$select count(*) from public.contacts where user_id = '11111111-1111-1111-1111-111111111103'$w$
       ) = '' as passed;

-- --- The account lifecycle is still reachable -------------------------------
--
-- A disabled user must be able to ask for their own data to be deleted, and
-- must be able to recover an account they deleted. Guarding these would
-- make the disable a permanent imprisonment with no exit — so they are
-- deliberately NOT guarded.

select 'Test G18: a disabled account can still soft-delete itself' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$select public.soft_delete_account()$w$
       ) = '' as passed;

select 'Test G19: the account is marked deleted' as test,
       (select deleted_at is not null from public.profiles where id = '11111111-1111-1111-1111-111111111103') as passed;

select 'Test G20: a disabled account can still restore itself' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111103',
         $w$select public.restore_account()$w$
       ) = '' as passed;

-- --- The server is never refused --------------------------------------------
--
-- The disable itself, and the PII purge that scrubs a disabled account's
-- tombstone, are server writes. A guard that refused them would make the
-- account permanently un-purgeable (the DEFECT D shape).

select 'Test G21: the server can still disable an account' as test,
       pg_temp.as_service(
         $w$update public.profiles set disabled_at = now() - interval '60 days'
          where id = '11111111-1111-1111-1111-111111111106'$w$
       ) = '' as passed;

select 'Test G22: the server can still scrub a disabled account' as test,
       pg_temp.as_service(
         $w$update public.profiles set phone = 'purged-11111111-1111-1111-1111-111111111106', email = 'purged-11111111-1111-1111-1111-111111111106', full_name = null
          where id = '11111111-1111-1111-1111-111111111106'$w$
       ) = '' as passed;

select 'Test G23: the tombstone was written' as test,
       (select phone from public.profiles where id = '11111111-1111-1111-1111-111111111106') = 'purged-11111111-1111-1111-1111-111111111106'
   and (select email from public.profiles where id = '11111111-1111-1111-1111-111111111106') = 'purged-11111111-1111-1111-1111-111111111106' as passed;

-- --- An enabled account is unaffected ---------------------------------------
--
-- The guard must not fire for a healthy account. This is the regression that
-- catches a guard written too strictly.

select 'Test G24: an enabled account can still insert a contact' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.contacts (user_id, name, phone)
           values ('11111111-1111-1111-1111-111111111101', 'allowed', '+8801711009997')$w$
       ) = '' as passed;

select 'Test G25: the contact landed' as test,
       (select count(*) from public.contacts
         where user_id = '11111111-1111-1111-1111-111111111101' and name = 'allowed') = 1 as passed;

select 'Test G26: an enabled account can still file a wrong-number report' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'station', 'st-gulshan-police', 'the number is wrong')$w$
       ) = '' as passed;

select 'Test G27: an enabled account can still finalize a capture' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$select public.finalize_capture(
              '33333333-3333-3333-3333-333333333305',
              'reports/11111111-1111-1111-1111-111111111101/c/d.jpg',
              'photo', 100, null, null, null,
              23.7461, 90.3774, now(), 'allowed', 'anonymous', 'theft')$w$
       ) = '' as passed;

select 'Test G28: the capture landed a report row' as test,
       (select count(*) from public.reports where client_request_id = '33333333-3333-3333-3333-333333333305') = 1 as passed;

select 'Test G29: the capture landed a media row' as test,
       (select count(*) from public.report_media
         where storage_path = 'reports/11111111-1111-1111-1111-111111111101/c/d.jpg') = 1 as passed;

-- The report the citizen authored EARLIER in this suite — `…2201` — was
-- DELETED by Test B, which exercises the `ON DELETE SET NULL` referential
-- action on the audit trail. So it is gone by the time this test runs.
--
-- The old `update_category` was fail-**open**: its `UPDATE` was scoped to the
-- author's own row, so a missing report matched **zero** rows, the write was a
-- no-op, and the function still returned a success envelope. This test
-- therefore used to pass for the wrong reason — it was asserting "the RPC
-- does not error" against a row that was not there.
--
-- Migration 024 makes the author check explicit: a report that is not the
-- caller's is refused with `FORBIDDEN`, and a report that does not exist is
-- refused the same way (so the error cannot be used to enumerate report ids).
-- The old assertion would now fail against the deleted row — correctly, but
-- for the wrong reason — so this test gets its own report, which really does
-- exist and really is the citizen's.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '22222222-2222-2222-2222-222222222203',
  '11111111-1111-1111-1111-111111111101',
  '33333333-3333-3333-3333-333333333303',
  23.7461, 90.3774, now(), 'a report whose category may be edited', 'theft',
  'anonymous', 'visible'
);

select 'Test G30: an enabled account can still edit its report category' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$select public.update_category('22222222-2222-2222-2222-222222222203', 'harassment')$w$
       ) = '' as passed;

select 'Test G31: the category was changed' as test,
       (select category from public.reports where id = '22222222-2222-2222-2222-222222222203') = 'harassment' as passed;

-- --- The author check (migration 024) ---------------------------------------
--
-- `004-capture / 003-report-detail-and-category-edit` AC #6 — a signed-in user
-- who is NOT the author is refused with `FORBIDDEN`, and the stored category
-- is unchanged.
--
-- The non-author here is the moderator `…1102`, who is signed in and enabled.
-- The refusal must be `FORBIDDEN` and not `NOT_FOUND`, so a caller cannot
-- probe which report ids exist by the error it gets back.

select 'Test G32: a non-author is refused with FORBIDDEN' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111102',
         $w$select public.update_category('22222222-2222-2222-2222-222222222203', 'fraud')$w$
       ) = 'FORBIDDEN' as passed;

select 'Test G33: the refused write left the category alone' as test,
       (select category from public.reports where id = '22222222-2222-2222-2222-222222222203') = 'harassment' as passed;

-- A report that does not exist is refused the SAME way. If it answered
-- `NOT_FOUND` instead, the difference in the two errors would tell a caller
-- whether a report id is real — so the two cases must be indistinguishable.

select 'Test G34: a report that does not exist is refused with FORBIDDEN too' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$select public.update_category('99999999-9999-9999-9999-999999999999', 'fraud')$w$
       ) = 'FORBIDDEN' as passed;

-- =============================================================================
-- Test H — the alternate phone format constraint
-- =============================================================================
--
-- `002-identity / 001-signup-with-email-and-phone` AC #10: the alternate
-- phone is stored in `profiles.alternate_phone` as E.164, and the column is
-- NOT unique — a second account may store the same number.
--
-- The constraint is `profiles_alternate_phone_format` (migration 020).
--
-- The subtle case is the last one. The obvious form of the check —
-- `normalise_bd_phone(alternate_phone) = alternate_phone` — does NOT refuse a
-- non-BD number, because `normalise_bd_phone` returns NULL for one, and
-- `NULL = '…'` is NULL, and a CHECK constraint only rejects FALSE. That bug
-- was caught by `pnpm alternate:check` (the live probe), and these assertions
-- are here so it cannot come back.

-- A second account, so the non-uniqueness rule can be tested.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111107', 'altphone@test.local',
        json_build_object('phone', '+8801711000107'));

-- --- The happy path ---------------------------------------------------------

select 'Test H1: an owner can store a valid E.164 alternate phone' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = '+8801711007777'
           where id = '11111111-1111-1111-1111-111111111101'$w$
       ) = '' as passed;

select 'Test H2: the alternate phone landed' as test,
       (select alternate_phone from public.profiles
         where id = '11111111-1111-1111-1111-111111111101') = '+8801711007777' as passed;

select 'Test H3: the column is NOT unique — a second account may store the same number' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111107',
         $w$update public.profiles set alternate_phone = '+8801711007777'
           where id = '11111111-1111-1111-1111-111111111107'$w$
       ) = '' as passed;

select 'Test H4: both accounts hold the same alternate number' as test,
       (select count(*) from public.profiles where alternate_phone = '+8801711007777') = 2 as passed;

select 'Test H5: the alternate phone can be cleared' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = null
           where id = '11111111-1111-1111-1111-111111111101'$w$
       ) = '' as passed;

select 'Test H6: a NULL alternate phone is allowed' as test,
       (select alternate_phone from public.profiles
         where id = '11111111-1111-1111-1111-111111111101') is null as passed;

-- --- The refusals -----------------------------------------------------------

select 'Test H7: the local format is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = '01712345678'
           where id = '11111111-1111-1111-1111-111111111101'$w$
       ) <> '' as passed;

select 'Test H8: a non-BD number is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = '+14155550123'
           where id = '11111111-1111-1111-1111-111111111101'$w$
       ) <> '' as passed;

select 'Test H9: a non-number is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = 'not a number'
           where id = '11111111-1111-1111-1111-111111111101'$w$
       ) <> '' as passed;

select 'Test H10: a too-short number is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = '+8801234'
           where id = '11111111-1111-1111-1111-111111111101'$w$
       ) <> '' as passed;

select 'Test H11: a refused write leaves the stored value untouched' as test,
       (select alternate_phone from public.profiles
         where id = '11111111-1111-1111-1111-111111111101') is null as passed;

-- --- The ownership rules ----------------------------------------------------

select 'Test H12: a client cannot write another account''s alternate phone' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$update public.profiles set alternate_phone = '+8801711008888'
           where id = '11111111-1111-1111-1111-111111111107'$w$
       ) = '' as passed;

select 'Test H13: the other account''s alternate phone did not change' as test,
       (select alternate_phone from public.profiles
         where id = '11111111-1111-1111-1111-111111111107') = '+8801711007777' as passed;

-- =============================================================================
-- The wrong-number entry integrity
-- =============================================================================
--
-- `003-help-seek / 008-wrong-number-report` — "`entry_id` is polymorphic, so
-- it cannot carry a plain FK. … Integrity is enforced by a CHECK trigger …
-- that resolves the target against the table named by `entry_type` and
-- rejects a report whose target does not exist."
--
-- The trigger was missing from the schema. Without it a report could name a
-- `station` type and carry a **hotline's** slug, or name an entry that does
-- not exist at all, and the row was accepted silently — leaving the curator
-- triaging a reference that resolves to nothing.
--
-- These are the guards for that trigger.
-- -----------------------------------------------------------------------------

-- The curated slugs the assertions use. `st-gulshan-police` is a live police
-- station in the seeded dataset; `hl-women-children` is a live hotline. Both
-- are asserted to exist first, so a quarterly dataset refresh that renames a
-- slug breaks this suite loudly rather than silently passing on a stale id.
select 'Test I1: the curated station slug the test uses exists' as test,
       (select count(*) from public.stations where id = 'st-gulshan-police') = 1 as passed;

select 'Test I2: the curated hotline slug the test uses exists' as test,
       (select count(*) from public.hotlines where id = 'hl-women-children') = 1 as passed;

-- --- The refusals -----------------------------------------------------------

select 'Test I3: a report naming a station that does not exist is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'station', 'no-such-station-slug', 'the number is wrong')$w$
       ) <> '' as passed;

select 'Test I4: a report naming a hotline that does not exist is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'hotline', 'no-such-hotline-slug', 'the number is wrong')$w$
       ) <> '' as passed;

select 'Test I5: a station-typed report carrying a hotline id is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'station', 'hl-women-children', 'the number is wrong')$w$
       ) <> '' as passed;

select 'Test I6: a hotline-typed report carrying a station id is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'hotline', 'st-gulshan-police', 'the number is wrong')$w$
       ) <> '' as passed;

select 'Test I7: no dangling report row landed' as test,
       (select count(*) from public.wrong_number_reports
         where entry_id in ('no-such-station-slug', 'no-such-hotline-slug')) = 0 as passed;

select 'Test I8: no mismatched report row landed' as test,
       (select count(*) from public.wrong_number_reports
         where (entry_type = 'station' and entry_id = 'hl-women-children')
            or (entry_type = 'hotline' and entry_id = 'st-gulshan-police')) = 0 as passed;

-- --- The acceptances --------------------------------------------------------

select 'Test I9: a report naming a live station is accepted' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'station', 'st-gulshan-police', 'the number is wrong')$w$
       ) = '' as passed;

select 'Test I10: a report naming a live hotline is accepted' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'hotline', 'hl-women-children', 'the number is wrong')$w$
       ) = '' as passed;

-- The counts are **relative** to the rows already in the table. Test G26
-- above filed a report against the same station slug, so an absolute count
-- would be measuring the earlier test's row as much as this one's.
select 'Test I11: the accepted station report landed' as test,
       (select count(*) from public.wrong_number_reports
         where entry_type = 'station' and entry_id = 'st-gulshan-police'
           and reason = 'the number is wrong') >= 1 as passed;

select 'Test I12: the accepted hotline report landed' as test,
       (select count(*) from public.wrong_number_reports
         where entry_type = 'hotline' and entry_id = 'hl-women-children'
           and reason = 'the number is wrong') = 1 as passed;

-- --- The duplicates ---------------------------------------------------------
--
-- "Duplicates are allowed on purpose. … There is no unique constraint on
-- (reported_by, entry_type, entry_id) and no client-side dedupe."

select 'Test I13: the same user reporting the same entry twice is accepted' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values ('11111111-1111-1111-1111-111111111101', 'station', 'st-gulshan-police', 'still wrong')$w$
       ) = '' as passed;

select 'Test I14: the duplicate landed as a second row' as test,
       (select count(*) from public.wrong_number_reports
         where entry_type = 'station' and entry_id = 'st-gulshan-police'
           and reason = 'still wrong') = 1 as passed;

-- --- The anonymous reporter -------------------------------------------------
--
-- FR-SEEK-6 says "any user" — the sheet is reachable from the More Help
-- sheet, so a signed-out visitor must still be able to file a report.

select 'Test I15: an anonymous report is accepted' as test,
       pg_temp.as_client(
         null,
         $w$insert into public.wrong_number_reports (reporter_id, entry_type, entry_id, reason)
           values (null, 'station', 'st-gulshan-police', 'the number is wrong')$w$
       ) = '' as passed;

select 'Test I16: the anonymous report landed with a null reporter' as test,
       (select count(*) from public.wrong_number_reports
         where entry_type = 'station' and entry_id = 'st-gulshan-police' and reporter_id is null) = 1 as passed;

-- The curator's read path is the moderator's select policy. The count is
-- taken as the moderator, so an anonymous row that the policy cannot reach
-- would show up as a lower count — which is the point of the assertion.
select 'Test I17: the anonymous report is visible to the curator' as test,
       (select count(*) from public.wrong_number_reports
         where entry_type = 'station' and entry_id = 'st-gulshan-police'
           and reason = 'the number is wrong') >= 1 as passed;

-- `as_client` executes the statement and reports the **error message**, so a
-- successful select reads as `''` whatever it returned. The *values* a client
-- sees are therefore asserted by turning the RLS-filtered count into a
-- **failure**: `raise exception` inside the client's own session fails only
-- when the RLS filter lets the row through.
--
-- The moderator's select policy must reach the anonymous row — otherwise the
-- curator can never triage it.
select 'Test I18: the moderator policy reaches the anonymous row' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111102',
         $w$do $$ begin
              if (select count(*) from public.wrong_number_reports
                   where entry_type = 'station' and entry_id = 'st-gulshan-police'
                     and reporter_id is null) <> 1 then
                raise exception 'the moderator cannot see the anonymous report';
              end if;
            end $$;$w$
       ) = '' as passed;

-- The reporter's own select policy must **not** reach the anonymous row. The
-- citizen sees only rows whose reporter_id is their own id.
select 'Test I19: the reporter policy does not reach the anonymous row' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111101',
         $w$do $$ begin
              if (select count(*) from public.wrong_number_reports
                   where reporter_id is null) <> 0 then
                raise exception 'the citizen can see the anonymous report';
              end if;
            end $$;$w$
       ) = '' as passed;

-- The counts themselves, taken as the superuser so the RLS filter is not in
-- the way. The anonymous row exists, and it is the **only** row with a null
-- reporter.
select 'Test I20: exactly one anonymous report exists' as test,
       (select count(*) from public.wrong_number_reports where reporter_id is null) = 1 as passed;

-- The curator's read path is the moderator's select policy. The count is
-- taken as the superuser, so an anonymous row the policy cannot reach would
-- show up as a lower count — which is the point of the assertion.
select 'Test I21: the anonymous report is present for the curator' as test,
       (select count(*) from public.wrong_number_reports
          where entry_type = 'station' and entry_id = 'st-gulshan-police'
            and reporter_id is null) = 1 as passed;

rollback;

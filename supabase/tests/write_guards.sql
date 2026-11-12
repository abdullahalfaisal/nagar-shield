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

rollback;

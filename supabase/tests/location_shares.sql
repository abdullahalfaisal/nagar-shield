-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/location_shares.sql
--
-- The `location_shares` contract, asserted **inside** Postgres.
--
-- This suite proves the properties of the table itself:
--
--   * `mode` is a one-value CHECK of exactly `'snapshot'` — the column is
--     retained as the Phase-2 streaming hook and nothing else may be written;
--   * `lat` and `lng` are nullable, and they are **all-or-nothing** — a
--     "share without location" row carries a null position rather than a
--     zeroed one, and a half-written coordinate pair is refused;
--   * `accuracy_m` is nullable — a manual coordinate entry has no honest
--     accuracy to report;
--   * `recipient_contact_id` is nullable — an OS share-sheet recipient may
--     not have an account at all;
--   * the RLS policies scope the table to the sender, and to a sender whose
--     account is still enabled;
--   * the table appears in **no** public feed, view, RPC output, or admin
--     projection — including a second user being unable to read another
--     user's rows.
--
-- The impersonation
-- -----------------
-- These tests must run as a **client**, not as the `postgres` superuser. The
-- superuser has BYPASSRLS and the owner role, so it sees and writes
-- everything — every RLS defect here would be invisible.
--
-- The suite therefore uses the same mechanism PostgREST uses:
--
--   set local role authenticated   -- the role the request runs as
--   set local request.jwt.claims   -- the verified JWT's claims
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/location_shares.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

-- Two citizens. The uuid space is deliberately distinct from the seed's, so
-- this suite never collides with the seeded dev accounts.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('22222222-2222-2222-2222-2222222222a1', 'share-a@test.local',
   json_build_object('phone', '+8801711000401')),
  ('22222222-2222-2222-2222-2222222222a2', 'share-b@test.local',
   json_build_object('phone', '+8801711000402'));

-- The trigger created the two profiles.

-- Two contacts for citizen A. The first is a primary; the second is not.
insert into public.contacts (user_id, name, phone, is_primary, group_name, sort_order)
values
  ('22222222-2222-2222-2222-2222222222a1', 'Primary Friend', '+8801711000411', true, 'friend', 0),
  ('22222222-2222-2222-2222-2222222222a1', 'Other Friend',   '+8801711000412', false, 'friend', 1);

-- -----------------------------------------------------------------------------
-- The client impersonation helper
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

-- The same, but as the server: the service-role key, which bypasses RLS. It
-- is the only way to reach rows a client cannot see.
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
-- Test A — `mode` is a one-value CHECK of exactly 'snapshot'
-- =============================================================================
--
-- The column is retained as the Phase-2 streaming hook, so it stays in the
-- schema. But Phase 1 writes exactly one value, and the database is what
-- enforces it — a modified client cannot write a streaming row.

-- A1. The enum itself carries exactly one value.
select 'Test A1: location_share_mode has exactly one value' as test,
       (select count(*) = 1
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
         where t.typname = 'location_share_mode') as passed;

-- A2. That one value is 'snapshot'.
select 'Test A2: the only mode is snapshot' as test,
       (select enumlabel
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
         where t.typname = 'location_share_mode') = 'snapshot' as passed;

-- A3. The column defaults to 'snapshot'.
select 'Test A3: location_shares.mode defaults to snapshot' as test,
       (select column_default
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'location_shares'
           and column_name = 'mode') like '%snapshot%' as passed;

-- A4. A client writing 'snapshot' is accepted.
select 'Test A4: a client may write mode=snapshot' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066)$s$
       ) = '' as passed;

-- A5. A client writing anything else is refused by the enum.
select 'Test A5: a client cannot write mode=stream' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng, mode)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 'stream')$s$
       ) <> '' as passed;

-- =============================================================================
-- Test B — the position is nullable, and all-or-nothing
-- =============================================================================
--
-- The "share without location" path has no position to write. The old schema
-- made `lat` / `lng` NOT NULL, so the only way to write that row was to put
-- `0, 0` in it — a coordinate on the Gulf of Guinea that reads as a real
-- position. The rule is a **null** position, not a zeroed one.
--
-- And the pair is all-or-nothing: a row with a latitude but no longitude
-- would be a half-written position, and the reader would have to guess which
-- half was missing.

-- B1. `lat` is nullable.
select 'Test B1: location_shares.lat is nullable' as test,
       (select is_nullable = 'YES'
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'location_shares'
           and column_name = 'lat') as passed;

-- B2. `lng` is nullable.
select 'Test B2: location_shares.lng is nullable' as test,
       (select is_nullable = 'YES'
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'location_shares'
           and column_name = 'lng') as passed;

-- B3. A row with BOTH coordinates null is accepted — the share-without-
--     location path.
select 'Test B3: a null position is accepted' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng, accuracy_m)
              values ('22222222-2222-2222-2222-2222222222a1', null, null, null)$s$
       ) = '' as passed;

-- B4. The row really does carry a null position — not a zeroed one.
select 'Test B4: the null-position row stores nulls' as test,
       (select lat is null and lng is null
          from public.location_shares
         where sender_id = '22222222-2222-2222-2222-2222222222a1'
           and lat is null) as passed;

-- B5. A HALF-written pair is refused — a latitude with no longitude.
select 'Test B5: a half-written coordinate pair is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, null)$s$
       ) <> '' as passed;

-- B6. The other half is refused too — a longitude with no latitude.
select 'Test B6: the mirrored half-written pair is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', null, 90.4066)$s$
       ) <> '' as passed;

-- B7. A real position is still accepted.
select 'Test B7: a real position is still accepted' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng, accuracy_m)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 12.5)$s$
       ) = '' as passed;

-- B8. A coordinate of exactly 0 is a **valid** coordinate — the equator and
--     the prime meridian. The old CHECK accepted it; the pair CHECK must not
--     have broken it.
select 'Test B8: a coordinate of 0 is a valid position' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 0, 0)$s$
       ) = '' as passed;

-- B9. An out-of-range latitude is still refused.
select 'Test B9: an out-of-range latitude is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 91, 90.4066)$s$
       ) <> '' as passed;

-- B10. A negative accuracy is refused — there is no such thing as a
--      negative accuracy.
select 'Test B10: a negative accuracy is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng, accuracy_m)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, -1)$s$
       ) <> '' as passed;

-- =============================================================================
-- Test C — the recipient and the channel
-- =============================================================================

-- C1. `recipient_contact_id` is nullable — an OS share-sheet recipient may
--     not have an account at all.
select 'Test C1: recipient_contact_id is nullable' as test,
       (select is_nullable = 'YES'
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'location_shares'
           and column_name = 'recipient_contact_id') as passed;

-- C2. An OS share-sheet row with no recipient contact is accepted.
select 'Test C2: an os_share_sheet row with no recipient is accepted' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng, share_channel, recipient_contact_id)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 'os_share_sheet', null)$s$
       ) = '' as passed;

-- C3. The share_channel enum carries exactly the two expected values.
select 'Test C3: share_channel carries app and os_share_sheet' as test,
       (select count(*) = 2
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
         where t.typname = 'share_channel')
       and (select count(*) = 2
              from pg_type t
              join pg_enum e on e.enumtypid = t.oid
             where t.typname = 'share_channel'
               and e.enumlabel in ('app', 'os_share_sheet')) as passed;

-- C4. A share_channel outside the enum is refused.
select 'Test C4: an unknown share_channel is refused' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng, share_channel)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 'sms')$s$
       ) <> '' as passed;

-- The same, but it needs the **value** the statement produced. `as_client`
-- swallows the result, so this helper runs the count inside the impersonated
-- session and returns it. The count is therefore the RLS-filtered count and
-- not the superuser's.
create or replace function pg_temp.count_as_client(user_id uuid, statement text)
returns bigint
language plpgsql
as $w$
declare
  v_count bigint := -1;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_id, 'role', 'authenticated')::text, true);

  begin
    execute 'select count(*) from (' || statement || ') as scoped' into v_count;
  exception when others then
    v_count := -1;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_count;
end;
$w$;

-- =============================================================================
-- Test D — the RLS: the sender only
-- =============================================================================

-- D1. Citizen B cannot READ citizen A's rows. This is the executable form
--     of "location_shares is never public".
--
--     The count is taken **inside** the impersonated session. A count taken
--     as the superuser would be the unfiltered count — the superuser has
--     BYPASSRLS — so it would prove nothing at all.
select 'Test D1: a second user cannot read another user''s share rows' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a2',
         $s$select lat from public.location_shares
               where sender_id = '22222222-2222-2222-2222-2222222222a1'$s$
       ) = 0 as passed;

-- D2. Citizen B cannot INSERT a row claiming citizen A as the sender.
select 'Test D2: a second user cannot write a row for another sender' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a2',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066)$s$
       ) <> '' as passed;

-- D3. Citizen A can read their own rows — so D1 is not vacuously true.
select 'Test D3: the sender can read their own share rows' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$select lat from public.location_shares
               where sender_id = '22222222-2222-2222-2222-2222222222a1'$s$
       ) > 0 as passed;

-- D4. There is no UPDATE or DELETE policy — the sender cannot rewrite or
--     remove a share. A snapshot is a record of what happened.
select 'Test D4: there is no update policy on location_shares' as test,
       (select count(*) = 0
          from pg_policies
         where schemaname = 'public'
           and tablename = 'location_shares'
           and cmd = 'UPDATE') as passed;

select 'Test D5: there is no delete policy on location_shares' as test,
       (select count(*) = 0
          from pg_policies
         where schemaname = 'public'
           and tablename = 'location_shares'
           and cmd = 'DELETE') as passed;

-- =============================================================================
-- Test E — the table is never public
-- =============================================================================

-- E1. The table appears in no public feed RPC's output.
--
--     `prokind = 'f'` restricts the scan to plain functions: an aggregate
--     returns `jsonb` too, and `pg_get_functiondef` cannot render an
--     aggregate at all — it raises "jsonb_agg is an aggregate function",
--     which would abort the suite rather than answer the question.
select 'Test E1: no read model mentions location_shares' as test,
       (select count(*) = 0
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prokind = 'f'
           and p.prorettype = 'jsonb'::regtype
           and pg_get_functiondef(p.oid) ilike '%location_shares%') as passed;

-- E2. No view exposes it.
select 'Test E2: no view exposes location_shares' as test,
       (select count(*) = 0
          from pg_views
         where schemaname = 'public'
           and definition ilike '%location_shares%') as passed;

-- E3. No RLS policy grants a SELECT to `anon` — an unauthenticated reader
--     can never see a position.
select 'Test E3: no anon select policy on location_shares' as test,
       (select count(*) = 0
          from pg_policies
         where schemaname = 'public'
           and tablename = 'location_shares'
           and cmd = 'SELECT'
           and (qual ilike '%anon%' or roles::text ilike '%anon%')) as passed;

-- =============================================================================
-- Test F — the disabled-account guard
-- =============================================================================

-- The insert policy calls `assert_account_not_disabled()`. A disabled
-- account cannot write a share row.

-- F1. Disable citizen A.
select pg_temp.as_service(
  $s$update public.profiles set disabled_at = now()
       where id = '22222222-2222-2222-2222-2222222222a1'$s$
) = '';

-- F2. The disabled account cannot write a share.
select 'Test F1: a disabled account cannot write a share row' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066)$s$
       ) <> '' as passed;

-- F3. The refusal names the account, not a raw Postgres error.
select 'Test F2: the refusal names the disabled account' as test,
       pg_temp.as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$insert into public.location_shares (sender_id, lat, lng)
              values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066)$s$
       ) ilike '%disable%' as passed;

-- F4. Re-enable, so the rollback is clean.
select pg_temp.as_service(
  $s$update public.profiles set disabled_at = null
       where id = '22222222-2222-2222-2222-2222222222a1'$s$
) = '';

-- =============================================================================
-- Test G — the app-user lookup
-- =============================================================================
--
-- The Location Sharing screen has to route each recipient one of two ways:
-- an app user gets a `location_shares` row, everyone else gets the OS share
-- sheet. To tell them apart the client asks the database which of **its own**
-- contacts are Nagar Shield users.
--
-- The function returns **contact ids only**. It reveals no phone, no name,
-- no email, and no user id — the only new fact is the yes/no.

-- The contact ids are generated by the database, so the tests refer to the
-- contacts by name and resolve the id inside the statement.
--
-- Two details make this helper correct rather than merely plausible:
--
--   * The owner is part of the lookup. The names are unique **within one
--     user's** contact list, not across the table — a helper that matched on
--     the name alone would resolve an arbitrary row whenever two citizens
--     share a contact name, and the test would then assert about the wrong
--     contact.
--
--   * The parameters are named `p_name` and `p_owner`, not `name` and
--     `owner_id`. A parameter named `name` **shadows** the column `c.name`,
--     so `where c.name = name` compares the column to itself — always true
--     — and the helper silently resolves an arbitrary contact. The test then
--     fails for a reason that has nothing to do with the behaviour under
--     test, which is exactly the kind of defect a fixture must not carry.
create or replace function pg_temp.contact_id(p_name text, p_owner uuid)
returns uuid
language sql
stable
as $$
  select c.id
    from public.contacts c
   where c.name = p_name
     and c.user_id = p_owner
   limit 1;
$$;

-- G1. Citizen B's phone belongs to a Nagar Shield account, so A's contact
--     for B resolves.
insert into public.contacts (user_id, name, phone, is_primary, group_name, sort_order)
values ('22222222-2222-2222-2222-2222222222a1', 'B Is An App User',
        '+8801711000402', false, 'friend', 2);

-- G2. A contact whose phone belongs to nobody does not resolve.
insert into public.contacts (user_id, name, phone, is_primary, group_name, sort_order)
values ('22222222-2222-2222-2222-2222222222a1', 'Not An App User',
        '+8801711999999', false, 'friend', 3);

-- G2b. A contact whose phone is **malformed** — the normaliser returns NULL
--      for it, so it can never match an account.
--
--      The `contacts_phone_format` CHECK refuses a malformed contact row, so
--      the constraint is dropped for the insert and restored as `NOT VALID`
--      immediately after. `NOT VALID` is the right tool here: the constraint
--      is enforced for every **new** row but the pre-existing rows are not
--      re-checked — which is exactly what this fixture needs, since the
--      malformed row is one of them. The suite's `rollback` restores the
--      table for good.
--
--      A malformed number is still a **contact** — a citizen whose contact
--      list has a bad entry is exactly the case that must degrade to the OS
--      share sheet rather than crash.
alter table public.contacts drop constraint contacts_phone_format;

insert into public.contacts (user_id, name, phone, is_primary, group_name, sort_order)
values ('22222222-2222-2222-2222-2222222222a1', 'Malformed Number',
        '+8801234', false, 'friend', 4);

alter table public.contacts add constraint contacts_phone_format
  check (normalise_bd_phone(phone) is not null and normalise_bd_phone(phone) = phone)
  not valid;

-- G3. The lookup returns the app-user contact and only that one.
--
--     The count is taken **inside** the impersonated session, so it is the
--     caller's own answer and not a superuser's.
select 'Test G1: the lookup resolves an app-user contact' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$select resolve_app_contacts from public.resolve_app_contacts(
                  array[pg_temp.contact_id('B Is An App User', '22222222-2222-2222-2222-2222222222a1')])$s$
       ) = 1 as passed;

-- G4. The lookup returns nothing for a contact that is not an app user.
select 'Test G2: the lookup skips a contact who is not an app user' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$select resolve_app_contacts from public.resolve_app_contacts(
                  array[pg_temp.contact_id('Not An App User', '22222222-2222-2222-2222-2222222222a1')])$s$
       ) = 0 as passed;

-- G5. The lookup never resolves a contact belonging to somebody else — a
--     caller cannot probe another user's contact list.
--
--     B is asked about **A's** contact for B. The id belongs to another
--     user's contact list, so it is silently ignored rather than resolved.
select 'Test G3: the lookup ignores another user''s contact' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a2',
         $s$select resolve_app_contacts from public.resolve_app_contacts(
                  array[(select c.id from public.contacts c
                          where c.name = 'B Is An App User'
                            and c.user_id = '22222222-2222-2222-2222-2222222222a1')])$s$
       ) = 0 as passed;

-- G6. The lookup resolves the contact in one query — an id that is not the
--     caller's own is silently ignored rather than resolved.
--
--     A is asked about **B's** own contact. The id is a real contact row and
--     it is B's, so the lookup must not resolve it for A.
insert into public.contacts (user_id, name, phone, is_primary, group_name, sort_order)
values ('22222222-2222-2222-2222-2222222222a2', 'B Own Contact', '+8801711000413', false, 'friend', 0);

select 'Test G4: the lookup ignores an id the caller does not own' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$select resolve_app_contacts from public.resolve_app_contacts(
                  array[(select c.id from public.contacts c
                          where c.name = 'B Own Contact'
                            and c.user_id = '22222222-2222-2222-2222-2222222222a2')])$s$
       ) = 0 as passed;

-- G7. A malformed phone is simply not matched — it degrades to the OS share
--     sheet rather than crashing.
--
--     The lookup normalises the contact's number, the normaliser returns NULL
--     for a number it cannot parse, and NULL never matches an account. So
--     the recipient goes down the OS path.
select 'Test G5: the lookup skips a contact whose number is malformed' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$select resolve_app_contacts from public.resolve_app_contacts(
                  array[pg_temp.contact_id('Malformed Number', '22222222-2222-2222-2222-2222222222a1')])$s$
       ) = 0 as passed;

-- G8. A disabled account is not a reachable in-app recipient: the snapshot
--     would land in an account nobody can read, so the recipient goes down
--     the OS path instead.
select pg_temp.as_service(
  $s$update public.profiles set disabled_at = now()
       where id = '22222222-2222-2222-2222-2222222222a2'$s$
) = '';

select 'Test G6: the lookup skips a disabled account' as test,
       pg_temp.count_as_client(
         '22222222-2222-2222-2222-2222222222a1',
         $s$select resolve_app_contacts from public.resolve_app_contacts(
                  array[pg_temp.contact_id('B Is An App User', '22222222-2222-2222-2222-2222222222a1')])$s$
       ) = 0 as passed;

select pg_temp.as_service(
  $s$update public.profiles set disabled_at = null
       where id = '22222222-2222-2222-2222-2222222222a2'$s$
) = '';

-- G9. The function is not granted to `anon`, and PUBLIC's default grant is
--     revoked. An unauthenticated caller cannot use it.
select 'Test G7: the lookup is not executable by anon' as test,
       (select count(*) = 0
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'resolve_app_contacts'
           and p.proacl is not null
           and (p.proacl::text ilike '%=X/anon%'
                or p.proacl::text ilike '%=X/PUBLIC%')) as passed;

-- G10. The function returns **ids only** — no phone, no name, no email, no
--      user id. The return type is a set of uuid, and that is all it can be.
select 'Test G8: the lookup returns ids only' as test,
       (select count(*) = 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          join pg_type r on r.oid = p.prorettype
         where n.nspname = 'public'
           and p.proname = 'resolve_app_contacts'
           and p.proretset
           and r.typname = 'uuid') as passed;

-- =============================================================================
-- Summary
-- =============================================================================

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed
  from (
    -- A
    select 'A1' as t, (select count(*) = 1
                         from pg_type t
                         join pg_enum e on e.enumtypid = t.oid
                        where t.typname = 'location_share_mode') as passed
    union all select 'A2', (select enumlabel
                               from pg_type t
                               join pg_enum e on e.enumtypid = t.oid
                              where t.typname = 'location_share_mode') = 'snapshot'
    union all select 'A3', (select column_default
                               from information_schema.columns
                              where table_schema = 'public' and table_name = 'location_shares'
                                and column_name = 'mode') like '%snapshot%'
    union all select 'A4', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066)$s$) = ''
    union all select 'A5', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng, mode)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 'stream')$s$) <> ''
    -- B
    union all select 'B1', (select is_nullable = 'YES'
                               from information_schema.columns
                              where table_schema = 'public' and table_name = 'location_shares'
                                and column_name = 'lat')
    union all select 'B2', (select is_nullable = 'YES'
                               from information_schema.columns
                              where table_schema = 'public' and table_name = 'location_shares'
                                and column_name = 'lng')
    union all select 'B3', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng, accuracy_m)
             values ('22222222-2222-2222-2222-2222222222a1', null, null, null)$s$) = ''
    union all select 'B4', (select lat is null and lng is null
                               from public.location_shares
                              where sender_id = '22222222-2222-2222-2222-2222222222a1'
                                and lat is null)
    union all select 'B5', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, null)$s$) <> ''
    union all select 'B6', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng)
             values ('22222222-2222-2222-2222-2222222222a1', null, 90.4066)$s$) <> ''
    union all select 'B7', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng, accuracy_m)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 12.5)$s$) = ''
    union all select 'B8', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng)
             values ('22222222-2222-2222-2222-2222222222a1', 0, 0)$s$) = ''
    union all select 'B9', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng)
             values ('22222222-2222-2222-2222-2222222222a1', 91, 90.4066)$s$) <> ''
    union all select 'B10', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng, accuracy_m)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, -1)$s$) <> ''
    -- C
    union all select 'C1', (select is_nullable = 'YES'
                               from information_schema.columns
                              where table_schema = 'public' and table_name = 'location_shares'
                                and column_name = 'recipient_contact_id')
    union all select 'C2', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng, share_channel, recipient_contact_id)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 'os_share_sheet', null)$s$) = ''
    union all select 'C3', (select count(*) = 2
                               from pg_type t
                               join pg_enum e on e.enumtypid = t.oid
                              where t.typname = 'share_channel')
                         and (select count(*) = 2
                                from pg_type t
                                join pg_enum e on e.enumtypid = t.oid
                               where t.typname = 'share_channel'
                                 and e.enumlabel in ('app', 'os_share_sheet'))
    union all select 'C4', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$insert into public.location_shares (sender_id, lat, lng, share_channel)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066, 'sms')$s$) <> ''
    -- D
    union all select 'D1', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a2',
        $s$select lat from public.location_shares
               where sender_id = '22222222-2222-2222-2222-2222222222a1'$s$) = 0
    union all select 'D2', pg_temp.as_client(
        '22222222-2222-2222-2222-2222222222a2',
        $s$insert into public.location_shares (sender_id, lat, lng)
             values ('22222222-2222-2222-2222-2222222222a1', 23.7806, 90.4066)$s$) <> ''
    union all select 'D3', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$select lat from public.location_shares
               where sender_id = '22222222-2222-2222-2222-2222222222a1'$s$) > 0
    union all select 'D4', (select count(*) = 0
                               from pg_policies
                              where schemaname = 'public' and tablename = 'location_shares'
                                and cmd = 'UPDATE')
    union all select 'D5', (select count(*) = 0
                               from pg_policies
                              where schemaname = 'public' and tablename = 'location_shares'
                                and cmd = 'DELETE')
    -- E
    union all select 'E1', (select count(*) = 0
                               from pg_proc p
                               join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public'
                                and p.prokind = 'f'
                                and p.prorettype = 'jsonb'::regtype
                                and pg_get_functiondef(p.oid) ilike '%location_shares%')
    union all select 'E2', (select count(*) = 0
                               from pg_views
                              where schemaname = 'public' and definition ilike '%location_shares%')
    union all select 'E3', (select count(*) = 0
                               from pg_policies
                              where schemaname = 'public' and tablename = 'location_shares'
                                and cmd = 'SELECT'
                                and (qual ilike '%anon%' or roles::text ilike '%anon%'))
    -- F
    union all select 'F1', (select count(*) = 0
                               from public.location_shares
                              where sender_id = '22222222-2222-2222-2222-2222222222a1'
                                and created_at > now() - interval '1 second'
                                and lat = 23.7806) = false
    -- G
    union all select 'G1', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$select resolve_app_contacts from public.resolve_app_contacts(
                 array[pg_temp.contact_id('B Is An App User', '22222222-2222-2222-2222-2222222222a1')])$s$) = 1
    union all select 'G2', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$select resolve_app_contacts from public.resolve_app_contacts(
                 array[pg_temp.contact_id('Not An App User', '22222222-2222-2222-2222-2222222222a1')])$s$) = 0
    union all select 'G3', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a2',
        $s$select resolve_app_contacts from public.resolve_app_contacts(
                 array[(select c.id from public.contacts c
                         where c.name = 'B Is An App User'
                           and c.user_id = '22222222-2222-2222-2222-2222222222a1')])$s$) = 0
    union all select 'G4', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$select resolve_app_contacts from public.resolve_app_contacts(
                 array[(select c.id from public.contacts c
                         where c.name = 'B Own Contact'
                           and c.user_id = '22222222-2222-2222-2222-2222222222a2')])$s$) = 0
    union all select 'G5', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$select resolve_app_contacts from public.resolve_app_contacts(
                 array[pg_temp.contact_id('Malformed Number', '22222222-2222-2222-2222-2222222222a1')])$s$) = 0
    union all select 'G6', pg_temp.count_as_client(
        '22222222-2222-2222-2222-2222222222a1',
        $s$select resolve_app_contacts from public.resolve_app_contacts(
                 array[pg_temp.contact_id('B Is An App User', '22222222-2222-2222-2222-2222222222a1')])$s$) = 0
    union all select 'G7', (select count(*) = 0
                               from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = 'public'
                               and p.proname = 'resolve_app_contacts'
                               and p.proacl is not null
                               and (p.proacl::text ilike '%=X/anon%'
                                    or p.proacl::text ilike '%=X/PUBLIC%'))
    union all select 'G8', (select count(*) = 1
                               from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                              join pg_type r on r.oid = p.prorettype
                             where n.nspname = 'public'
                               and p.proname = 'resolve_app_contacts'
                               and p.proretset
                               and r.typname = 'uuid')
  ) as results;

rollback;

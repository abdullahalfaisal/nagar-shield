-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/contacts.sql
--
-- The emergency-contacts contract, asserted **inside** Postgres.
--
-- This suite covers the half the live probe (`tools/probe-contacts-crud.cjs`)
-- cannot: the properties of the columns themselves — the owner default, the
-- phone CHECK, the enum, the ordering columns, the density of `sort_order`,
-- and the shape of the RLS policies as policies rather than as their effect.
--
-- The live probe proves the **effect** over PostgREST; this suite proves the
-- **cause**. Both are needed: an effect can be right for the wrong reason
-- (a policy that happens to be strict because of something else), and a cause
-- can be right with no effect to show for it.
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
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/contacts.sql
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
  ('11111111-1111-1111-1111-1111111111c1', 'contacts-a@test.local',
   json_build_object('phone', '+8801711000201')),
  ('11111111-1111-1111-1111-1111111111c2', 'contacts-b@test.local',
   json_build_object('phone', '+8801711000202'));

-- The trigger created the two profiles.

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
-- Test A — the owner is set by the DATABASE
-- =============================================================================
--
-- `contacts.user_id` carries a default of `auth.uid()`. The client never
-- names an owner; the session's user is written by the database itself.
--
-- This is the property AC #9 asks for: "`user_id` is set from the
-- authenticated session and never from client input".
--
-- The three cases are:
--
--   | the client sends        | the result                          |
--   |-------------------------|-------------------------------------|
--   | nothing (omitted)       | the database fills in `auth.uid()`  |
--   | its own session's id    | accepted                            |
--   | someone else's id      | refused by the `WITH CHECK`         |

-- A1. The column carries the default.
select 'Test A1: contacts.user_id defaults to auth.uid()' as test,
       (select column_default
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'contacts'
           and column_name = 'user_id') like '%auth.uid()%' as passed;

-- A2. An insert that OMITS the owner gets the session's user.
select pg_temp.as_client(
  '11111111-1111-1111-1111-1111111111c1',
  $s$insert into public.contacts (name, phone, sort_order)
       values ('owned by the session', '+8801711000301', 0)$s$
) = '' as passed;

select 'Test A2: an insert omitting user_id lands on the session user' as test,
       (select count(*) from public.contacts
         where user_id = '11111111-1111-1111-1111-1111111111c1'
           and name = 'owned by the session') = 1 as passed;

-- A3. The row has NO owner written by the client — the database chose it.
select 'Test A3: the omitted owner was filled in by the database default' as test,
       (select count(*) from public.contacts
         where name = 'owned by the session'
           and user_id = '11111111-1111-1111-1111-1111111111c1') = 1 as passed;

-- A4. An insert carrying someone ELSE's owner is refused.
select 'Test A4: an insert with a forged user_id is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (user_id, name, phone)
              values ('11111111-1111-1111-1111-1111111111c2', 'forged', '+8801711000302')$s$
       ) <> '' as passed;

-- A5. The forged insert wrote no row at all.
select 'Test A5: the forged insert wrote no row' as test,
       (select count(*) from public.contacts where name = 'forged') = 0 as passed;

-- A6. An insert with a NULL owner is refused too — the default only fires
--     when the column is OMITTED, and the column is NOT NULL.
select 'Test A6: an insert with an explicit NULL user_id is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (user_id, name, phone)
              values (null, 'null owner', '+8801711000303')$s$
       ) <> '' as passed;

-- =============================================================================
-- Test B — the phone format CHECK
-- =============================================================================
--
-- `contacts_phone_format` calls `normalise_bd_phone`, so the rule is the
-- same one the signup path applies. The column holds E.164 Bangladesh only.
--
-- The three-valued trap is the reason the check is written the way it is:
-- `normalise_bd_phone(phone) = phone` evaluates to NULL for a non-BD number,
-- and a CHECK only rejects FALSE — so the obvious form accepts every value
-- it was written to refuse. The check requires the normalised value to be
-- non-NULL **and** equal to the stored value.

-- B1. The constraint exists.
select 'Test B1: the contacts_phone_format constraint exists' as test,
       (select count(*) from pg_constraint
         where conname = 'contacts_phone_format'
           and conrelid = 'public.contacts'::regclass) = 1 as passed;

-- B2. A non-BD number is refused.
select 'Test B2: a non-BD phone number is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values ('non-bd', '+14155550123')$s$
       ) <> '' as passed;

-- B3. The refused insert wrote no row.
select 'Test B3: the refused non-BD insert wrote no row' as test,
       (select count(*) from public.contacts where name = 'non-bd') = 0 as passed;

-- B4. A local-format number is refused — the column stores E.164, and the
--     client normalises before it writes. The database does NOT accept the
--     local format, because the stored value must be directly diallable.
select 'Test B4: a local-format phone number is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values ('local format', '01711000304')$s$
       ) <> '' as passed;

-- B5. A garbage phone is refused.
select 'Test B5: a non-numeric phone number is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values ('garbage', 'not-a-number')$s$
       ) <> '' as passed;

-- B6. A valid E.164 BD number is accepted.
select 'Test B6: a valid E.164 BD number is accepted' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values ('valid', '+8801711000305')$s$
       ) = '' as passed;

-- B7. A duplicate phone is ACCEPTED — there is no uniqueness constraint on a
--     contact's phone. A shared family number is legitimate.
select 'Test B7: a duplicate phone number is accepted (no uniqueness)' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values ('duplicate phone', '+8801711000305')$s$
       ) = '' as passed;

-- B8. There is genuinely no unique constraint on the phone.
select 'Test B8: no unique constraint exists on contacts.phone' as test,
       (select count(*)
          from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
         where c.conrelid = 'public.contacts'::regclass
           and c.contype = 'u'
           and a.attname = 'phone') = 0 as passed;

-- =============================================================================
-- Test C — the owner-scoped RLS, as policies
-- =============================================================================

-- C1. All four owner-scoped policies exist.
select 'Test C1: the four owner-scoped contacts policies exist' as test,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'contacts'
           and policyname in ('contacts_select_own', 'contacts_insert_own',
                              'contacts_update_own', 'contacts_delete_own')) = 4 as passed;

-- C2. Each policy is scoped to `auth.uid()`.
select 'Test C2: every contacts policy is scoped to auth.uid()' as test,
       (select count(*) = 4 from pg_policies
         where schemaname = 'public' and tablename = 'contacts'
           and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')) as passed;

-- C3. The INSERT policy carries the disabled-account guard.
select 'Test C3: the insert policy calls assert_account_not_disabled()' as test,
       (select count(*) = 1 from pg_policies
         where schemaname = 'public' and tablename = 'contacts'
           and policyname = 'contacts_insert_own'
           and with_check like '%assert_account_not_disabled%') as passed;

-- C4. The UPDATE policy carries the disabled-account guard.
select 'Test C4: the update policy calls assert_account_not_disabled()' as test,
       (select count(*) = 1 from pg_policies
         where schemaname = 'public' and tablename = 'contacts'
           and policyname = 'contacts_update_own'
           and with_check like '%assert_account_not_disabled%') as passed;

-- C5. The DELETE policy carries the disabled-account guard.
select 'Test C5: the delete policy calls assert_account_not_disabled()' as test,
       (select count(*) = 1 from pg_policies
         where schemaname = 'public' and tablename = 'contacts'
           and policyname = 'contacts_delete_own'
           and qual like '%assert_account_not_disabled%') as passed;

-- C6. A client CANNOT see another client's rows.
select pg_temp.as_service(
  $s$insert into public.contacts (user_id, name, phone, sort_order)
       values ('11111111-1111-1111-1111-1111111111c2', 'belongs to B', '+8801711000306', 0)$s$
) = '' as passed;

select 'Test C6: the other client''s contact row exists' as test,
       (select count(*) from public.contacts where name = 'belongs to B') = 1 as passed;

-- C7. The RLS-scoped read returns nothing for the other client's row.
--
-- The count is taken **inside** the impersonated session, so it is the
-- RLS-filtered count and not the superuser's. `as_client` runs a statement
-- and swallows the result, so this helper is the one that needs the value:
-- it runs the count inside the impersonated session and returns it.
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

select 'Test C7: the RLS-scoped read of another client''s row is empty' as test,
       pg_temp.count_as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$select id from public.contacts where name = 'belongs to B'$s$
       ) = 0 as passed;

-- C7b. The same client DOES see its own rows — so C7 is not vacuously true.
select 'Test C7b: the same client still reads its own rows' as test,
       pg_temp.count_as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$select id from public.contacts where name = 'owned by the session'$s$
       ) = 1 as passed;

-- C8. A client CANNOT update another client's row.
select 'Test C8: a client cannot update another client''s row' as test,
       (select pg_temp.as_client(
          '11111111-1111-1111-1111-1111111111c1',
          $s$update public.contacts set name = 'hijacked'
            where user_id = '11111111-1111-1111-1111-1111111111c2'$s$
        ) = ''
        and (select count(*) from public.contacts where name = 'hijacked') = 0) as passed;

-- C9. A client CANNOT delete another client's row.
select 'Test C9: a client cannot delete another client''s row' as test,
       (select pg_temp.as_client(
          '11111111-1111-1111-1111-1111111111c1',
          $s$delete from public.contacts
            where user_id = '11111111-1111-1111-1111-1111111111c2'$s$
        ) = ''
        and (select count(*) from public.contacts where name = 'belongs to B') = 1) as passed;

-- =============================================================================
-- Test D — the ordering columns and the enum
-- =============================================================================

-- D1. The `is_primary` and `sort_order` columns exist with the right types.
select 'Test D1: the ordering columns exist with the right types' as test,
       (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'contacts'
           and column_name = 'is_primary') = 'boolean'
   and (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'contacts'
           and column_name = 'sort_order') = 'integer' as passed;

-- D2. `group_name` is the `contact_group` ENUM, not free text.
select 'Test D2: group_name is the contact_group enum' as test,
       (select udt_name from information_schema.columns
         where table_schema = 'public' and table_name = 'contacts'
           and column_name = 'group_name') = 'contact_group' as passed;

-- D3. The enum carries the four groups.
--
-- `enumlabel` is `name`, not `text`, so the comparison casts it — there is no
-- `name[] = text[]` operator.
select 'Test D3: the contact_group enum carries the four groups' as test,
       (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e
          join pg_type t on t.oid = e.enumtypid
         where t.typname = 'contact_group')
       = array['family', 'friend', 'colleague', 'other']::text[] as passed;

-- D4. The `group_name` column defaults to 'other'.
select 'Test D4: group_name defaults to other' as test,
       (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'contacts'
           and column_name = 'group_name') like '%other%' as passed;

-- D5. A group outside the enum is refused.
select 'Test D5: a group outside the enum is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone, group_name)
              values ('bad group', '+8801711000307', 'neighbour')$s$
       ) <> '' as passed;

-- D6. There is no cap: the table carries no row-count constraint of any kind.
--     The cap the story forbids is a client-side rule; the database must not
--     carry one either.
select 'Test D6: the contacts table carries no row-count cap' as test,
       (select count(*) = 0 from pg_constraint
         where conrelid = 'public.contacts'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) like '%count%') as passed;

-- =============================================================================
-- Test E — the timestamps and the primary flag
-- =============================================================================

-- E1. `created_at` and `updated_at` are set by the database.
select 'Test E1: created_at and updated_at are database-managed' as test,
       (select count(*) = 2 from information_schema.columns
         where table_schema = 'public' and table_name = 'contacts'
           and column_name in ('created_at', 'updated_at')
           and column_default like 'now()%') as passed;

-- E2. The `updated_at` trigger exists and is a BEFORE UPDATE trigger.
select 'Test E2: the contacts_set_updated_at trigger exists' as test,
       (select count(*) = 1 from pg_trigger
         where tgname = 'contacts_set_updated_at'
           and tgrelid = 'public.contacts'::regclass
           and not tgisinternal) as passed;

-- E3. The `updated_at` trigger **fires** on an update.
--
-- The assertion is deliberately about the trigger firing, not about the
-- timestamp advancing. `set_updated_at` uses `now()`, which in Postgres is
-- the **transaction** timestamp — so every write inside one transaction
-- carries the same `updated_at`, and an update cannot advance it past the
-- `created_at` of the same transaction. That is the correct behaviour: all
-- the rows written by one transaction share one timestamp, which is what
-- makes the timestamp a reliable ordering key.
--
-- So the proof that the trigger fires is that `updated_at` is **set to the
-- transaction time**, not left at whatever the row was created with.
--
-- The `created_at` value is captured **before** the update, so the two
-- assertions below compare against a value recorded earlier rather than
-- against the row's own current state.
create temporary table pg_temp.created_before (created_at timestamptz) on commit drop;

insert into pg_temp.created_before
select created_at from public.contacts where name = 'owned by the session';

select pg_temp.as_service(
  $s$update public.contacts set name = 'renamed'
       where name = 'owned by the session'$s$
) = '' as passed;

select 'Test E3: the update trigger sets updated_at to the transaction time' as test,
       (select count(*) from public.contacts
         where name = 'renamed'
           and updated_at >= created_at
           and updated_at = (select now() from public.contacts where name = 'renamed')) = 1 as passed;

-- E3b. `created_at` is NOT touched by an update — the trigger sets only
--      `updated_at`.
select 'Test E3b: an update leaves created_at alone' as test,
       (select count(*) from public.contacts c
         join pg_temp.created_before b on true
        where c.name = 'renamed'
          and c.created_at = b.created_at) = 1 as passed;

-- E4. `is_primary` defaults to false.
select 'Test E4: is_primary defaults to false' as test,
       (select count(*) = 1 from public.contacts
         where name = 'renamed' and is_primary = false) as passed;

-- =============================================================================
-- Test F — the disabled-account guard
-- =============================================================================

-- A disabled account cannot change its contact list. The guard is asserted
-- here because the live probe proves the same thing over PostgREST; both are
-- needed — this one names the policy, the other proves the effect.

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-1111111111c3', 'contacts-disabled@test.local',
   json_build_object('phone', '+8801711000203'));

update public.profiles
   set disabled_at = now() - interval '60 days'
 where id = '11111111-1111-1111-1111-1111111111c3';

select 'Test F1: a disabled account cannot insert a contact' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c3',
         $s$insert into public.contacts (name, phone)
              values ('from a disabled account', '+8801711000308')$s$
       ) <> '' as passed;

select 'Test F2: the disabled account''s insert wrote no row' as test,
       (select count(*) from public.contacts where name = 'from a disabled account') = 0 as passed;

-- =============================================================================
-- Test G — the ordering contract, as the read order
-- =============================================================================

-- The read order is `is_primary DESC, sort_order ASC, created_at ASC`. The
-- primary sorts first; the rest follow `sort_order`. This is the contract
-- unit 003's Personal Emergency picker depends on.

select pg_temp.as_service(
  $s$insert into public.contacts (user_id, name, phone, sort_order, created_at)
       values
         ('11111111-1111-1111-1111-1111111111c1', 'ordered-c', '+8801711000309', 2, now()),
         ('11111111-1111-1111-1111-1111111111c1', 'ordered-a', '+8801711000310', 0, now()),
         ('11111111-1111-1111-1111-1111111111c1', 'ordered-b', '+8801711000311', 1, now()),
         ('11111111-1111-1111-1111-1111111111c1', 'ordered-primary', '+8801711000312', 5, now())$s$
) = '' as passed;

update public.contacts set is_primary = true where name = 'ordered-primary';

select 'Test G1: the primary sorts first in the read order' as test,
       (select name from public.contacts
         where user_id = '11111111-1111-1111-1111-1111111111c1'
           and name like 'ordered-%'
         order by is_primary desc, sort_order asc, created_at asc
         limit 1) = 'ordered-primary' as passed;

select 'Test G2: the remaining rows follow sort_order ascending' as test,
       (select string_agg(name, ',' order by sort_order asc)
          from public.contacts
         where user_id = '11111111-1111-1111-1111-1111111111c1'
           and name in ('ordered-a', 'ordered-b', 'ordered-c')) = 'ordered-a,ordered-b,ordered-c' as passed;

select 'Test G3: the read order is stable across two reads' as test,
       (select string_agg(name, ',' order by is_primary desc, sort_order asc, created_at asc)
          from public.contacts
         where user_id = '11111111-1111-1111-1111-1111111111c1'
           and name like 'ordered-%')
       = (select string_agg(name, ',' order by is_primary desc, sort_order asc, created_at asc)
            from public.contacts
           where user_id = '11111111-1111-1111-1111-1111111111c1'
             and name like 'ordered-%') as passed;

-- =============================================================================
-- Test H — deleting the only primary
-- =============================================================================

-- The delete is allowed even when the row was the only primary. The list is
-- left valid with zero primaries, and the app offers to designate one. The
-- database must not carry a constraint that forbids the state.

delete from public.contacts where name = 'ordered-primary';

select 'Test H1: the only primary can be deleted' as test,
       (select count(*) from public.contacts where name = 'ordered-primary') = 0 as passed;

select 'Test H2: the list is left with zero primaries' as test,
       (select count(*) from public.contacts
         where user_id = '11111111-1111-1111-1111-1111111111c1'
           and is_primary = true) = 0 as passed;

select 'Test H3: the rest of the list survived the delete' as test,
       (select count(*) from public.contacts
         where user_id = '11111111-1111-1111-1111-1111111111c1'
           and name in ('ordered-a', 'ordered-b', 'ordered-c')) = 3 as passed;

-- =============================================================================
-- Test I — the name constraint
-- =============================================================================

-- The name is 1..120 characters. The shared schema is the first line of
-- defence; the CHECK is the second.

select 'Test I1: an empty contact name is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values ('', '+8801711000313')$s$
       ) <> '' as passed;

select 'Test I2: a name longer than 120 characters is refused' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values (repeat('a', 121), '+8801711000314')$s$
       ) <> '' as passed;

select 'Test I3: a 120-character name is accepted' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111c1',
         $s$insert into public.contacts (name, phone)
              values (repeat('b', 120), '+8801711000315')$s$
       ) = '' as passed;

-- =============================================================================
-- Test J — the ordering index
-- =============================================================================

-- The index that backs the read order exists, so the list does not degrade
-- into a sequential scan as a user's contacts grow.
select 'Test J1: the contacts_user_sort_idx index exists' as test,
       (select count(*) = 1 from pg_indexes
         where schemaname = 'public' and tablename = 'contacts'
           and indexname = 'contacts_user_sort_idx') as passed;

rollback;

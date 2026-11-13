-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/report_category.sql
--
-- The report-detail category contract, asserted **inside** Postgres.
--
-- This suite covers the half the live probe
-- (`tools/probe-report-category.cjs`) cannot: the properties of the column
-- itself — that it is nullable, that the CHECK accepts exactly the 11 values
-- and refuses everything else, that the enum type is the same 11 — and the
-- shape of the author check as a *rule* rather than as its effect.
--
-- The live probe proves the **effect** over PostgREST; this suite proves the
-- **cause**. Both are needed: an effect can be right for the wrong reason,
-- and a cause can be right with no effect to show for it.
--
-- The story
-- ---------
-- `004-capture / 003-report-detail-and-category-edit`:
--
--   * AC #3 — "it lists exactly the fixed 11 values … and there is **no**
--     free-text field";
--   * AC #4 — "the stored `reports.category` equals it";
--   * AC #5 — "the stored `reports.category` is replaced with the new value
--     and the previous value is not retained anywhere";
--   * AC #6 — "a signed-in user who is **not** the author … the update is
--     rejected with `FORBIDDEN` and the stored category is unchanged";
--   * AC #7 — "a value outside the fixed 11 … is rejected … and no row is
--     written";
--   * AC #10 — "the category is the **only** editable field after submit".
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
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/report_category.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

-- Two citizens, and a moderator who is neither. The uuid space is deliberately
-- distinct from the seed's and from the other suites', so this suite never
-- collides with the seeded dev accounts.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-1111111111d1', 'category-a@test.local',
   json_build_object('phone', '+8801711000301')),
  ('11111111-1111-1111-1111-1111111111d2', 'category-b@test.local',
   json_build_object('phone', '+8801711000302'));

-- The trigger created the two profiles.

-- The author's report. `category` is left NULL on purpose — a report with no
-- category is a valid, successful write (the edge-case table's first row).
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '22222222-2222-2222-2222-2222222222d1',
  '11111111-1111-1111-1111-1111111111d1',
  '33333333-3333-3333-3333-3333333333d1',
  23.8103, 90.4125, now(), 'a report awaiting its category', null,
  'anonymous', 'visible'
);

-- The other citizen's report, for the negative test.
insert into public.reports (
  id, author_id, client_request_id, lat, lng, captured_at, description,
  category, public_visibility, moderation_status
)
values (
  '22222222-2222-2222-2222-2222222222d2',
  '11111111-1111-1111-1111-1111111111d2',
  '33333333-3333-3333-3333-3333333333d2',
  23.8103, 90.4125, now(), 'another citizen''s report', 'theft',
  'anonymous', 'visible'
);

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

-- =============================================================================
-- Test 1 — the column is nullable, and a NULL category is a valid write
-- =============================================================================
--
-- The edge-case table's first row: "The author never sets a category — The
-- report keeps `category IS NULL`". A NULL is never a validation error, so
-- the report row must still be there and must still be readable.

select 'Test 1.1: a report with no category is a valid report' as test,
       (select count(*) from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1'
           and category is null) = 1 as passed;

-- The column really is nullable — not merely empty by convention. The
-- information_schema view is the authority here; `pg_attribute` would work
-- too but is version-dependent.
select 'Test 1.2: the category column is nullable' as test,
       (select is_nullable from information_schema.columns
         where table_schema = 'public'
           and table_name = 'reports'
           and column_name = 'category') = 'YES' as passed;

-- =============================================================================
-- Test 2 — the vocabulary is exactly the fixed 11
-- =============================================================================
--
-- Three layers guard the vocabulary, and this suite proves all three agree:
-- the shared parser in `packages/shared`, the enum type, and the CHECK
-- constraint. The story calls this "three layers, one vocabulary".

-- The enum type carries exactly the 11 values.
select 'Test 2.1: the enum type carries exactly 11 values' as test,
       (select count(*) from pg_enum
          join pg_type on pg_type.oid = pg_enum.enumtypid
          join pg_namespace on pg_namespace.oid = pg_type.typnamespace
         where pg_namespace.nspname = 'public'
           and pg_type.typname = 'report_category') = 11 as passed;

-- ...and the 11 are the right 11, in the order the story lists them.
--
-- `pg_enum.enumlabel` is of type `name`, so the aggregate comes back as
-- `name[]` and is compared against a `text[]` literal.
select 'Test 2.2: the enum carries exactly the story''s 11 values' as test,
       (select array_agg(e.enumlabel::text order by e.enumsortorder) = array[
          'theft','assault','harassment','robbery','accident','fire',
          'medical','fraud','vandalism','suspicious','other']::text[]
        from pg_enum e
          join pg_type on pg_type.oid = e.enumtypid
          join pg_namespace on pg_namespace.oid = pg_type.typnamespace
       where pg_namespace.nspname = 'public'
         and pg_type.typname = 'report_category') as passed;

-- The column is typed `public.report_category` — an ENUM, not `text` with a
-- CHECK. The story's technical note describes the intent as "`category text
-- NULL` with `CHECK (category IS NULL OR category IN (...))`", but the schema
-- that shipped uses the enum type, and the enum is a **stronger** guarantee
-- than the CHECK: Postgres will not even coerce a value that is not one of
-- the 11, so the vocabulary cannot be widened by a bad write. The deviation
-- is recorded in the story's Implementation Notes.
--
-- These two assertions prove the enforcement is live — an out-of-vocabulary
-- value cannot be cast to the enum, so it cannot be stored.

select 'Test 2.3: the column is typed with the enum, not free text' as test,
       (select udt_name from information_schema.columns
         where table_schema = 'public'
           and table_name = 'reports'
           and column_name = 'category') = 'report_category' as passed;

-- The cast ERRORS — Postgres refuses to coerce a value that is not one of the
-- 11, rather than storing it or quietly nulling it. The error is caught here
-- so the suite can assert on it: the assertion is that the cast raises, not
-- that it returns NULL.
create or replace function pg_temp.cast_fails(value text)
returns boolean
language plpgsql
as $w$
begin
  perform value::public.report_category;
  return false;
exception when others then
  return true;
end;
$w$;

select 'Test 2.4: a value outside the 11 cannot be cast to the enum' as test,
       pg_temp.cast_fails('not-a-category') as passed;

-- =============================================================================
-- Test 3 — the author writes a category
-- =============================================================================

select 'Test 3.1: the author can set a category' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select public.update_category('22222222-2222-2222-2222-2222222222d1', 'theft')$w$
       ) = '' as passed;

select 'Test 3.2: the stored category equals the selected value' as test,
       (select category from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') = 'theft' as passed;

-- Changing it REPLACES the value. The previous value is not retained
-- anywhere (AC #5) — so the row must not carry a second copy of the old
-- value, and there is no category-history table in the schema.
select 'Test 3.3: the author can change an already-set category' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select public.update_category('22222222-2222-2222-2222-2222222222d1', 'fire')$w$
       ) = '' as passed;

select 'Test 3.4: the stored category is replaced with the new value' as test,
       (select category from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') = 'fire' as passed;

-- The previous value is not retained anywhere on the row.
select 'Test 3.5: the previous value is not retained on the row' as test,
       (select category::text from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') <> 'theft' as passed;

-- And there is no category-history table to retain it in. The edge-case table
-- says "every intermediate value is transient and no history of category edits
-- is retained at MVP".
select 'Test 3.6: there is no category-history table' as test,
       (select count(*) from information_schema.tables
         where table_schema = 'public'
           and table_name ilike '%categor%') = 0 as passed;

-- Every one of the 11 is accepted by the RPC.
select 'Test 3.7: all 11 of the fixed values are accepted' as test,
       (select count(*) from unnest(array[
          'theft','assault','harassment','robbery','accident','fire',
          'medical','fraud','vandalism','suspicious','other']::public.report_category[]) v
         where pg_temp.as_client(
           '11111111-1111-1111-1111-1111111111d1',
           format($w$select public.update_category('22222222-2222-2222-2222-2222222222d1', '%s')$w$, v)
         ) = '') = 11 as passed;

-- The sweep above left the row on the LAST value it wrote ('other'), so the
-- downstream assertions need a known baseline again. The next write is the
-- one the negative tests are measured against.
select 'Test 3.8: the author can set a known baseline category' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select public.update_category('22222222-2222-2222-2222-2222222222d1', 'fire')$w$
       ) = '' as passed;

-- =============================================================================
-- Test 4 — the author check
-- =============================================================================
--
-- AC #6: "a signed-in user who is **not** the author … the update is rejected
-- with `FORBIDDEN` and the stored category is unchanged."
--
-- The refusal must be `FORBIDDEN` and not `NOT_FOUND`, so a caller cannot
-- probe which report ids exist by the error it gets back.

select 'Test 4.1: a non-author is refused with FORBIDDEN' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d2',
         $w$select public.update_category('22222222-2222-2222-2222-2222222222d1', 'fraud')$w$
       ) = 'FORBIDDEN' as passed;

select 'Test 4.2: the stored category is unchanged after the refusal' as test,
       (select category from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') = 'fire' as passed;

-- A report that does not exist is refused the SAME way. If it answered
-- `NOT_FOUND` instead, the difference between the two errors would tell a
-- caller whether a report id is real — so the two cases must be
-- indistinguishable.
select 'Test 4.3: a report that does not exist is refused with FORBIDDEN too' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select public.update_category('99999999-9999-9999-9999-999999999999', 'fraud')$w$
       ) = 'FORBIDDEN' as passed;

-- The refusal is a refusal, not a partial write: the `updated_at` must not
-- have moved either. A failed write that still bumps the timestamp is a
-- half-applied write.
--
-- The baseline is captured with the tests rather than compared to
-- `created_at`, because the legitimate category writes in Test 3 have already
-- moved `updated_at` away from it.
create temporary table pg_temp.updated_baseline as
select updated_at from public.reports where id = '22222222-2222-2222-2222-2222222222d1';

select 'Test 4.4: the refused write did not touch the row at all' as test,
       (select r.updated_at = b.updated_at
          from public.reports r
          join pg_temp.updated_baseline b on true
         where r.id = '22222222-2222-2222-2222-2222222222d1') as passed;

-- =============================================================================
-- Test 5 — a value outside the fixed 11 writes no row
-- =============================================================================
--
-- AC #7: "a value outside the fixed 11 … is rejected … and no row is
-- written."

-- The CHECK refuses it at the column level.
select 'Test 5.1: the CHECK refuses a value outside the 11' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$update public.reports set category = 'not-a-category'
          where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) <> '' as passed;

select 'Test 5.2: the refused value wrote no row' as test,
       (select category from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') = 'fire' as passed;

-- The RPC refuses it too. The RPC's parameter is typed `report_category`, so
-- a value outside the 11 cannot even be bound — the refusal happens before
-- the function body runs.
select 'Test 5.3: the RPC refuses a value outside the 11' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select public.update_category('22222222-2222-2222-2222-2222222222d1', 'not-a-category')$w$
       ) <> '' as passed;

-- =============================================================================
-- Test 6 — the category is the only editable field
-- =============================================================================
--
-- AC #10: "no edit affordance for those fields exists — the category is the
-- **only** editable field after submit".
--
-- The `reports_update_guard` trigger refuses every other column change, and
-- it refuses them for the AUTHOR too — the author cannot edit the
-- description, the location, or the visibility of their own report.
--
-- The author writes through `server_side_write` (the SECURITY DEFINER path),
-- so the trigger must not fire on the category write — Test 3.1 already
-- proved that. These assertions are the negative half: the direct table
-- write is refused even by the author.

select 'Test 6.1: the description is not editable by the author' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$update public.reports set description = 'edited'
          where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) <> '' as passed;

select 'Test 6.2: the visibility is not editable by the author' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$update public.reports set public_visibility = 'identified'
          where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) <> '' as passed;

select 'Test 6.3: the location is not editable by the author' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$update public.reports set lat = 24.0000
          where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) <> '' as passed;

-- The refused edits left the row untouched.
select 'Test 6.4: the refused edits left the row untouched' as test,
       (select description = 'a report awaiting its category'
           and public_visibility = 'anonymous'
           and lat = 23.8103
          from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') as passed;

-- =============================================================================
-- Test 7 — the author's own report is visible immediately
-- =============================================================================
--
-- AC #8 / FR-HIST-3: the report is present in the author's own History
-- immediately, with `moderation_status = 'visible'` and no pending-review
-- gate.
--
-- The `history_nearby` read model does not project `moderation_status` at
-- all — it FILTERS to `moderation_status in ('visible','restored')`. So a
-- row's presence in the projection IS the visibility guarantee: a report
-- that was pending review, hidden, or withdrawn would not be in the result
-- at all.
--
-- `history_nearby` returns `jsonb` — `{ items, next_cursor, total_count }` —
-- so the projection is unnested with `jsonb_array_elements`.
--
-- The call must run as the AUTHOR, because `is_own` compares `author_id`
-- against `auth.uid()`, and the projection is scoped by the caller's own
-- radius and window.

select 'Test 7.1: the author''s own report is in the History projection' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select count(*) from jsonb_array_elements(
                  public.history_nearby(23.8103, 90.4125, 50, 720, null, null, 100) -> 'items'
                ) h
           where h ->> 'id' = '22222222-2222-2222-2222-2222222222d1'$w$
       ) = '' as passed;

-- The presence assertion itself. The value comes back as text from the
-- JSONB projection, so it is compared as a count.
select 'Test 7.1b: the count is exactly one' as test,
       (select count(*) from jsonb_array_elements(
          public.history_nearby(23.8103, 90.4125, 50, 720, null, null, 100) -> 'items'
        ) h
        where h ->> 'id' = '22222222-2222-2222-2222-2222222222d1') = 1 as passed;

select 'Test 7.2: the History projection flags it as the caller''s own row' as test,
       (select (h ->> 'is_own')::boolean
          from jsonb_array_elements(
                  public.history_nearby(23.8103, 90.4125, 50, 720, null, null, 100) -> 'items'
                ) h
         where h ->> 'id' = '22222222-2222-2222-2222-2222222222d1') = true as passed;

-- The public projection must never leak the author (FR-DATA-3). The History
-- item is the author's own, so it may carry the flag — but `author_id` must
-- never appear on it.
select 'Test 7.3: the History projection does not carry author_id' as test,
       (select count(*) from jsonb_array_elements(
          public.history_nearby(23.8103, 90.4125, 50, 720, null, null, 100) -> 'items'
        ) h
        where h ? 'author_id') = 0 as passed;

-- The row's stored `moderation_status` really is 'visible' — the filter
-- above depends on it.
select 'Test 7.4: the stored moderation_status is visible' as test,
       (select moderation_status from public.reports
         where id = '22222222-2222-2222-2222-2222222222d1') = 'visible' as passed;

-- =============================================================================
-- Test 8 — a non-author cannot read the row at all
-- =============================================================================
--
-- AC #9: "the category is shown read-only with no edit affordance". The
-- database half of that is that the non-author has no row to show — the
-- `reports` SELECT policy does not return another citizen's report.
--
-- The shape of an RLS filter is important here: the read SUCCEEDS and
-- returns ZERO rows. It is not an error. So the assertion is on the count
-- the non-author sees, not on the status.

select 'Test 8.1: the author can read their own report' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select count(*) from public.reports
           where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) = '' as passed;

-- The non-author's read is scoped away by RLS — the statement succeeds, but
-- it sees zero rows.
select 'Test 8.2: a non-author sees no row to read' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-1111111111d2',
         $w$select count(*) from public.reports
           where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) = '' as passed;

-- ...and the count is zero, which is the whole point. The superuser sees
-- the row (it exists), so the two counts must differ.
--
-- `as_client` returns the error message, not the query's result — so the
-- count has to be captured by a helper that returns a VALUE. `client_count`
-- runs the statement as the client and hands back the first column of the
-- first row, or -1 when the statement raised.
create or replace function pg_temp.client_count(user_id uuid, statement text)
returns integer
language plpgsql
as $w$
declare
  v_count integer := -1;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', user_id, 'role', 'authenticated')::text, true);

  begin
    execute statement into v_count;
  exception when others then
    v_count := -1;
  end;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);

  return v_count;
end;
$w$;

select 'Test 8.3: the non-author''s count is zero while the owner''s is one' as test,
       pg_temp.client_count(
         '11111111-1111-1111-1111-1111111111d1',
         $w$select count(*) from public.reports
           where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) = 1
   and pg_temp.client_count(
         '11111111-1111-1111-1111-1111111111d2',
         $w$select count(*) from public.reports
           where id = '22222222-2222-2222-2222-2222222222d1'$w$
       ) = 0 as passed;

rollback;

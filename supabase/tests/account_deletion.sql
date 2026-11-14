-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- supabase/tests/account_deletion.sql
--
-- The 30-day recovery window, and the purge that closes it.
--
-- `002-identity / 007-account-deletion-and-recovery`.
--
-- =============================================================================
--
-- ## Why this suite exists
--
-- The story makes a two-part promise about the purge:
--
--   * "the PII purge leg scrubs the profile"; and
--   * "the purge does not run before the window closes".
--
-- The **second** half is the one that could be silently broken. The purge's
-- worklist is `job_purge_deleted_accounts`, whose entire content is a
-- predicate:
--
--     where p.deleted_at < now() - interval '30 days'
--       and p.pii_purged_at is null
--
-- If that predicate were wrong in the permissive direction — `<=`, or
-- `interval '29 days'`, or `deleted_at is not null` — the purge would destroy
-- accounts while they were still **recoverable**. The citizen would have been
-- promised 30 days, and the job would have taken their identity on day 1.
--
-- Nothing caught this. The restore path was proved (migration 035, and the
-- live probe), but the *other* side of the same promise — that the purge
-- waits — was never asserted anywhere. The two halves share one contract,
-- `profiles.deleted_at`, and a promise with only one side tested is half a
-- promise.
--
-- These tests call the worklist RPC itself, as the service role, and read
-- what it returns. That is the same door the Edge Function opens
-- (`supabase/functions/purge-deleted-accounts/index.ts` calls
-- `job_purge_deleted_accounts`), so the assertion is on the real rule and not
-- on a re-implementation of it in the test.
--
-- Run with:
--   docker exec -i supabase_db_nagar-shield psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/account_deletion.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

-- Four accounts, all soft-deleted, at four different ages. The ages are what
-- the whole suite is about:
--
--   * 1 day  — deep inside the window. Not a purge candidate.
--   * 29 days — one day short of the window. Still not a candidate.
--   * 30 days — exactly on the boundary. This is the row that decides the
--                semantics, so it gets its own tests below.
--   * 31 days — past the window. A candidate.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111201', 'fresh-delete@test.local',
   json_build_object('phone', '+8801711000201')),
  ('11111111-1111-1111-1111-111111111202', 'almost-delete@test.local',
   json_build_object('phone', '+8801711000202')),
  ('11111111-1111-1111-1111-111111111203', 'boundary-delete@test.local',
   json_build_object('phone', '+8801711000203')),
  ('11111111-1111-1111-1111-111111111204', 'expired-delete@test.local',
   json_build_object('phone', '+8801711000204'));

-- The trigger created the four profiles. Soft-delete them through the server
-- path at the four ages.
--
-- The ages are anchored to `now()` and rounded to the second, so the
-- boundary tests below are not a race: "31 days ago" is unambiguously more
-- than 30 days ago, and "29 days ago" is unambiguously less.
update public.profiles
   set deleted_at = now() - interval '1 day'
 where id = '11111111-1111-1111-1111-111111111201';

update public.profiles
   set deleted_at = now() - interval '29 days'
 where id = '11111111-1111-1111-1111-111111111202';

update public.profiles
   set deleted_at = now() - interval '30 days'
 where id = '11111111-1111-1111-1111-111111111203';

update public.profiles
   set deleted_at = now() - interval '31 days'
 where id = '11111111-1111-1111-1111-111111111204';

-- -----------------------------------------------------------------------------
-- Test A — the purge worklist waits for the window
-- -----------------------------------------------------------------------------

-- The worklist, called the way the Edge Function calls it.
--
-- The 1-day-old account must NOT be on it. If it were, the purge would
-- destroy an identity the citizen could still restore for another 29 days.
select 'Test A1: an account deleted 1 day ago is not a purge candidate' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id = '11111111-1111-1111-1111-111111111201') = 0 as passed;

-- 29 days is one day short of the window. It is still recoverable, so it is
-- still not a candidate. This is the assertion that would fail if the
-- predicate said `interval '29 days'`.
select 'Test A2: an account deleted 29 days ago is not a purge candidate' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id = '11111111-1111-1111-1111-111111111202') = 0 as passed;

-- 31 days is past the window. This one IS a candidate — the purge has to do
-- its job eventually, or the PII never goes.
select 'Test A3: an account deleted 31 days ago is a purge candidate' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id = '11111111-1111-1111-1111-111111111204') = 1 as passed;

-- The worklist carries only the accounts whose window has closed.
--
-- Scoped to the fixture accounts: the live probes leave real soft-deleted
-- accounts behind in the database, so an absolute count over the whole
-- worklist would assert about rows this suite does not own. The invariant is
-- about *these* four accounts.
select 'Test A4: the worklist holds only the expired accounts' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id in (
           '11111111-1111-1111-1111-111111111201',
           '11111111-1111-1111-1111-111111111202',
           '11111111-1111-1111-1111-111111111203',
           '11111111-1111-1111-1111-111111111204'
         )) = 2 as passed;

-- The worklist is ordered oldest-first, so a long backlog drains from the
-- front rather than starving the oldest accounts.
--
-- Scoped to the fixtures for the same reason: the *global* first row belongs
-- to whichever account was deleted longest ago, which may not be a fixture.
select 'Test A5: the worklist is ordered by the deletion, oldest first' as test,
       (select deleted_at from public.job_purge_deleted_accounts(500)
         where id in (
           '11111111-1111-1111-1111-111111111201',
           '11111111-1111-1111-1111-111111111202',
           '11111111-1111-1111-1111-111111111203',
           '11111111-1111-1111-1111-111111111204'
         )
         limit 1) = (select deleted_at from public.profiles
                      where id = '11111111-1111-1111-1111-111111111204') as passed;

-- -----------------------------------------------------------------------------
-- Test B — the boundary
-- -----------------------------------------------------------------------------

-- The window closes **at** `deleted_at + 30 days`, and the restore's
-- predicate is `now() >= v_deleted_at + interval '30 days'`. The purge's
-- predicate is `deleted_at < now() - interval '30 days'` — the same instant,
-- written from the other side.
--
-- So at exactly 30 days the two agree: the account is no longer recoverable,
-- and it is a purge candidate.
--
-- This is the assertion that pins the two halves of the promise to the same
-- boundary. If the purge used `<=` against `now() - interval '30 days'`, an
-- account would become a candidate one second *before* it stopped being
-- recoverable — and the citizen would lose an account the app still offered
-- to restore.
select 'Test B1: an account deleted exactly 30 days ago is a purge candidate' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id = '11111111-1111-1111-1111-111111111203') = 1 as passed;

-- The same account, one second inside the window, is not. The window is
-- closed *at* the boundary, so 30 days minus a second is still open.
--
-- The 30-day-old fixture is moved to `30 days - 1 second` for this test.
update public.profiles
   set deleted_at = now() - interval '30 days' + interval '1 second'
 where id = '11111111-1111-1111-1111-111111111203';

select 'Test B2: an account deleted one second short of 30 days is not a candidate' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id = '11111111-1111-1111-1111-111111111203') = 0 as passed;

-- -----------------------------------------------------------------------------
-- Test C — an account that has already been purged is not re-purged
-- -----------------------------------------------------------------------------

-- The purge stamps `pii_purged_at`. The worklist skips stamped accounts, so
-- a second run does not re-scrub a tombstone that is already scrubbed.
update public.profiles
   set pii_purged_at = now()
 where id = '11111111-1111-1111-1111-111111111204';

select 'Test C1: an already-purged account leaves the worklist' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id = '11111111-1111-1111-1111-111111111204') = 0 as passed;

-- Scoped to the fixtures for the same reason as A4: the live probes leave
-- real accounts on the worklist, and this suite does not own them.
select 'Test C2: none of the fixture accounts remain on the worklist' as test,
       (select count(*) from public.job_purge_deleted_accounts(500)
         where id in (
           '11111111-1111-1111-1111-111111111201',
           '11111111-1111-1111-1111-111111111202',
           '11111111-1111-1111-1111-111111111203',
           '11111111-1111-1111-1111-111111111204'
         )) = 0 as passed;

-- -----------------------------------------------------------------------------
-- Test D — the two halves of the promise agree
-- -----------------------------------------------------------------------------

-- The restore's window and the purge's window are the same promise, written
-- in two different files by two different pieces of code. This asserts they
-- do not drift: an account the restore would still accept must not be on the
-- purge worklist.
--
-- The restore's predicate is `now() >= deleted_at + interval '30 days'` and
-- the purge's is `deleted_at < now() - interval '30 days'`. Both are
-- evaluated against the server's clock, so the two agree by construction —
-- and this test is what proves the construction still holds.
select 'Test D1: a recoverable account is never on the purge worklist' as test,
       (select count(*)
          from public.profiles p
         where p.deleted_at is not null
           and now() < p.deleted_at + interval '30 days'
           and exists (select 1
                         from public.job_purge_deleted_accounts(500) w
                        where w.id = p.id)) = 0 as passed;

-- The other direction: an account on the purge worklist is not recoverable.
select 'Test D2: an account on the purge worklist is not recoverable' as test,
       (select count(*)
          from public.job_purge_deleted_accounts(500) w
          join public.profiles p on p.id = w.id
         where now() < p.deleted_at + interval '30 days') = 0 as passed;

-- -----------------------------------------------------------------------------
-- Test E — the worklist is the service role's alone
-- -----------------------------------------------------------------------------

-- The purge is not a client-callable endpoint. A signed-in citizen must not
-- be able to enumerate the accounts waiting to be purged.
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

select 'Test E1: a client cannot read the purge worklist' as test,
       pg_temp.as_client(
         '11111111-1111-1111-1111-111111111201',
         $w$select count(*) from public.job_purge_deleted_accounts(500)$w$
       ) <> '' as passed;

rollback;

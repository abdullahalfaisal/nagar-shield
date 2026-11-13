-- -----------------------------------------------------------------------------
-- A wrong-number report may be filed by a user who is not signed in.
--
-- `003-help-seek / 008-wrong-number-report` — "FR-SEEK-6 says **any user**,
-- and the sheet is reachable from the More Help sheet, so an anonymous report
-- must still be accepted — the row is written with `reported_by = null` and
-- the curator triage does not require an identity."
--
-- The defect this migration closes
-- ---------------------------------
-- The column was `reporter_id uuid not null references public.profiles (id)`
-- and the insert policy was `with check (reporter_id = auth.uid())`. Both
-- together meant an **anonymous** report was impossible: the insert failed
-- the NOT NULL constraint, and even a signed-out insert that somehow got
-- past the constraint failed the policy, because `auth.uid()` is NULL for an
-- anonymous request and `NULL = NULL` is not true in SQL.
--
-- The fix has two halves, and both are needed:
--
--   1. The column becomes **nullable**. The identity is a *stamp*, not an
--      ownership claim — the curator needs to know who reported a number when
--      they can, and can still triage when they cannot.
--   2. The insert policy accepts **either** the caller's own id **or** a
--      NULL reporter. `reporter_id is null or reporter_id = auth.uid()`.
--
-- The read policies are unchanged. A reporter still reads only their own
-- rows — which for an anonymous report means no rows, because an anonymous
-- caller has no id to match. The curator's select policy is unaffected, so
-- the anonymous row is still visible to the curator's read path, which is
-- what the story's "visible to the curator workflow" obligation needs.
--
-- The account-disabled guard is NOT weakened. `public.assert_account_not_disabled()`
-- still runs for a signed-in reporter, so a disabled account still cannot
-- file a report — the write guard test (G7) and the enabled-account test
-- (G26) both still hold. An anonymous caller is not a disabled account, so
-- the guard has nothing to say about them.
--
-- Forward-only: the column is altered in place and the policy is replaced.
-- No data is rewritten — every existing row already carries a reporter.
-- -----------------------------------------------------------------------------

alter table public.wrong_number_reports
  alter column reporter_id drop not null;

-- The `on delete cascade` is kept: when a profile is deleted, its reports
-- go with it. An anonymous report has no profile to cascade from, so it
-- survives — which is the correct behaviour, because the curator still needs
-- to see it.

drop policy if exists "wrong_number_reports_insert_own"
  on public.wrong_number_reports;

create policy "wrong_number_reports_insert_own"
  on public.wrong_number_reports for insert
  with check (
    (reporter_id is null or reporter_id = auth.uid())
    and public.assert_account_not_disabled()
  );

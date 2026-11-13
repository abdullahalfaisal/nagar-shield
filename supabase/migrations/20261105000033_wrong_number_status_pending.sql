-- -----------------------------------------------------------------------------
-- The wrong-number report's status vocabulary, and its free-text details.
--
-- `003-help-seek / 008-wrong-number-report` — "exactly one row is written to
-- `wrong_number_reports` with `entry_type` (`station` or `hotline`),
-- `entry_id`, the reporter (`reported_by`), the reason, **the free-text
-- details**, `status = 'pending'`, and `created_at`".
--
-- Two gaps this migration closes
-- ------------------------------
--
--   1. **`status = 'pending'`.** The table's CHECK constraint accepted
--      `('open', 'reviewed', 'rejected')` and defaulted to `'open'`. The story
--      names `'pending'` — the word that says "this report has not been
--      triaged yet" — and the story is the spec. `'open'` says the same thing
--      but under a different word, and a curator reading the curator's read
--      path would have to learn a second vocabulary for one table.
--
--      The rename is **forward-only in meaning**: `'open'` and `'pending'` are
--      the same state, so the existing rows are rewritten rather than left
--      straddling two vocabularies. `'reviewed'` and `'rejected'` are the
--      curator's closing states and are **unchanged** — the story does not
--      name them, and they already read correctly.
--
--   2. **The free-text `details` column.** The story's write path carries
--      `reason` **and** `details` as two fields — a bounded reason from a
--      fixed enum, plus an optional free-text explanation. The table had only
--      `reason`. There was nowhere for the details to go, so the client
--      concatenated the two into one string, and the curator could no longer
--      tell a fixed enum value from a citizen's own words.
--
--      The column is added **nullable**, so a report with no free text stores
--      `NULL` — the story's edge case: "the user submits with an empty
--      details textarea; the report is still accepted — the details are
--      optional and stored as `null`."
--
-- Forward-only: a new column and a constraint swap. The existing rows are
-- rewritten by the `open` → `pending` rename, which is a data change and is
-- therefore stated here explicitly.
-- -----------------------------------------------------------------------------

-- --- The details column -----------------------------------------------------

alter table public.wrong_number_reports
  add column if not exists details text;

-- The free-text details are bounded by the same 500-character limit as the
-- reason, so a long paste cannot bloat the curator's read path.
alter table public.wrong_number_reports
  drop constraint if exists wrong_number_reports_details_check;

alter table public.wrong_number_reports
  add constraint wrong_number_reports_details_check
  check (details is null or char_length(details) between 1 and 500);

-- --- The status vocabulary --------------------------------------------------

-- The old CHECK constraint is dropped before the rows are rewritten, because
-- a row that still says `'open'` would fail the new constraint.
alter table public.wrong_number_reports
  drop constraint if exists wrong_number_reports_status_check;

update public.wrong_number_reports
   set status = 'pending'
 where status = 'open';

alter table public.wrong_number_reports
  add constraint wrong_number_reports_status_check
  check (status in ('pending', 'reviewed', 'rejected'));

-- The column's default is the curator's *pending* state, so a client that
-- omits `status` files a report that is visibly awaiting triage.
alter table public.wrong_number_reports
  alter column status set default 'pending';

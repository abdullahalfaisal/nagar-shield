---
stage: implement
bolt: 025-jobs-operations
created: 2026-11-05T13:20:00Z
---

## Implementation Walkthrough: purge jobs

### Summary

Three scheduled purge jobs now keep the free tier's Storage and database
budgets honest: report media past its 90-day window, deleted accounts past
their 30-day recovery window, and reverse-geocode cache entries past their
90-day TTL. Each job derives its worklist from a query rather than a
queue table, writes exactly one audit row per invocation, and reports a
structured JSON envelope. The media purge runs in a dry-run mode that
touches nothing.

### Structure Overview

The three worklist RPCs live in one migration under `supabase/migrations/`.
Each job function follows the same shape: require the service role, open
its `job_runs` row, page through the worklist in batches, close the row,
and return the envelope. The shared open / close / count logic lives in one
helper so the audit-trail contract is written once. The retention constants
and the user-id hash live in `packages/shared`, and are mirrored into the
Edge Functions by the existing mirror script so the two can never drift.

### Completed Work

- [x] `supabase/migrations/20261105000012_job_functions.sql` - the three
      worklist RPCs, each `SECURITY DEFINER` with an empty search path and
      an explicit `service_role`-only execute grant.
- [x] `supabase/functions/_shared/job-runner.ts` - the shared
      `recordJobRun` / `closeJobRun` helper and the closed job-name
      vocabulary.
- [x] `supabase/functions/purge-media/index.ts` - the media purge, with the
      batch loop, the missing-object no-op, and the dry-run mode.
- [x] `supabase/functions/purge-deleted-accounts/index.ts` - the PII purge.
- [x] `supabase/functions/cleanup-geocode-cache/index.ts` - the cache
      eviction.
- [x] `packages/shared/src/jobs/index.ts` - the retention constants and
      the user-id hash.

### Key Decisions

- **The worklist is derived, not stored.** A queue table would need its own
  lifecycle, its own reconciliation, and its own failure mode. The query
  is the worklist, and the `purged_at` / `pii_purged_at` flags are the
  only state.

- **The window is evaluated server-side by Postgres `now()`.** The
  scheduler's clock is not trusted with a promise to the user about their
  own data.

- **The object is deleted before the flag is written.** The reverse order
  would let a crash mark a row as purged while its bytes were still in the
  bucket — the Storage quota would leak silently, which is the exact
  failure this job exists to prevent.

- **A missing Storage object is a no-op success.** A crash between the
  delete and the flag write, or an operator deleting an object by hand,
  must not fail the run: the retry has to converge, not loop.

- **The report record survives the purge.** The incident trail outlives
  the evidence. The purge removes media only.

- **The runner is the only writer of `job_runs`.** One helper, one
  contract: every invocation writes exactly one row, opened `running` and
  closed with the outcome.

- **The dry run writes its audit row and closes it.** A dry run that left
  its row `running` would look to the runbook's monitor stage like a job
  that died mid-flight. The dry run reports the worklist and touches
  nothing else.

### Deviations from Plan

- None.

### Dependencies Added

- None.

### Developer Notes

- The `purge_media` worklist includes a report whose `deleted_at` is set,
  which makes that media eligible immediately. The `reports` row itself is
  retained and only marked as withdrawn.
- The geocode cache TTL is anchored on `created_at`, **not** `last_hit_at`:
  a hot entry still expires at 90 days and is re-resolved once. That keeps
  the table's growth bounded by the number of distinct coordinates seen in
  90 days, which is what keeps the 500 MB database budget honest.
- The `MAX_BATCHES` cap bounds one invocation. A backlog larger than that
  is picked up by the next scheduled run — the job is idempotent, so
  resuming is safe.

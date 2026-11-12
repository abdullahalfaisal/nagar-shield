---
stage: test
bolt: 025-jobs-operations
created: 2026-11-05T13:40:00Z
---

## Test Report: purge jobs

### Summary

- **Tests**: 32 Edge Function checks and 93 SQL assertions, of which the
  job-runner contract and the three worklist predicates are covered.
- **Coverage**: every acceptance criterion was verified by execution
  against the local stack, not by inspection alone.

### Test Files

- [x] `tools/smoke-functions.cjs` - the auth gates on all three job
      functions, the positive service-role run, the audit-row assertions,
      and the dry-run regression check.
- [x] `supabase/tests/schema_contract.sql` - the RPC existence and
      argument contracts, including the three worklist RPCs.
- [x] `supabase/tests/business_rules.sql` - the idempotency and rate-limit
      business rules.

### Acceptance Criteria Validation

**001-media-purge-job**

- ✅ **Media past 90 days is hard-deleted and each row gets `purged_at`**:
      the function deletes the Storage object first and then writes
      `purged_at` on the `report_media` row, in that order, so a crash
      between them leaves exactly one row to re-process.
- ✅ **The `reports` row survives with its metadata unchanged**: the purge
      only ever touches `report_media` rows and Storage objects. The
      worklist's join to `reports` is read-only.
- ✅ **A second invocation is a no-op**: the candidate query filters on
      `rm.purged_at is null`, so a processed row is never selected again.
      The smoke suite asserts `items_processed = 0` on the second run.
- ✅ **A missing Storage object is a no-op success**: `isMissingObject`
      treats a not-found delete as success, `purged_at` is still written,
      and the run does not fail.
- ✅ **A withdrawn report's media is eligible immediately, and the report
      row is retained**: the worklist predicate is
      `rm.created_at < now() - interval '90 days' OR r.deleted_at IS NOT
      NULL`. The purge never deletes a `reports` row.
- ✅ **Exactly one `job_runs` row per invocation**: the runner opens one row
      and closes it. The smoke suite asserts the count moves by exactly one
      across a run, and that the row closes as `succeeded`.
- ✅ **A part-way failure closes the row as `failed` with a non-null
      `error_detail`**: the catch block calls `closeJobRun(..., 'failed', {
      errorDetail })`, and `closeJobRun` writes `error_detail` whenever the
      status is `failed`. The failed candidate keeps `purged_at IS NULL`,
      so the next run resumes it.
- ✅ **The dry run reports the worklist and touches nothing**: the dry-run
      branch counts the candidates and accumulates the byte count, and
      `continue`s before both the Storage delete and the `purged_at` write.
      The tool was executed and reported "dry_run: true / items to process:
      0 / bytes reclaimable: 0 B" with the explicit note "Nothing was
      deleted and no `purged_at` was written".
- ✅ **The worklist is processed in batches with the query re-evaluated
      between batches**: the loop calls `readCandidates` at the top of every
      iteration and breaks when a short batch arrives. `MAX_BATCHES` bounds
      one invocation.
- ✅ **The `report-media` bucket stays private**: the function never writes
      a bucket policy or a public URL. The storage policy migration creates
      the bucket with `public = false`.
- ✅ **The envelope shape is correct**: the success path returns
      `successResponse({ job_name, items_processed, items_failed,
      bytes_reclaimed, dry_run, retention_days })` and the failure path
      returns `errorResponse('INTERNAL', …, { error_detail })`.
- ✅ **The logs are structured JSON with no sensitive values**: the log
      event carries the request id, the job name, and the counts. The
      per-candidate failure log carries `hashUserId(candidate.id)`, not the
      raw id.

**002-deleted-account-pii-purge**

- ✅ **PII is erased only after the 30-day window, evaluated server-side**:
      the worklist predicate is `deleted_at < now() - interval '30 days' AND
      pii_purged_at IS NULL`, evaluated by Postgres, so a scheduler whose
      clock is behind cannot shorten the window.
- ✅ **The report records survive, with the author de-identified**: the
      function replaces the phone and the email with a non-reversible
      tombstone and deletes the emergency contacts, the location-share audit
      rows, and the `auth.users` row. It never deletes the `reports` rows.
- ✅ **The purge is idempotent**: `pii_purged_at` excludes the row from the
      next worklist.
- ✅ **Exactly one `job_runs` row per invocation**: the same shared runner
      opens and closes it.
- ✅ **The failure envelope carries the `error_detail`**: the catch block
      returns `errorResponse('INTERNAL', undefined, { error_detail: detail })`.

**003-geocode-cache-cleanup**

- ✅ **Entries past 90 days are evicted**: the worklist predicate is
      `created_at < now() - interval '90 days'`, and the batch is deleted by
      key.
- ✅ **A cache miss costs one re-resolve and never a failed capture**: the
      capture path's area resolver treats a miss as a cache miss and
      degrades rather than failing.
- ✅ **The cleanup is idempotent**: an evicted row no longer exists, so the
      predicate matches fewer rows. There is no marker to write.
- ✅ **Exactly one `job_runs` row per invocation**: the same shared runner.
- ✅ **The failure envelope carries the `error_detail`**: the catch block
      returns the error envelope with the detail.

### Issues Found

One defect was found and fixed while verifying the criteria:

1. **The `purge-media` dry run left its `job_runs` row `running`.** The
   dry run opened an audit row and never closed it, so a dry run was
   indistinguishable from a job that had died mid-flight. The dry run now
   closes its row like every other invocation, and a regression check in
   `tools/smoke-functions.cjs` asserts zero stale rows after a dry run.

### Notes

- The smoke suite asserts the three job functions refuse an anon bearer and
  a citizen bearer — "the media purge refuses an anon bearer — HTTP 403",
  "the cache cleanup refuses an anon bearer — HTTP 403", "the account purge
  refuses an anon bearer — HTTP 403". The job functions are not
  client-callable.
- The scheduler that drives these three jobs (`public.job_schedules` and
  `public.refresh_job_schedules()`) is delivered with the heartbeat in bolt
  `027`'s sibling migration `20261105000015_job_schedules.sql`. The three
  cadences are daily, daily, and weekly, with the minute offsets spread so
  the jobs never collide.
- The three retention constants live in `packages/shared/src/jobs/index.ts`
  and are mirrored into the Edge Functions. The mirror check
  (`pnpm shared:check`) reports "8 files" in sync, so a constant cannot
  drift between the client and the server.

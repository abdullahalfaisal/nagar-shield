---
stage: plan
bolt: 025-jobs-operations
created: 2026-11-05T13:00:00Z
---

## Implementation Plan: purge jobs

### Objective

Deliver the three **scheduled purge jobs** for unit `008-jobs-operations` —
the jobs that keep the free tier's Storage and database budgets honest:

- **001-media-purge-job** — hard-delete report media older than 90 days,
  leaving the report record intact.
- **002-deleted-account-pii-purge** — erase a deleted account's PII once
  the 30-day recovery window has closed, and not a moment before.
- **003-geocode-cache-cleanup** — evict stale reverse-geocode cache entries
  so the table never grows past the 500 MB database budget.

### Deliverables

- `supabase/migrations/20261105000012_job_functions.sql` — the three
  worklist RPCs.
- `supabase/functions/purge-media/index.ts` — the media purge.
- `supabase/functions/purge-deleted-accounts/index.ts` — the PII purge.
- `supabase/functions/cleanup-geocode-cache/index.ts` — the cache eviction.
- `supabase/functions/_shared/job-runner.ts` — the shared open / close /
  count helper.
- `packages/shared/src/jobs/index.ts` — the shared retention constants and
  the user-id hash.

### Dependencies

- **001-foundation** — the shared package and the Edge Function runtime.
- **002-identity** — the `profiles` table, `deleted_at`, and `pii_purged_at`.
- **004-capture** — the `report_media` table, the private `report-media`
  Storage bucket, and the `reports` table's `deleted_at`.
- **006-alerts** — the `geocode_cache` table the capture path writes.

### Technical Approach

**The worklist is derived, never stored.** There is no queue table and no
worklist table. The candidate set is a query, and the three RPCs express
it:

- media — `purged_at IS NULL AND (created_at < 90 days OR report.deleted_at
  IS NOT NULL)`;
- accounts — `deleted_at < 30 days AND pii_purged_at IS NULL`;
- geocode cache — `created_at < 90 days`.

A withdrawn report's media is eligible **immediately** — the author already
asked us to remove it — but the `reports` row itself is retained and only
marked as withdrawn. The purge deletes **media only**, never report
metadata: the incident trail has to survive the evidence.

**The comparison is evaluated server-side by Postgres `now()`.** A scheduler
whose clock is behind can never shorten the recovery window, and the
30-day PII window is a promise to the user.

**Delete the object first, then write the flag.** A crash between the two
leaves exactly one row to re-process, and the retry converges. A Storage
object that is already missing is a **no-op success**, not a failure — the
row still gets its `purged_at` and the run does not fail.

**The worklist is processed in batches** with the candidate query
re-evaluated between batches, so a large backlog cannot time the function
out and the rows already processed are not re-visited.

**Every invocation writes exactly one `job_runs` row.** It is opened as
`running` at the start and closed as `succeeded` or `failed` at the end,
with `finished_at`, `items_processed`, `items_failed`, and a non-null
`error_detail` on failure. The runner is the **only** writer of the table,
so the audit trail cannot have zero rows or two rows for one invocation.

**The logs are structured JSON and carry no sensitive values** — the
request id, the job name, the counts, and the reclaimed byte count. No GPS
coordinates, no media payloads, no storage paths, no tokens.

### Acceptance Criteria

**001-media-purge-job**

- [ ] Media older than 90 days is **hard-deleted** from the private
      `report-media` bucket and each row gets `purged_at` set.
- [ ] The `reports` row survives the purge with its metadata unchanged.
- [ ] A second invocation selects nothing, reports `items_processed = 0`,
      touches no Storage object, and exits `0`.
- [ ] A missing Storage object is a no-op success: `purged_at` is written
      and the run does not fail.
- [ ] A withdrawn report's media is eligible immediately, and the
      `reports` row is retained.
- [ ] Exactly one `job_runs` row exists per invocation, opened `running`
      and closed with `finished_at` and the counts.
- [ ] A part-way failure closes the row as `failed` with a non-null
      `error_detail`, and the unprocessed candidates stay `purged_at IS
      NULL`.
- [ ] `{ "dry_run": true }` reports the worklist and the byte count without
      deleting anything and without writing `purged_at`.
- [ ] The worklist is processed in batches with the query re-evaluated
      between batches.
- [ ] The `report-media` bucket stays **private** — the purge never relaxes
      its visibility.
- [ ] The success envelope is `{ "data": { "job_name": "purge_media", … } }`
      and a failure is the error envelope with `error_detail`.
- [ ] The logs are structured JSON with no coordinates, paths, or tokens.

**002-deleted-account-pii-purge**

- [ ] PII is erased only after the 30-day window, evaluated server-side.
- [ ] The report records of a purged account are retained, with the author
      de-identified.
- [ ] The purge is idempotent — `pii_purged_at` makes the second run a
      no-op.
- [ ] Exactly one `job_runs` row exists per invocation.
- [ ] The failure envelope carries the `error_detail`.

**003-geocode-cache-cleanup**

- [ ] Entries older than 90 days are evicted.
- [ ] A cache miss costs one re-resolve and never a failed capture.
- [ ] The cleanup is idempotent.
- [ ] Exactly one `job_runs` row exists per invocation.
- [ ] The failure envelope carries the `error_detail`.

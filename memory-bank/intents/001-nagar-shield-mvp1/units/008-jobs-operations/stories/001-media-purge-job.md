---
id: 001-media-purge-job
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 001-media-purge-job

## User Story

**As a** Nagar Shield operator responsible for keeping the service free to run
**I want** a scheduled job that hard-deletes report media older than 90 days while leaving the report record intact
**So that** the 1 GB Storage quota is never exhausted, the incident trail survives the evidence, and the purge can be re-run safely at any time without deleting anything twice

## Acceptance Criteria

- [ ] **Given** `report_media` rows whose `created_at` is older than 90 days, **When** `purgeMedia()` runs, **Then** the corresponding **Storage objects** in the private bucket `report-media` are **hard-deleted** and each affected `report_media` row has `purged_at` set to the run timestamp — the object bytes are gone from the bucket, not merely unlinked (FR-DATA-4)
- [ ] **Given** a media row whose Storage object has been deleted, **When** the `reports` row it belongs to is inspected, **Then** the report row **still exists** with its `category`, `description`, `area_hierarchy`, `lat` / `lng`, `captured_at`, and `moderation_status` unchanged — the purge deletes **media only**, never report metadata
- [ ] **Given** the purge has already processed a worklist, **When** `purgeMedia()` is invoked a second time, **Then** the candidate query selects **nothing** (every processed row now has `purged_at` set), the response reports `items_processed = 0`, **no** Storage object is touched, and the function exits `0` — the job is idempotent
- [ ] **Given** a Storage object is already missing from the bucket (a crash between the object delete and the `purged_at` write, or an operator-side deletion), **When** the purge processes that row, **Then** the missing object is treated as a **no-op success**, `purged_at` is written, and the run does not fail — the retry converges instead of looping
- [ ] **Given** a `reports` row whose `deleted_at` is set (the author withdrew the report), **When** the purge builds its worklist, **Then** that report's media is eligible **immediately**, without waiting the 90 days — but the `reports` row is still **retained** and only marked as withdrawn
- [ ] **Given** any invocation of `purgeMedia()`, **When** it completes, **Then** **exactly one** `job_runs` row exists for the invocation — opened as `status = 'running'` with `job_name = 'purge_media'` and closed as `succeeded` (or `failed`) with `finished_at`, `items_processed`, `items_failed`, and a non-null `error_detail` when it failed
- [ ] **Given** a purge invocation that fails part-way, **When** the run is audited, **Then** the single `job_runs` row reads `status = 'failed'` with a non-null `error_detail` — **not** zero rows and **not** two — and the unprocessed candidates remain `purged_at IS NULL` so the next run resumes them
- [ ] **Given** a request body of `{ "dry_run": true }`, **When** `purgeMedia()` is invoked, **Then** it reports the candidate worklist and the reclaimable byte count **without deleting any Storage object and without writing any `purged_at`**, and the response carries `dry_run: true`
- [ ] **Given** a worklist larger than the free tier's Edge Function execution window, **When** the purge processes it, **Then** the work is processed in **batches** with the candidate query re-evaluated between batches, so a large backlog cannot time the function out and the rows already processed are not re-visited
- [ ] **Given** the purge runs against the private `report-media` bucket, **When** the bucket configuration is inspected, **Then** the bucket remains **private** (no public URL, no public path convention) and media is still reachable only through short-lived signed URLs — the purge never relaxes the bucket's visibility (FR-DATA-1)
- [ ] **Given** a successful run, **When** the response envelope is inspected, **Then** it is `{ "data": { "job_name": "purge_media", "items_processed": n, "items_failed": m, "bytes_reclaimed": b, "dry_run": false } }`, and a failure is `{ "error": { "code": "INTERNAL", "message": "…", "details": { "error_detail": "…" } } }`
- [ ] **Given** the function runs, **When** its logs are inspected, **Then** they are **structured JSON** (request id, job name, counts, bytes reclaimed) and contain **no** raw GPS coordinates, media payloads, storage paths, passwords, or tokens — the reclaimed byte count is logged, not the object list

## Technical Notes

- **The function lives at `supabase/functions/purge-media/` and is invoked at `POST /functions/v1/purge-media`.** The caller is the Supabase Cron entry or the documented external-scheduler fallback, authenticated with the service-role bearer. The function is **not** a client-callable endpoint and has no anon or authenticated policy path.
- **The worklist is derived, never stored.** There is **no queue table and no worklist table** in this unit. The candidate set is exactly:

  ```sql
  SELECT rm.id, rm.storage_path, rm.byte_size
  FROM report_media rm
  JOIN reports r ON r.id = rm.report_id
  WHERE rm.purged_at IS NULL
    AND (rm.created_at < now() - interval '90 days' OR r.deleted_at IS NOT NULL)
  ORDER BY rm.created_at ASC
  LIMIT $batch_size;
  ```

  `report_media.created_at` is the upload timestamp and is already indexed (`report_media (created_at)`), so the derivation is a single indexed range scan. A stored queue would duplicate the age signal and create a second source of truth for "what is expired".
- **`purged_at` is the idempotency mechanism.** The order per candidate is strictly: **(1)** delete the Storage object by `report_media.storage_path` from bucket `report-media`; **(2)** set `report_media.purged_at = now()`. The object goes first so the flag can never claim a deletion that did not happen. The Storage delete is itself idempotent — deleting a missing object is a no-op — so a crash between the two steps leaves exactly one row to re-process, and the retry converges.
- **The report metadata is never touched.** The function's only write to a unit-`004`-owned table is `report_media.purged_at`. It never writes `reports`, never deletes a `reports` row, and never alters `category`, `description`, `area_hierarchy`, `captured_at`, or `moderation_status`. The moderation trail (`moderation_actions`) is unaffected.
- **The `reports.deleted_at` sweep is additive.** A withdrawn report's media is content the author already asked us to remove; leaving it for another 90 days would be wrong. The `reports` row itself is still retained as the metadata record and is excluded from the public read models by unit `006`.
- **Batching.** The free tier's Edge Function execution window is the hard ceiling on a single run. The function processes `batch_size` candidates per iteration (default 100), re-queries between batches, and stops when the candidate query returns empty or the execution budget is exhausted. `bytes_reclaimed` accumulates across the batches of the run.
- **The shared job-runner is the only writer of `job_runs`.** `supabase/functions/_shared/job-runner.ts` exposes `recordJobRun({ job_name })` → a run id and `closeJobRun(id, { status, items_processed, items_failed, error_detail })`. Every job goes through it, so "exactly one audit row per invocation" is a structural property rather than a convention. A failure path still closes the row — it never leaves it dangling.
- **A `running` row is a signal, not a bug.** A job killed mid-flight leaves `status = 'running'` with a null `finished_at`. The monitor stage of the runbook reads for stale `running` rows; it does not delete them.
- **The service-role key is confined to the function and CI.** The purge crosses the RLS boundary by design (it deletes Storage objects and writes `purged_at` on rows no client may read). The key lives in the Edge Function environment and in GitHub Environment secrets only — never in the mobile bundle, never in the admin bundle, never as an EAS build env var.
- **The dry run is a first-class mode, not a flag day.** `{ "dry_run": true }` returns the candidate count and the reclaimable byte estimate and performs **no** delete and **no** `purged_at` write. The local script `tools/purge-media-dry-run.ts` calls the same function in dry-run mode so an operator can inspect the worklist before a production run.
- **Cron cadence.** The job is scheduled **daily** (a daily cadence is well inside the 90-day window and keeps a missed run recoverable within a day). The scheduler is Supabase Cron / `pg_cron` hitting the function URL; the documented fallback is an external scheduler hitting the **same** URL with the same service-role bearer, so the two paths are interchangeable.
- **Tests.** Jest covers the pure helpers — the age cut-off (a candidate at 89 days is kept; a candidate at 90 days is purged), the idempotency rule (a row with `purged_at` set is never re-selected), and the missing-object case (treated as success). A Supabase-local integration test seeds a Storage bucket and asserts: the object is deleted, the `reports` row survives, the `report_media` row is marked `purged_at`, and the **second run is a no-op with `items_processed = 0`**.
- **The purge is the single most important free-tier control.** Supabase Free carries a **1 GB Storage** quota and the MVP targets ~50,000 reports over 90 days. Without this job running from day one, the quota is exhausted inside the MVP window and the Capture path — the product's second-most-important surface — starts rejecting uploads. There is no second copy of the media to fall back on.

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the typed Supabase client, the shared Zod contracts, and the CI workflow this job's tests run inside
- Unit `004-capture` — the `reports` / `report_media` tables, the `storage_path` contract, the **private** `report-media` bucket this job deletes from, and the `geocode_cache` table the sibling cleanup job evicts
- Unit `002-identity` — `profiles.id` as `reports.author_id`, so the retained report metadata keeps its identity FK
- `007-storage-upload-and-finalize` — the upload path that creates the `report_media` rows and the `reports/{author_token}/{client_request_id}/{file}` storage-path policy this job deletes from
- `004-exif-strip-and-media-caps` — the per-file byte caps that keep the worklist inside the 1 GB quota between purge runs
- `bolt-008-jobs-operations-1` — `supabase/migrations/0007_jobs.sql`: the `job_runs` table, the `report_media.purged_at` column, the `reports.deleted_at` column, and the age-scan index
- `bolt-008-jobs-operations-2` — the shared `job-runner` helper and the `purge-media` Edge Function shell

### Enables
- `002-deleted-account-pii-purge` — the sibling purge that scrubs account PII; both share the `job-runner` contract and the `job_runs` audit trail
- `003-geocode-cache-cleanup` — the sibling eviction job that shares the same runner, cron wiring, and failure semantics
- `005-ci-pipeline` — the CI job that runs this purge's unit and Supabase-local integration tests against a seeded bucket
- `006-release-runbook` — the monitor stage that reads the Storage gauge and the last `job_runs` row to confirm the purge is keeping up
- `007-secrets-and-environments` — the rule that the service-role key needed by this job is confined to Edge Functions and CI

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The purge runs twice within the same minute | The second run selects nothing, reports `items_processed = 0`, and exits `0` — no Storage object is touched twice |
| A Storage object was already deleted out of band | The delete is a no-op, `purged_at` is written, and the run is counted as processed — the job converges instead of failing forever on one row |
| The function crashes between the object delete and the `purged_at` write | Exactly one `job_runs` row is left at `status = 'running'` with a null `finished_at`; the next run re-selects the single row, finds the object already gone, writes `purged_at`, and converges |
| The function crashes between two batches | The rows already processed keep `purged_at` and are not re-visited; the remaining candidates are re-selected by the next run |
| The worklist is far larger than one execution window | The run processes it in batches and stops at the budget; the response counts only what was processed, and the leftover stays eligible for the next run |
| A report was withdrawn by its author 2 days ago | Its media is deleted in the next run — no 90-day wait for content the author asked to be removed — while the `reports` row is retained with `deleted_at` set |
| The report has several media rows | Each object is deleted and each `report_media` row gets its own `purged_at`; a failure on one row does not stop the others, and the failure is counted in `items_failed` |
| The Storage API returns a transient 5xx for one object | The item is counted in `items_failed`, `error_detail` is recorded on the single `job_runs` row, and the row stays `purged_at IS NULL` for the next run — the job is resumable |
| The bucket has been made public by mistake | The purge still deletes by path, but the release verification and the monitor stage flag the bucket's visibility — the purge never relies on the bucket being public |
| The bucket is empty and there are no candidates | The run succeeds with `items_processed = 0`, `bytes_reclaimed = 0`, and one `job_runs` row with `status = 'succeeded'` — an empty purge is a normal, healthy outcome |
| The scheduler's clock is behind the database clock | The age comparison is evaluated server-side by Postgres `now()`, so the window is always the database's, never the caller's |
| The service-role key is missing from the function's environment | The function returns the standard error envelope with `code = 'INTERNAL'`, closes its single `job_runs` row as `failed` with a non-null `error_detail`, and deletes nothing |

## Out of Scope

- The `reports` / `report_media` schema, the media pipeline, the storage-path policy, and the offline upload queue — unit `004`. This story writes only `report_media.purged_at`
- The `geocode_cache` eviction — `003-geocode-cache-cleanup`
- The account PII purge and the 30-day recovery window — `002-deleted-account-pii-purge` and unit `002`
- The public feed / history read models and their obligation to exclude `reports.deleted_at` rows — unit `006`
- The `moderation_actions` audit trail and the moderator console — unit `007`
- A general-purpose job queue, a task framework, a message broker, and a worker fleet — the MVP needs four functions and a cron entry
- `keepProjectAwake()` and the free-tier inactivity heartbeat — a sibling job in this unit
- Media compression, transcoding, thumbnail generation, and EXIF handling — unit `004`
- Per-file retention overrides, a user-facing "keep my media" toggle, and per-category retention windows
- The `geocode_cache` table, the `area_lookup` table, and the reverse-geocode resolution order — unit `004`
- Any admin surface for `job_runs` — the console is moderation-only (ADR-010); job runs are read from the Supabase dashboard and the SQL editor

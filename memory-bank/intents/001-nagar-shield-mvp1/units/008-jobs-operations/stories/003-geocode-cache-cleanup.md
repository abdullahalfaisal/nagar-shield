---
id: 003-geocode-cache-cleanup
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: should
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 003-geocode-cache-cleanup

## User Story

**As a** Nagar Shield operator watching the free-tier database budget
**I want** stale reverse-geocode cache entries evicted on a schedule
**So that** the cache never grows past what the 500 MB free-tier database can hold, while a cache miss costs only one re-resolve and never a failed capture

## Acceptance Criteria

- [ ] **Given** `geocode_cache` rows whose `created_at` is older than **90 days**, **When** `cleanupGeocodeCache()` runs, **Then** those rows are **deleted** from `geocode_cache` and the response reports the number of rows removed
- [ ] **Given** `geocode_cache` rows whose `created_at` is **89 days** old, **When** `cleanupGeocodeCache()` runs, **Then** they are **kept** — the eviction touches only rows strictly older than the 90-day TTL, and the newer rows are still resolvable by the capture path
- [ ] **Given** a cleanup that has already run, **When** `cleanupGeocodeCache()` is invoked again, **Then** it deletes nothing further, reports `items_processed = 0`, and exits `0` — the job is **idempotent**
- [ ] **Given** the cleanup runs, **When** the tables are inspected, **Then** **no other table is modified** — `reports`, `report_media`, `profiles`, `area_lookup`, and `job_runs` (other than the job's own audit row) are untouched, and the `geocode_cache` rows that survive keep their `key`, `area_hierarchy`, `source`, and `last_hit_at` intact
- [ ] **Given** any invocation of `cleanupGeocodeCache()`, **When** it completes, **Then** **exactly one** `job_runs` row exists for the invocation — opened as `status = 'running'` with `job_name = 'cleanup_geocode_cache'` and closed as `succeeded` (or `failed`) with `finished_at`, `items_processed`, `items_failed`, and a non-null `error_detail` when it failed
- [ ] **Given** a cleanup invocation that fails part-way, **When** the run is audited, **Then** the single `job_runs` row reads `status = 'failed'` with a non-null `error_detail` — **not** zero rows and **not** two — and the rows that were not removed stay in the table for the next run
- [ ] **Given** a cache row is evicted, **When** a user captures a report at that coordinate afterwards, **Then** the capture path treats it as a **cache miss** and re-resolves through the normal `area_lookup` → `geocode_cache` → online backup → degrade chain — the eviction costs one re-resolve and never blocks or fails the capture
- [ ] **Given** the cleanup runs against the cache, **When** its logs are inspected, **Then** they are **structured JSON** (request id, job name, counts) and contain **no** raw GPS coordinates — a cache key that encodes a coordinate is never written to a log line
- [ ] **Given** the response envelope of a successful run, **When** it is inspected, **Then** it is `{ "data": { "job_name": "cleanup_geocode_cache", "items_processed": n, "items_failed": m } }`, and a failure is `{ "error": { "code": "INTERNAL", "message": "…", "details": { "error_detail": "…" } } }`

## Technical Notes

- **The function lives at `supabase/functions/cleanup-geocode-cache/` and is invoked at `POST /functions/v1/cleanup-geocode-cache`.** It is called by the Supabase Cron entry (or the documented external-scheduler fallback) with the service-role bearer. It is **not** a client-callable endpoint and has no anon or authenticated policy path.
- **The eviction predicate is a single indexed range scan:**

  ```sql
  DELETE FROM geocode_cache
  WHERE created_at < now() - interval '90 days'
  RETURNING key;
  ```

  The delete is expressed as a single `DELETE … RETURNING` rather than a `SELECT` plus a per-row delete, so the whole cleanup is one statement and one round trip.
- **The cache is a cache — eviction is always safe.** `geocode_cache` holds `key` (the coordinate key), `area_hierarchy` (jsonb), `source`, `created_at`, and `last_hit_at`. Dropping a row can only cost one re-resolve through the chain unit `004` owns: `area_lookup` → `geocode_cache` → online backup → degrade. There is no correctness dependency on a cache row's survival, which is why this story is `should` rather than `must`.
- **The TTL is anchored on `created_at`, not `last_hit_at`.** The 90-day TTL is an absolute age on the row, so a hot entry that is hit every minute still expires at 90 days and is re-resolved once. This keeps the table's growth bounded by the **number of distinct coordinates seen in 90 days**, which is what keeps the 500 MB free-tier database budget honest.
- **The unit owns eviction only — never the table.** The `geocode_cache` table, its key format, its `source` values, and the reverse-geocode resolution order belong to unit `004`. This story writes **no** cache row, never inserts, never updates `last_hit_at`, and never changes the schema. It only removes expired rows.
- **The shared job-runner is the only writer of `job_runs`.** `supabase/functions/_shared/job-runner.ts` exposes `recordJobRun({ job_name })` and `closeJobRun(id, { status, items_processed, items_failed, error_detail })`, so exactly one audit row per invocation is structural rather than a convention. A failure path still closes the row — it never leaves it dangling at `running`.
- **Batching.** The delete is issued in batches (default 500 rows per statement) with the predicate re-evaluated between batches, so a large backlog cannot exhaust the free tier's Edge Function execution window. `items_processed` accumulates across the batches of the run.
- **Idempotency is a property of the predicate, not of a flag.** There is no "purged" marker on a cache row: a row that has been evicted no longer exists, so a second run's predicate simply matches fewer rows. That is the whole idempotency argument, and it is why this job needs no extra column on a table owned by another unit.
- **The service-role key is confined to the function and CI.** The delete bypasses RLS by design — no client may write `geocode_cache`. The key lives in the Edge Function environment and in GitHub Environment secrets only; it is never in the mobile bundle, never in the admin bundle, and never an EAS build env var.
- **Cron cadence.** The job is scheduled **weekly**. The cache grows slowly (one row per distinct coordinate), the 90-day TTL is forgiving, and a weekly cadence is far inside the budget — the job is a safety valve against unbounded growth, not a hot path.
- **Tests.** Jest covers the cut-off (a row at 89 days is kept; a row at 90 days is evicted) and the idempotency rule (a second run over an already-evicted table removes nothing). A Supabase-local integration test seeds rows at 89 and 91 days and asserts: only the 91-day row is deleted, the surviving rows keep their `area_hierarchy` and `last_hit_at`, and no other table changes.
- **Why this is `should` and not `must`.** The purge of the geocode cache is not load-bearing for a correctness or a legal property: a stale row costs one re-resolve and a missing row costs one re-resolve. It matters for the **free-tier database budget**, so it ships — but it ships at `should` because its absence degrades cost, not behaviour.

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the typed Supabase client, the shared Zod contracts, and the CI workflow this job's tests run inside
- Unit `004-capture` — the `geocode_cache` table, its key format, and the `area_lookup` → `geocode_cache` → online backup → degrade resolution order that makes a cache miss safe
- `002-area-hierarchy-extraction` — the resolution chain whose cache-miss behaviour this eviction relies on
- `bolt-008-jobs-operations-1` — `supabase/migrations/0007_jobs.sql`: the `job_runs` table and the no-policy RLS posture on it
- `bolt-008-jobs-operations-2` — the shared `job-runner` helper and the `cleanup-geocode-cache` Edge Function shell

### Enables
- `001-media-purge-job` — the sibling purge that shares the same runner, cron wiring, and failure semantics
- `002-deleted-account-pii-purge` — the sibling purge that shares the same runner and the `job_runs` audit trail
- `005-ci-pipeline` — the CI job that runs this cleanup's unit and Supabase-local integration tests
- `006-release-runbook` — the monitor stage that confirms the last `cleanup_geocode_cache` row is `succeeded`
- `007-secrets-and-environments` — the rule that the service-role key needed by this job is confined to Edge Functions and CI

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The cleanup runs twice within the same minute | The second run deletes nothing, reports `items_processed = 0`, and exits `0` — there is no "already purged" flag to get out of sync |
| A row is exactly 90 days old | It is evicted — the predicate is `created_at < now() - interval '90 days'`, evaluated on the database clock |
| A row is 89 days old but was hit 10 minutes ago | It is **kept** — the TTL is anchored on `created_at`, and `last_hit_at` does not extend a row's life |
| The cache is empty | The run succeeds with `items_processed = 0` and one `job_runs` row at `status = 'succeeded'` — an empty cleanup is a healthy outcome |
| The cache holds 200,000 expired rows | The delete is issued in batches so the free tier's Edge Function execution window is not exhausted; the rows that were not reached remain for the next run |
| The delete statement fails mid-run | The already-deleted rows stay deleted, the failure is counted in `items_failed`, `error_detail` is recorded on the single `job_runs` row, and the run is marked `failed` |
| A user captures at a coordinate whose cache row was just evicted | The capture path re-resolves through `area_lookup` → online backup → degrade; the capture succeeds and the cache row is repopulated by the capture path, not by this job |
| The geocode provider is down at the moment of a re-resolve | The capture degrades exactly as it would on a first-ever capture — the eviction does not create a new failure mode |
| The scheduler's clock is behind the database clock | The age comparison is evaluated server-side by Postgres `now()`, so the TTL is always the database's |
| The `geocode_cache` table is empty because the capture feature is disabled | The run succeeds with `items_processed = 0`; the job does not create the table or fail when it is absent from a fresh environment |
| A row's `key` encodes the user's raw coordinates | The key is never written to a log line and never returned in the response payload — only the counts are |
| The service-role key is missing from the function's environment | The function returns the standard error envelope with `code = 'INTERNAL'`, closes its single `job_runs` row as `failed`, and deletes nothing |

## Out of Scope

- The `geocode_cache` table definition, its key format, its `source` values, and the reverse-geocode resolution order — unit `004`; this story only **evicts**
- The `area_lookup` table and the curated station / hotline dataset — unit `004` / unit `003`
- Writing, warming, or invalidating a cache row, and populating `last_hit_at` — unit `004`
- The media purge and the 90-day Storage deletion — `001-media-purge-job`
- The account PII purge and the 30-day recovery window — `002-deleted-account-pii-purge` and unit `002`
- Geocoding-provider configuration, provider selection, and the `GEOCODE_BASE_URL` allowlist — the Edge Function layer
- A per-user or per-category cache TTL, a cache-size-based eviction policy, and an LRU eviction strategy
- Any admin surface for `job_runs` — the console is moderation-only (ADR-010)

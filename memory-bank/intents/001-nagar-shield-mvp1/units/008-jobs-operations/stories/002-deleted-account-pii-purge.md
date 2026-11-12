---
id: 002-deleted-account-pii-purge
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 002-deleted-account-pii-purge

## User Story

**As a** Nagar Shield user who has deleted their account
**I want** my personal details truly erased once the recovery window has closed, and not a moment before
**So that** my PII is gone for good while a mistaken deletion can still be undone inside the 30 days the product promised me

## Acceptance Criteria

- [ ] **Given** an account whose `profiles.deleted_at` is **29 days** old, **When** `purgeDeletedAccounts()` runs, **Then** the account is **not** selected, **nothing** about it is modified, and it remains fully recoverable through the app's restore path — the purge never runs before the window closes
- [ ] **Given** an account whose `profiles.deleted_at` is **31 days** old, **When** `purgeDeletedAccounts()` runs, **Then** the account **is** selected and its PII is scrubbed: the phone, the email, the Auth identity, the emergency contacts, and the location-share audit rows are removed, and `profiles.pii_purged_at` is set to the run timestamp (FR-DATA-6)
- [ ] **Given** the purge's selection query, **When** it is inspected, **Then** the predicate is exactly `profiles.deleted_at < now() - interval '30 days' AND profiles.pii_purged_at IS NULL` — the comparison is evaluated **server-side** by Postgres `now()`, so scheduler clock skew can never shorten the window
- [ ] **Given** the purge has already scrubbed an account, **When** `purgeDeletedAccounts()` is invoked again, **Then** the account is **not** re-selected (its `pii_purged_at` is set), the second scrub is skipped, and the job is **idempotent** — no second PII write and no second `pii_purged_at` stamp
- [ ] **Given** an account whose `deleted_at` is inside the window but whose `pii_purged_at` is already set, **When** the purge runs, **Then** the account is skipped entirely — the two timestamps are deliberately independent so the "recoverable until" state and the "PII is gone" state are each separately observable
- [ ] **Given** an account that authored reports, **When** its PII is purged, **Then** **the report rows survive** with their `category`, `description`, `area_hierarchy`, `lat` / `lng`, `captured_at`, and `moderation_status` intact — the purge **never** deletes report metadata, and `reports.author_id` still resolves to the surviving non-PII tombstone row
- [ ] **Given** the `profiles` row after the scrub, **When** it is inspected, **Then** the row **still exists** as a non-PII tombstone: `phone` and `email` are replaced with non-reversible, non-identifying placeholders (never the original values, never a reversible hash of them), and no other column carries a live identifier — the FKs and the moderation trail keep holding
- [ ] **Given** the Auth identity of a purged account, **When** the purge completes, **Then** the `auth.users` row is **deleted** — the identity that was deliberately preserved through the soft-delete window is destroyed once the window closes
- [ ] **Given** any invocation of `purgeDeletedAccounts()`, **When** it completes, **Then** **exactly one** `job_runs` row exists for the invocation — opened as `status = 'running'` with `job_name = 'purge_deleted_accounts'` and closed as `succeeded` (or `failed`) with `finished_at`, `items_processed`, `items_failed`, `window_days: 30`, and a non-null `error_detail` when it failed
- [ ] **Given** a purge invocation that fails part-way, **When** the run is audited, **Then** the single `job_runs` row reads `status = 'failed'` with a non-null `error_detail` — **not** zero rows and **not** two — and the accounts that were not completed keep `pii_purged_at IS NULL` so the next run resumes them
- [ ] **Given** an account is scrubbed, **When** the function's logs are inspected, **Then** they are **structured JSON** (request id, job name, counts) and contain **no** purged phone number, email, user id, or token in the clear — the account is identified only by a non-reversible hash
- [ ] **Given** the scrubbed account's emergency contacts and location-share rows, **When** the tables are inspected, **Then** they are **removed** (the contacts are the user's PII; the location-share rows carry the account's shared coordinates) while the `reports` rows and the `moderation_actions` audit trail survive
- [ ] **Given** the response envelope of a successful run, **When** it is inspected, **Then** it is `{ "data": { "job_name": "purge_deleted_accounts", "items_processed": n, "items_failed": m, "window_days": 30 } }`, and a failure is `{ "error": { "code": "INTERNAL", "message": "…", "details": { "error_detail": "…" } } }`

## Technical Notes

- **The function lives at `supabase/functions/purge-deleted-accounts/` and is invoked at `POST /functions/v1/purge-deleted-accounts`.** It is called by the Supabase Cron entry (or the documented external-scheduler fallback) with the service-role bearer. It is **not** a client-callable endpoint.
- **The selection predicate is the whole story.** The query is:

  ```sql
  SELECT id
  FROM profiles
  WHERE deleted_at < now() - interval '30 days'
    AND pii_purged_at IS NULL
  ORDER BY deleted_at ASC
  LIMIT $batch_size;
  ```

  `now()` is the **database** clock, evaluated inside Postgres. A scheduler whose clock is behind, or an operator invoking the function by hand with a forged timestamp, cannot shorten the window. The comparison is `>` / `<` on the server and is never computed in the function runtime.
- **The 30-day recovery window belongs to unit `002`; this story owns only the purge leg.** Unit `002` writes `profiles.deleted_at` at soft-delete time and offers the restore path inside the window. This job runs **after** that window closes. The two halves share `profiles.deleted_at` as the single contract — a purge that fires early is a defect, and it is verified jointly with unit `002`'s story `007-account-deletion-and-recovery`.
- **`deleted_at` and `pii_purged_at` are deliberately separate columns.** `deleted_at` starts the clock ("recoverable until"); `pii_purged_at` records the ending ("the PII is gone"). Because they are separate, a re-run selects nothing and the "already scrubbed" state is observable without a second scrub.
- **The scrub is a tombstone, not a `DELETE` on `profiles`.** The `profiles` row survives so that `reports.author_id` (FR-DATA-3 — server-side identity retained for moderation and dispute handling), `reports.author_id`'s FK, and the `moderation_actions` trail (whose FKs are `ON DELETE SET NULL`) all keep holding. What changes is:
  - `phone` → a non-reversible placeholder (e.g. `purged-<hash>`) that satisfies the `NOT NULL` + format CHECK without carrying a dialable number;
  - `email` → a non-reversible placeholder that satisfies the `NOT NULL` + format CHECK without carrying an address;
  - `auth.users` → the row is **deleted** via the Admin API (service role), destroying the credential and the email identity;
  - `emergency_contacts` → the user's rows are deleted (names and phone numbers are PII);
  - `location_shares` → the account's audit rows are deleted (they carry the user's shared coordinates);
  - `pii_purged_at` → set to `now()`.
  The placeholders are **not** a reversible hash of the original values: they are one-way, non-identifying, and carry no PII. The Jest "tombstone builder" test asserts the purged phone and email contain no digit sequence, no `@`, and no substring of the original value.
- **The purge never touches `reports`.** FR-DATA-3 retains identity server-side and FR-DATA-4 retains metadata longer than the media; the report rows an account authored survive the purge. The report **media** is a separate concern with its own 90-day clock (`001-media-purge-job`) and its own `report_media.purged_at` flag.
- **The shared job-runner is the only writer of `job_runs`.** `supabase/functions/_shared/job-runner.ts` exposes `recordJobRun({ job_name })` and `closeJobRun(id, { status, items_processed, items_failed, error_detail })`, so exactly one audit row per invocation is structural. A failure path still closes the row — it never leaves it dangling at `running`.
- **Batching.** Accounts are processed in batches (default 50) with the candidate query re-evaluated between batches, so a large backlog cannot exhaust the free tier's Edge Function execution window. An account that fails mid-scrub keeps `pii_purged_at IS NULL` and is retried on the next run; the scrub is written so that a retry is safe (each step is individually idempotent — deleting a missing row is a no-op).
- **Idempotency of the individual steps.** `auth.users` deletion is a no-op if the identity is already gone; the emergency-contact and location-share deletes are idempotent by row id; the placeholder write is idempotent by construction; `pii_purged_at` is written **last**, so a crash before it leaves the account re-selectable and the retry converges.
- **The service-role key is confined to the function and CI.** The scrub crosses the RLS boundary by design — it writes to rows no client may read and it calls the Auth Admin API. The key lives in the Edge Function environment and in GitHub Environment secrets only; it is never in the mobile bundle, never in the admin bundle, and never an EAS build env var.
- **Cron cadence.** The job is scheduled **daily**. A daily cadence is well inside the 30-day window, so a missed run costs at most a day of delay and never shortens the window.
- **Tests.** Jest covers the cut-off (a 29-day-old deletion is kept; a 30-day-old deletion is purged), the idempotency rule (a profile with `pii_purged_at` set is never re-selected), and the tombstone builder (the purged phone / email carry no PII). A Supabase-local integration test asserts: nothing is touched inside the window, the PII is scrubbed after it, the Auth identity and contacts and location-share rows are gone, and the report metadata authored by the account survives.
- **FR-DATA-3 and FR-DATA-6 pull in opposite directions, and this job is the resolution.** The identity is retained server-side while the account lives, and purged once the user has had their 30-day window to change their mind. Neither leg is dropped: the row survives as a tombstone, so moderation and dispute handling keep working on report metadata that outlives the account's PII.

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the typed Supabase client, the shared Zod contracts, and the CI workflow this job's tests run inside
- Unit `002-identity` — `profiles.deleted_at` (the soft-delete that starts the 30-day recovery window), the restore path that must keep working inside it, the `emergency_contacts` rows this job scrubs, and the Auth identity this job destroys
- Unit `004-capture` — the `reports` table whose rows this job must **not** delete, and the `report_media` rows whose `purged_at` column is the sibling job's concern
- Unit `005-location` — the `location_shares` audit rows this job removes with the account's PII
- Unit `007-moderation` — the `moderation_actions` audit trail, whose `ON DELETE SET NULL` FKs must keep working after the account row becomes a tombstone
- `bolt-008-jobs-operations-1` — `supabase/migrations/0007_jobs.sql`: the `job_runs` table, the `profiles.pii_purged_at` column, and the no-policy RLS posture on `job_runs`
- `bolt-008-jobs-operations-2` — the shared `job-runner` helper and the `purge-deleted-accounts` Edge Function shell
- `007-account-deletion-and-recovery` — the unit-`002` soft-delete + restore half of the same contract

### Enables
- `001-media-purge-job` — the sibling media purge; both share the `job-runner` contract, the `job_runs` audit trail, and the tombstone-vs-metadata resolution
- `005-ci-pipeline` — the CI job that runs this purge's unit and Supabase-local integration tests
- `006-release-runbook` — the monitor stage that confirms the last `purge_deleted_accounts` row is `succeeded` and that no account sits inside the window after the scrub
- `007-secrets-and-environments` — the rule that the service-role key needed by this job is confined to Edge Functions and CI

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The account was deleted 29 days and 23 hours ago | Not selected — the window has not closed; the account is untouched and still recoverable |
| The account was deleted exactly 30 days ago | Selected and purged — the predicate is `deleted_at < now() - interval '30 days'`, evaluated on the database clock |
| The scheduler's clock is 10 minutes behind the database clock | The window is the database's, not the caller's; the account at 29 days 23 hours is still not purged |
| The purge runs twice in the same minute | The second run selects nothing (`pii_purged_at` is set), reports `items_processed = 0`, and exits `0` — no second scrub |
| The function crashes after deleting the Auth identity but before writing `pii_purged_at` | The account stays re-selectable; the next run finds the identity already gone (a no-op), completes the remaining steps, and writes `pii_purged_at` — the retry converges |
| The function crashes after writing the placeholders but before deleting the contacts | The next run re-selects the account, finds the placeholder already in place, and completes the remaining steps; the report rows are still untouched |
| The account authored 50 reports | All 50 report rows survive with their metadata; `reports.author_id` still resolves to the tombstone row; no `moderation_actions` row is lost |
| The account's `phone` column has a `NOT NULL` + format CHECK | The placeholder satisfies both constraints — the row is never left in a state that fails validation or blocks the FK |
| The Auth identity was already removed by an operator | The Admin API delete is a no-op; the scrub completes and the account is marked `pii_purged_at` |
| A `location_shares` row belongs to another account | The delete is scoped to the purged account's own rows; no other user's audit rows are touched |
| The `profiles` table has a `profiles.role = 'moderator'` account that deleted itself | The same tombstone rules apply; the moderation audit trail survives through the `ON DELETE SET NULL` FK, and the moderator's own PII is still purged |
| The Auth Admin API is unreachable | The item is counted in `items_failed`, `error_detail` is recorded on the single `job_runs` row, and the account keeps `pii_purged_at IS NULL` for the next run — the purge is resumable |
| The service-role key is missing from the function's environment | The function returns the standard error envelope with `code = 'INTERNAL'`, closes its single `job_runs` row as `failed`, and scrubs nothing |
| The account was soft-deleted but never had any contacts or location shares | The scrub completes normally; the missing rows are a no-op and `items_processed` still counts the account |

## Out of Scope

- The soft-delete action, the 30-day recovery countdown, the restore path, and the in-app account UI — unit `002`; this story owns only the **purge leg**
- The `profiles` / Auth schema, the sign-up and login flows, and the remote account disable — unit `002`
- The media purge and the 90-day Storage deletion — `001-media-purge-job`
- The `reports` / `report_media` schema and the media pipeline — unit `004`
- The `location_shares` write path and the location-sharing screens — unit `005`
- The moderator console and the `moderation_actions` write path — unit `007`
- The public feed / history read models — unit `006`
- Anonymising or pseudonymising the **report** content itself, redacting report descriptions, and scrubbing free-text mentions of a person's name from a report body
- A user-facing "delete my data now" button that bypasses the 30-day window
- A general-purpose job queue, a task framework, a message broker, and a worker fleet
- Any admin surface for `job_runs` — the console is moderation-only (ADR-010)

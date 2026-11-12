---
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
phase: inception
status: complete
created: '2026-11-04T00:00:00Z'
updated: '2026-11-04T00:00:00Z'
---

# Unit Brief: Jobs & Operations

## Purpose

Own the three things that keep Nagar Shield **legal, affordable, and
shippable**: the **scheduled background work** that enforces the retention
policy, the **media-retention policy** itself, and the **delivery pipeline**
that turns this repository into a **sideloadable APK** and a **deployed admin
console**.

This is the `jobs` domain module plus the operations surface around it. It
writes **no** user-facing screen, and it is deliberately the smallest unit in
the decomposition (complexity **S**) — but three properties make it
load-bearing, and every decision in this brief follows from them:

1. **The 90-day media purge is the single most important free-tier control.**
   Supabase Free carries a **1 GB Storage** quota and the MVP targets ~50,000
   reports over 90 days (ARCHITECTURE §C, §K). Without the purge running from
   day one, the quota is exhausted inside the MVP window and the Capture path
   — the product's second-most-important surface — stops accepting media.
   The purge is therefore **not** a Phase-2 chore; it ships in Phase 1, it is
   scheduled, and it is audited.
2. **The purge deletes media, never metadata.** FR-DATA-4 hard-deletes the
   **Storage object** after 90 days and **keeps the report row**. The metadata
   — category, description, area hierarchy, timestamps — outlives the media,
   because the incident record is what the moderation trail and the dispute
   process need. The purge must be **idempotent**: re-running it deletes
   nothing further and exits `0`.
3. **The release progression is a ladder, and no rung may be skipped.**
   **Build → Dev → Verify → Staging → Verify → Prod → Verify → Monitor.**
   Every rung has a **verification command**, and the runbook records it. A
   release that cannot be reproduced from a clean checkout with the documented
   commands is not a release.

The unit also owns the **reliability** work that the free tier forces on us:
a **heartbeat** that stops the Supabase project pausing on inactivity, and a
CI pipeline that **fails the PR** on a type, lint, unit, or RLS failure rather
than letting a broken change reach staging.

---

## Scope

### In Scope

- `supabase/migrations/0007_jobs.sql` — the `job_runs` table (the audit row
  for every scheduled job), the `report_media.purged_at` column, the
  `reports.deleted_at` column, the `profiles.pii_purged_at` column, the
  supporting indexes, and the RLS posture (no client policy — service-role
  only)
- `purgeMedia()` Edge Function (`supabase/functions/purge-media/`) — finds
  `report_media` rows older than **90 days**, deletes the **Storage objects**,
  then marks the media row purged **while keeping the report metadata**
  (FR-DATA-4). **Idempotent** and safe to re-run
- `cleanupGeocodeCache()` Edge Function
  (`supabase/functions/cleanup-geocode-cache/`) — drops `geocode_cache` rows
  older than **90 days**
- `purgeDeletedAccounts()` Edge Function
  (`supabase/functions/purge-deleted-accounts/`) — hard-purges PII for
  accounts whose `profiles.deleted_at` is older than the **30-day** recovery
  window (FR-DATA-6 purge leg)
- `keepProjectAwake()` Edge Function
  (`supabase/functions/keep-project-awake/`) — the scheduled heartbeat that
  keeps the free Supabase project from pausing on inactivity
- The shared job-runner helper (`supabase/functions/_shared/job-runner.ts`) —
  the single place that opens a `job_runs` row, records the counts, and closes
  it, so **every** job writes exactly one audit row
- The scheduler wiring — Supabase Cron / `pg_cron` calling the Edge
  Functions, with the documented cadence for each job, plus the fallback of
  an external scheduler hitting the same function URLs
- `eas.json` — the `dev` / `preview` / `production` EAS Build profiles, the
  Android APK output type, the **cert-pinning** configuration for the release
  build (FR-DATA-2), and the env-var wiring per profile
- `.github/workflows/ci.yml` — **extending** the workflow that unit `001`
  starts: adds the **Supabase migration dry-run**, the **RLS integration
  tests**, the **secret-leak grep** over the build artifacts, and the
  **EAS build** job
- `.github/workflows/build.yml` — the nightly `main` EAS Android APK smoke
  build + Maestro subset
- `tools/` — the operational scripts: `purge-media-dry-run.ts` (a dry run that
  reports the worklist without deleting), `secret-scan.ts` (the artifact grep),
  and `release-verify.ts` (the per-stage verification harness)
- `docs/operations/runbook.md` — the release & verification runbook: build →
  dev → verify → staging → verify → prod → verify → monitor, with the
  **verification command** for every step, the rollback note, and the
  environment-progression table
- `docs/operations/secrets.md` — the secret + environment matrix across
  **local / EAS / Vercel / GitHub Environments**, including the rule that the
  **service-role key is confined to the Edge Functions and CI**
- The `EXPO_PUBLIC_SMS_OTP_ENABLED=false` assertion in every build profile and
  in the artifact scan (FR-DATA-5 / waiver W-2)

### Out of Scope

- The `reports` / `report_media` schema, the media pipeline, the storage-path
  policy, and the offline upload queue — unit `004`. This unit **reads** those
  tables and writes **only** `report_media.purged_at`
- The `geocode_cache` table, the `area_lookup` table, and the reverse-geocode
  resolution order — unit `004`. This unit only **evicts** cache rows
- `profiles`, the Auth wiring, the account **deletion** action, the 30-day
  **recovery** path, and the in-app account UI — unit `002`. This unit owns
  only the **purge leg** that runs after the recovery window closes
- The `flags` table, the feed and history read models, and the map surface —
  unit `006`. This unit's `reports.deleted_at` addition must be honoured by
  those read models, but the unit does not build them
- `moderation_actions`, the moderator queue, and the admin console screens —
  unit `007`. The console is **deployed** by this unit; it is **not built**
  here
- Any **admin surface** for `job_runs`. The console is **moderation-only**
  (unit `007`, ADR-010); job runs are read from the Supabase dashboard and
  the SQL editor, not from a product screen
- Google Play Store **listing, signing, and review** — Phase 1 ships a
  **sideloaded APK** only
- Any **paid** infrastructure, a paid SMS provider, a paid APM (Sentry), or
  any third-party **analytics or ad SDK** (FR-DATA-5). The monitoring this
  unit builds is free-tier native
- iOS builds, AAB output for store upload, Play **device testing** tracks,
  and release signing keys
- A general-purpose **job queue**, a task framework, a message broker, and a
  worker fleet. The MVP needs four functions and a cron entry — nothing more
- The **quarterly curated dataset refresh** (stations / hotlines) and the
  **Curator** workflow — a different internal cadence with no Phase-1 unit

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-DATA-1 | Encryption at rest — media is encrypted at rest on the device (OS keystore) and on the server (platform-managed KMS); the Storage bucket is **private** | Must |
| FR-DATA-2 | TLS 1.3 with **cert pinning** on the API host in **release** builds — a release build pins the API host certificate | Must |
| FR-DATA-4 | **90-day media deletion** — a scheduled job hard-deletes the Storage objects older than 90 days **while keeping the report row**; metadata is retained longer | Must |
| FR-DATA-5 | **No data sale** — no third-party analytics or ad SDK is integrated anywhere in the pipeline | Must |
| FR-DATA-6 | Account deletion — the **purge leg** only: deletion soft-deletes immediately and the account is recoverable for 30 days; **PII is purged after that** | Must |
| NFR-Availability | Free-tier best-effort availability — a **heartbeat** keeps the project from pausing on inactivity | Must |
| NFR-Reliability | The media purge is **idempotent and resumable**; every job run writes exactly one audited `job_runs` row | Must |
| NFR-Cost | **$0 required infrastructure**; SMS is the only optional paid line item and is feature-flagged **off** | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `job_runs` | The **audit row for every scheduled job**. Exactly one row per invocation: opened as `running`, closed as `succeeded` or `failed` with the counts. The only table this unit owns outright | `id` uuid PK default `gen_random_uuid()`, `job_name` text not null CHECK in (`'purge_media'`, `'cleanup_geocode_cache'`, `'purge_deleted_accounts'`, `'keep_project_awake'`), `started_at` timestamptz not null default now(), `finished_at` timestamptz nullable, `status` text not null default `'running'` CHECK in (`'running'`, `'succeeded'`, `'failed'`), `items_processed` integer not null default 0, `items_failed` integer not null default 0, `error_detail` text **nullable**, `created_at` timestamptz not null default now() |
| `report_media` | The media object attached to a report. **Owned by unit `004`** — read-only here except for the single `purged_at` write this unit performs | `id` uuid PK, `report_id` uuid not null FK → `reports.id`, `storage_path` text not null, `media_type` text not null, `byte_size` integer not null, `duration_seconds` numeric nullable, `width` / `height` integer nullable, `created_at` timestamptz not null default now(), **`purged_at` timestamptz nullable** — set by `purgeMedia()` after the Storage object is deleted |
| `reports` | The incident record whose **metadata outlives the media**. **Owned by unit `004`** — read-only here | `id` uuid PK, `author_id` uuid not null FK → `profiles.id`, `category` text nullable, `description` text nullable, `lat` / `lng` double precision not null, `area_hierarchy` jsonb not null, `captured_at` timestamptz not null, `moderation_status` text not null, `created_at` timestamptz, **`deleted_at` timestamptz nullable** — the **soft-delete** column this unit's purge reads |
| `profiles` | The identity and account-state record. **Owned by unit `002`** — read-only here except for the PII scrub | `id` uuid PK → `auth.users.id`, `phone` text, `email` text, `role` text, `disabled_at` timestamptz nullable, **`deleted_at` timestamptz nullable** — the **soft-delete** column that starts the 30-day recovery window, **`pii_purged_at` timestamptz nullable** — set by `purgeDeletedAccounts()` when the PII is scrubbed |
| `geocode_cache` | The reverse-geocode cache. **Owned by unit `004`** — this unit only **evicts** rows from it | `key` text PK, `area_hierarchy` jsonb not null, `source` text not null, `created_at` timestamptz not null default now(), `last_hit_at` timestamptz nullable |
| Storage objects | The **private** bucket holding the report media. The thing FR-DATA-4 hard-deletes and the thing FR-DATA-1 requires to stay encrypted and unreachable without a signed URL | bucket `report-media`, private, ≤ **1 GB** free tier; objects are addressed by `report_media.storage_path` |

Notes on the schema:

- **The purge worklist is derived from `report_media.created_at` — there is no
  queue table.** The candidates for deletion are simply
  `SELECT * FROM report_media WHERE purged_at IS NULL AND created_at < now() - interval '90 days'`.
  A separate worklist or queue table would duplicate the age signal, add a
  second source of truth for "what is expired", and need its own retry and
  cleanup story. `created_at` is already the upload timestamp, it is already
  indexed, and the derivation is a single indexed range scan. **This unit
  creates no queue table and no worklist table.**
- **`purged_at` is what makes the purge idempotent.** The Storage object is
  deleted first, then `report_media.purged_at` is set. The candidate query
  filters on `purged_at IS NULL`, so a second run selects **nothing** and
  exits `0` without touching Storage. A crash between the object delete and
  the flag write leaves one row to re-process on the next run — the Storage
  delete is itself idempotent (deleting a missing object is a no-op), so the
  retry converges.
- **`reports.deleted_at` is the soft-delete column, and it makes a deleted
  report's media eligible immediately.** When an author withdraws their own
  report, the media is content the user has already asked us to remove — it
  does not sit for another 90 days. The **report row is still retained** as
  the metadata record (FR-DATA-4); `deleted_at` marks it as withdrawn so it
  never reappears in a public read model. This is the one column this unit
  adds to a unit-`004`-owned table, and it is recorded here deliberately.
- **`profiles.deleted_at` starts the clock; `profiles.pii_purged_at` records
  the ending.** The two are deliberately separate so that the "recoverable
  until" state and the "PII is gone" state are both observable, and so a
  re-run of the account purge is a no-op rather than a second scrub.
- **`job_runs` has no client policy.** RLS is enabled and **zero** policies
  are created, so no anon or authenticated client can read or write it — the
  service role (Edge Functions + CI) bypasses RLS, and nothing else does.
  There is no admin surface for job runs in Phase 1.
- **A `running` row is a signal, not a bug.** A job that dies mid-flight
  leaves its row at `status = 'running'` with a `finished_at` of null. The
  monitor step of the runbook reads for stale `running` rows; it does not
  "fix" them by deleting them.

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `purgeMedia()` | **Edge Function — the 90-day media purge (FR-DATA-4).** Derives the worklist from `report_media.created_at`; for each candidate: delete the **Storage object**, then set `report_media.purged_at = now()`. The **report row is never touched** — the metadata outlives the media. Also sweeps media belonging to reports whose `reports.deleted_at` is set. **Idempotent** — a re-run deletes nothing further and exits `0` | `POST /functions/v1/purge-media` (service-role or cron invocation); optional `{"dry_run": true}` | `{ "data": { "job_name": "purge_media", "items_processed": n, "items_failed": m, "bytes_reclaimed": b, "dry_run": false } }`; on failure `{ "error": { "code": "INTERNAL", "message": "…", "details": { "error_detail": "…" } } }` |
| `cleanupGeocodeCache()` | **Edge Function — the geocode-cache eviction.** Drops `geocode_cache` rows whose `created_at` is older than **90 days**. The cache is a cache: evicting a row is always safe and only costs one re-resolve | `POST /functions/v1/cleanup-geocode-cache` | `{ "data": { "job_name": "cleanup_geocode_cache", "items_processed": n, "items_failed": m } }` |
| `purgeDeletedAccounts()` | **Edge Function — the FR-DATA-6 purge leg.** Selects accounts with `profiles.deleted_at < now() - interval '30 days'` **and** `pii_purged_at IS NULL`; scrubs the PII (phone, email, the Auth identity, the emergency contacts, the location-share audit rows) and marks `pii_purged_at`. It **never** purges before day 30, and it **never** deletes the report metadata an account authored | `POST /functions/v1/purge-deleted-accounts` | `{ "data": { "job_name": "purge_deleted_accounts", "items_processed": n, "items_failed": m, "window_days": 30 } }` |
| `keepProjectAwake()` | **Edge Function — the free-tier heartbeat (NFR-Availability).** A trivial, cheap invocation that touches the project (a `select 1` plus a no-op read) on a cadence well inside the free tier's inactivity-pause window. It is a **reliability** control, not an optimisation | `POST /functions/v1/keep-project-awake` (cron) | `{ "data": { "job_name": "keep_project_awake", "items_processed": 0, "items_failed": 0 } }` |
| `recordJobRun()` | **Shared helper — the single writer of `job_runs`.** Opens a row with `status = 'running'` at the start of a job, and closes it with `status`, `items_processed`, `items_failed`, `finished_at`, and `error_detail` at the end. Every job goes through it, so **exactly one row per invocation** is a structural property rather than a convention | `{ job_name, started_at }` → a run id | a `job_runs` row id, and a `closeJobRun(id, { status, items_processed, items_failed, error_detail })` update |
| `eas build -p android --profile preview` | The **staging** APK build — an Android **APK** (not an AAB) against the staging env vars | the `preview` profile in `eas.json` | an `.apk` artifact, sideloaded with `adb install` |
| `eas build -p android --profile production` | The **production** APK build — the same Android APK, with the **cert-pinning** configuration and the production env vars | the `production` profile in `eas.json` | a production `.apk` artifact for sideload |
| `supabase db push` | The **forward-only** migration deploy to a linked project (staging or production), applied after review | the linked project ref + the migrations in `supabase/migrations/` | the applied migration set |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 7 |
| Must Have | 7 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|--------|--------|
| US-OPS-01 | Media purge job — 90-day hard delete of the Storage objects, **idempotent**, report metadata retained | Must | Planned |
| US-OPS-02 | Deleted-account PII purge — the 30-day recovery window is respected and never shortened | Must | Planned |
| US-OPS-03 | Geocode cache cleanup — the 90-day cache eviction | Must | Planned |
| US-OPS-04 | EAS build profiles (dev / preview / production) producing a sideloadable APK | Must | Planned |
| US-OPS-05 | CI pipeline — lint + typecheck + unit + shared + Supabase migration dry-run + RLS integration tests | Must | Planned |
| US-OPS-06 | Release & verification runbook — build → dev → verify → staging → verify → prod → verify → monitor | Must | Planned |
| US-OPS-07 | Secret + environment management across local / EAS / Vercel / GitHub Environments | Must | Planned |

> US-OPS-01 carries FR-DATA-4 and the media half of FR-DATA-1. US-OPS-02
> carries the FR-DATA-6 purge leg. US-OPS-04 and US-OPS-05 carry the release
> pipeline and the FR-DATA-2 pinning check (the pinning config ships in the
> release profile and is verified over the built artifact). US-OPS-06 is the
> runbook that makes US-OPS-04 and US-OPS-05 **usable by a human**. US-OPS-07
> is the gate that keeps the service-role key out of every client bundle
> (FR-DATA-5's no-third-party-SDK rule is enforced by the same artifact scan).

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | The pnpm workspace, the **CI workflow** this unit extends (lint + typecheck + unit), the `eas.json` skeleton this unit fills in with real project IDs and profiles, the typed Supabase client, and the shared Zod contracts the job payloads validate against |
| `002-identity` | `profiles.deleted_at` (the soft-delete that starts the 30-day recovery window), the `emergency_contacts` rows the account purge scrubs, and the Auth identity the purge removes |
| `003-help-seek` | The full schema the migration dry-run replays, and the curated dataset seed the release path depends on |
| `004-capture` | The `reports` / `report_media` tables, the `storage_path` contract and the **private** bucket the purge deletes from, and the `geocode_cache` table the cleanup evicts |
| `005-location` | The `location_shares` audit rows the account purge removes with the account's PII |
| `006-alerts` | The public read models that must exclude a row whose `reports.deleted_at` is set, and the map wrapper whose tile-cache policy the release verification checks |
| `007-moderation` | The `moderation_actions` audit trail, which must **survive** both purges (its FKs are `ON DELETE SET NULL`), and the admin app this unit deploys |

### Depended By

None — this unit is a leaf. It has no downstream consumer; every other unit
is upstream of it.

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Supabase Cron / `pg_cron` | The scheduler that invokes the job Edge Functions on a fixed cadence | Medium — the free tier's cron quotas and the pause window are both real limits; the fallback is an external scheduler calling the same URLs, and the heartbeat covers the project side |
| Supabase Storage | The private bucket whose objects the purge deletes | Medium — **1 GB free tier**; the 90-day purge is what keeps it inside quota, and a missed purge is a quota breach, not a backlog |
| Supabase Edge Functions (Deno) | The runtime for all four jobs | Medium — cold starts on the free tier; the jobs are batch-style and off the panic path, so a cold start is a latency, never a correctness problem |
| GitHub Actions | The CI pipeline and the nightly build | Low — keep it lean; the RLS integration job needs Docker for `supabase start` |
| EAS Build | The Android APK builds (dev / preview / production) | Medium — **free-tier monthly build quota and queue times**; a release must be scheduled around the quota, not discovered against it |
| Vercel Hobby | The admin console deployment (staging preview + production) | Low — an internal, low-traffic tool |
| `adb` (Android platform tools) | Sideloading the APK onto an emulator or a real device | Low — the sideload path is the **only** distribution path in Phase 1 |
| OSM public tile servers | The map tiles the release verification exercises | Medium — the **tile usage policy** must be respected: cache aggressively, never hammer the public servers, self-host later if needed |
| npm registry | Deno / TypeScript tooling for the Edge Functions and the `tools/` scripts | Low |

---

## Technical Context

### Suggested Technology

Supabase Edge Functions on the **Deno** runtime (TypeScript, strict) for the
four jobs and the shared `job-runner` helper, `@supabase/supabase-js` (typed,
from unit `001`) with the **service-role** client inside the functions only,
Supabase Cron (`pg_cron`) for the schedule, the Supabase Storage SDK for the
object deletes, `zod` from `packages/shared` for the job payload validation,
**Jest** for the pure job helpers (the age cut-offs, the idempotency rules,
the tombstone builder), **Supabase local** (`supabase start` in Docker) plus
SQL / Node scripts for the **RLS integration tests** and the **migration
dry-run**, **GitHub Actions** for CI and the nightly build, **EAS Build** for
the Android APKs, **Vercel** for the admin console, and `adb` for the sideload
verification.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Supabase Cron → Edge Function (job) | HTTPS | `POST /functions/v1/<job>` on the project's cron schedule, with the service-role bearer; the same URL is callable by an external scheduler as the fallback |
| Job → Supabase Storage | API | Object delete by `report_media.storage_path` — the **only** Storage write path this unit has; the bucket is private and never made public |
| Job → Supabase Postgres (service role) | SQL | The candidate queries and the `job_runs` insert / update; the service role bypasses RLS, and no client ever holds that key |
| GitHub Actions → Supabase local (Docker) | Local | `supabase start` → migration dry-run → RLS integration tests; the job runs against a **local** project, never against staging or production |
| GitHub Actions → EAS Build | HTTPS | The `eas build` job on the nightly `main` run, using the EAS token stored in the GitHub **Environment** secrets |
| GitHub Actions → build artifacts | Local | The **secret-leak grep** over the built mobile bundle, the admin bundle, and the Vercel build output — zero matches for the service-role key |
| EAS Build → Supabase (env vars) | Build-time | `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` injected per profile; the **service-role key is never an EAS build env var** |
| Vercel → Supabase (env vars) | Build-time | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` only; `SUPABASE_SERVICE_ROLE_KEY` is **absent** from the admin's configuration entirely |
| Release → device | Local | `adb install <app-release.apk>` — the sideload path for both the staging and the production APK |
| MapLibre → OSM tile servers | External HTTPS | Tile fetch with an **aggressive cache policy**; the release verification confirms the cache is on and that no request loop is hammering the public servers |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `job_runs` rows | Postgres table | **Low volume** — a handful per day across four jobs | Append-only; kept as the operational audit trail; never surfaced in the product |
| Storage objects (report media) | Supabase Storage (private bucket) | **≤ 1 GB free tier** — this is exactly why the purge is mandatory from day one | **Hard-deleted at 90 days** by `purgeMedia()`; the `report_media` row is marked `purged_at` and the report metadata is retained |
| `report_media` rows | Postgres table | ~50k rows over 90 days | The row survives the object; only `purged_at` is written |
| `reports` rows | Postgres table | ~50k rows over 90 days | Metadata **retained longer than the media** (FR-DATA-4); `deleted_at` marks a withdrawn report |
| `geocode_cache` rows | Postgres table | Low — one row per resolved coordinate key | 90-day TTL, evicted by `cleanupGeocodeCache()`; a miss only costs one re-resolve |
| `profiles` PII | Postgres + Auth | ~1,000 rows | Scrubbed **30 days** after `deleted_at`; the row survives as a non-PII tombstone so the FKs and the audit trail hold |

### Deployment Targets

| Environment | Mobile | Backend | Admin | Notes |
|-------------|--------|---------|-------|-------|
| **Local** | Expo dev client on an emulator | `supabase start` (Docker) | `next dev` on `:3000` | The migration dry-run and the RLS integration tests run here, in CI and locally |
| **Staging** | **Internal APK** (`eas build -p android --profile preview`) → `adb install` | Shared Supabase **free** project | Vercel **preview** deployment | Staging may collapse into a single non-prod project under free-tier limits — the compromise is documented in the runbook |
| **Production** | **EAS production APK**, **sideloaded** | Supabase project | Vercel **production** deployment | **No Play Store listing, no store signing, no store review** in Phase 1 |

- **No paid infrastructure.** Supabase Free + Vercel Hobby + EAS Build free
  tier + GitHub Actions = **$0**. SMS is the **only** optional paid line
  item and is **flagged off** (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`).
- **Distribution is a sideloaded APK**, installed on an emulator or a real
  device via `adb install` or a device file share.

### Release Progression

No stage may be skipped, and each **Verify** is a command, not an opinion.

| # | Stage | Action | Verification command / gate |
|---|-------|--------|----------------------------|
| 1 | **Build** | `eas build -p android --profile preview` (+ `supabase db push` to staging, Vercel preview deploy) | `pnpm typecheck && pnpm lint && pnpm test` green; `supabase db push` applied with no drift |
| 2 | **Dev** | Install the dev-client build against the local / staging stack; exercise the panic path, Capture, Alerts, and the moderator console | `adb install -r app-debug.apk`; the Maestro panic-path flow passes; the local `supabase start` stack is healthy |
| 3 | **Verify** | Assert the staging build's behaviour, the artifact secrets, and the migration state | `pnpm release:verify --env staging` — the artifact grep returns **zero** service-role matches; the migration state matches the repo |
| 4 | **Staging** | Deploy the DB migrations and the admin console to staging; install the internal APK on a device | `supabase db push --linked staging`; the Vercel preview console loads and the queue renders |
| 5 | **Verify** | Exercise the staging end-to-end and **run the purge against staging** | `pnpm release:verify --env staging`; the purge dry-run reports the expected worklist and the job writes one `job_runs` row |
| 6 | **Prod** | `eas build -p android --profile production`; `supabase db push --linked production`; Vercel production deploy | The production build embeds the **cert-pinning** config and the production env vars; the artifact grep is still clean |
| 7 | **Verify** | Sideload the production APK, walk the panic path, and confirm the pinning is active | `adb install app-release.apk`; the release build rejects an unpinned host; the panic path opens the dialer |
| 8 | **Monitor** | Watch the free-tier gauges and the job audit trail | Storage bytes vs the 1 GB cap; the last `job_runs` row per job is `succeeded`; no stale `running` row; the project is not paused |

---

## Constraints

- **The purge must be idempotent.** Re-running `purgeMedia()` deletes nothing
  further and exits `0`. The Storage delete is idempotent (deleting a missing
  object is a no-op) and the `purged_at` flag makes the candidate query
  select nothing on the second pass. The purge is also **resumable**: a crash
  mid-batch leaves the remaining candidates for the next run.
- **The purge must not delete report metadata — only media.** The **Storage
  object** is deleted; the `reports` row, the `report_media` row, the
  category, the description, the area hierarchy, and the timestamps all
  survive. The metadata retention **outlives** the media (FR-DATA-4).
- **The account purge must respect the 30-day recovery window and must not
  purge earlier.** The selection predicate is
  `deleted_at < now() - interval '30 days' AND pii_purged_at IS NULL`. An
  account inside the window is **never** touched — the user can still restore
  it (unit `002`).
- **The account purge must not delete the report metadata an account
  authored.** FR-DATA-3 requires server-side identity for moderation and
  dispute handling, and FR-DATA-4 retains metadata longer than the media; the
  account row survives as a non-PII tombstone so the FKs hold.
- **The service-role key is used only by these job functions and CI.** It is
  never in the mobile bundle, never in the admin bundle, never in the Vercel
  build output, and never an EAS build env var. The **grep over the build
  artifacts** is the mechanical proof, and it is a CI gate.
- **Every job writes a `job_runs` audit row** — exactly one per invocation,
  with the status and the counts. No job runs without one, and no job writes
  two.
- **The CI pipeline must fail the PR** on a type, lint, unit, **or** RLS
  failure. A red PR is a stopped release, not a warning.
- **The free-tier limits are real operational constraints**, not background
  colour: **1 GB Storage**, **500 MB database**, and a **project pause on
  inactivity**. The purge addresses the first, the media caps (unit `004`)
  address the second, and the heartbeat addresses the third.
- **The APK is sideloaded.** There is **no Play Store signing, listing, or
  review dependency**, and no release step may block on one. The
  certificate-pinning config (FR-DATA-2) ships in the release profile, and
  the **dev** profile deliberately does not pin.
- **The release progression is Build → Dev → Verify → Staging → Verify →
  Prod → Verify → Monitor**, and **no stage may be skipped**. Each Verify is
  a documented command.
- **EAS free-tier build quota and queue time must be accounted for.** The
  runbook schedules the production build against the remaining quota and
  states the expected queue time; a build that is queued for hours is a
  release-plan fact, not a surprise.
- **No third-party analytics or ad SDK** may be added to the mobile bundle,
  the admin bundle, or the release pipeline (FR-DATA-5). Monitoring is
  free-tier native: the Supabase dashboard, `job_runs`, and the `tools/`
  scripts.
- **No Play Store, no iOS build, no AAB**, and no second hosting target.
- **The migration dry-run must run against Supabase local, never against
  staging or production.** Migrations are forward-only.
- **Structured JSON logs only** in the job functions (request id, job name,
  counts). **Never** log raw GPS coordinates, media payloads, passwords, or
  tokens — and never log a purged phone number or email in the clear.
- **`pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass** across the
  workspace, plus the migration dry-run and the RLS integration tests.

---

## Success Criteria

### Functional

- [ ] The media purge **deletes the Storage objects older than 90 days** and
      **keeps the report rows** — after the purge, the objects are gone from
      the bucket and the `reports` / `report_media` rows still exist with
      their category, description, and area hierarchy (FR-DATA-4)
- [ ] **Re-running the purge deletes nothing further and exits `0`** — the
      second run reports `items_processed = 0`, the byte count reclaimed is
      unchanged, and no Storage object is touched
- [ ] The account purge **deletes nothing before day 30** and **purges the
      PII after** — an account deleted 29 days ago is untouched; an account
      deleted 31 days ago has its phone, email, Auth identity, emergency
      contacts, and location-share rows removed and `pii_purged_at` set
      (FR-DATA-6)
- [ ] The account purge **never** deletes the report metadata an account
      authored — the report rows survive with their category, description, and
      area hierarchy
- [ ] **Every job run writes exactly one `job_runs` row** with its status
      and counts — asserted by running all four jobs and counting the rows
- [ ] A job that fails writes **one** row with `status = 'failed'` and a
      non-null `error_detail` — not zero rows and not two
- [ ] `cleanupGeocodeCache()` removes only the `geocode_cache` rows older than
      90 days and leaves the newer ones alone
- [ ] `eas build --profile preview` produces an **APK that installs on an
      emulator via `adb install`** — the install succeeds and the app launches
- [ ] The **production** profile produces an APK that embeds the
      **cert-pinning** configuration for the API host, and the **dev** profile
      does not (FR-DATA-2)
- [ ] **CI fails the PR** when a type error, a lint error, a unit test
      failure, or an RLS test failure is introduced — each of the four is
      demonstrated by a deliberately broken commit that turns the PR red
- [ ] The CI **migration dry-run** replays every migration in
      `supabase/migrations/` against Supabase local with no error and no drift
- [ ] The **service-role key is absent from the mobile bundle, the admin
      bundle, and the Vercel build output** — verified by a **grep over the
      build artifacts**, which returns **zero** matches for
      `SUPABASE_SERVICE_ROLE_KEY` and for the service-role JWT prefix
- [ ] The **runbook documents every environment-progression step with its
      verification command** — each of the eight stages in the release
      progression table has a runnable command
- [ ] A **production release can be reproduced from a clean checkout** with
      the documented commands — a clone → install → migrate → build → deploy
      sequence, following only the runbook, reaches the same production
      state
- [ ] The **heartbeat prevents the inactivity pause** — over a full pause
      window the project stays awake, and the heartbeat job writes its own
      `job_runs` row

### Non-Functional

- [ ] **Infrastructure spend is $0** — no paid tier is enabled on Supabase,
      Vercel, EAS, or GitHub Actions, and no SMS provider is configured
      (`EXPO_PUBLIC_SMS_OTP_ENABLED=false` in every build profile)
- [ ] The media purge keeps **Storage usage inside the 1 GB free tier** at
      the projected MVP volume — the byte count reclaimed is reported per run
      and the Storage gauge is checked in the monitor stage
- [ ] The project **does not pause** on inactivity for the duration of the
      heartbeat window (NFR-Availability)
- [ ] Every job function emits **structured JSON logs** (request id, job
      name, counts) and **zero** raw GPS coordinates, media payloads,
      passwords, or tokens
- [ ] The purge of a worklist of **N** objects completes within the free
      tier's Edge Function execution window, with the work processed in
      **batches** so a large worklist cannot time out
- [ ] The tile **cache policy** is active in the shipped build — the release
      verification confirms the map requests are cached and that no request
      loop hammers the public OSM tile servers
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass across the
      workspace, plus the migration dry-run and the RLS integration tests

### Quality

- [ ] Jest unit tests cover the **age cut-offs** (89 days kept / 90 days
      purged, 29 days kept / 30 days purged), the **idempotency rule** (a
      candidate with `purged_at` set is never re-selected), and the
      **tombstone builder** (the purged phone / email carry no PII)
- [ ] Supabase-local integration tests cover the purge against a seeded
      Storage bucket: the object is deleted, the report row survives, the
      media row is marked `purged_at`, and the second run is a no-op
- [ ] Supabase-local integration tests cover the account purge: nothing is
      touched inside the 30-day window, the PII is scrubbed after it, and the
      report metadata authored by the account survives
- [ ] Supabase-local integration tests assert that an **anon or
      authenticated client cannot read or write `job_runs`** (the no-policy
      RLS posture)
- [ ] A **negative test** asserts that no client bundle contains the
      service-role key — the artifact grep is a test, not a manual step
- [ ] The runbook is reviewed against the **actual** command output of every
      step — no command in it is aspirational
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass, and the migration
      dry-run against Supabase local passes

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-008-jobs-operations-1 | ddd | US-OPS-01 | `0007_jobs.sql` — the `job_runs` table (the `job_name` CHECK, the 3-value `status` CHECK, the counts, the nullable `error_detail`), the `report_media.purged_at` and `reports.deleted_at` columns, the `profiles.pii_purged_at` column, the supporting indexes (the age range scan on `report_media (created_at)`), and the no-policy RLS posture on `job_runs` |
| bolt-008-jobs-operations-2 | ddd | US-OPS-01, US-OPS-02, US-OPS-03 | The four Edge Functions and the shared `job-runner` helper — `purge-media` (the 90-day Storage delete, the idempotent candidate query, the metadata-preserving write), `cleanup-geocode-cache`, `purge-deleted-accounts` (the 30-day window, the PII scrub, the report-metadata preservation), and `keep-project-awake` — plus the cron schedule wiring |
| bolt-008-jobs-operations-3 | simple | US-OPS-04, US-OPS-05 | `eas.json` (the dev / preview / production profiles, the APK output, the cert-pinning config, the per-profile env vars) and the CI extension — the Supabase migration dry-run, the RLS integration tests, the artifact secret grep, and the EAS build job |
| bolt-008-jobs-operations-4 | simple | US-OPS-06, US-OPS-07 | `docs/operations/runbook.md` (the eight-stage release progression with a verification command per stage, the rollback note, the free-tier quota accounting) and `docs/operations/secrets.md` (the local / EAS / Vercel / GitHub Environments matrix), plus the `tools/` scripts the runbook calls — `purge-media-dry-run.ts`, `secret-scan.ts`, `release-verify.ts` |

---

## Notes

- **The CI already starts in unit `001`** (lint + typecheck + unit). This
  unit **extends** that workflow rather than replacing it: it adds the
  **Supabase migration dry-run**, the **RLS integration tests**, the
  **artifact secret grep**, and the **EAS build** job. Unit `001` owns the
  `eas.json` **skeleton**; this unit owns the real profiles, the real
  project IDs, and the pinning configuration.
- **The heartbeat is a reliability requirement, not an optimisation.** A
  paused free-tier project presents to users as a **cold start** — the first
  request after the pause is slow, the app appears broken, and the panic path
  (which is *supposed* to be zero-network) is unaffected only because it never
  calls the server. The heartbeat is what keeps the *other* surfaces honest.
  It is scheduled well inside the pause window, and it is the cheapest
  reliability spend in the system.
- **The media purge is the single most important free-tier control.**
  Without it the **1 GB Storage** limit is reached within the MVP window
  (≈50,000 reports over 90 days), the Capture upload path starts failing,
  and there is no second copy of the media to fall back on. It ships in
  Phase 1, it is scheduled, it is idempotent, and it writes an audit row.
- **The purge worklist is derived, not stored.** Preferring
  `report_media.created_at` over a separate queue table keeps one source of
  truth for "what is expired", avoids a second table that needs its own retry
  and cleanup story, and turns the whole job into a single indexed range
  scan. **No queue table is created.**
- **`report_media.purged_at` and `reports.deleted_at` are the two columns
  this unit adds to tables owned elsewhere**, and both are recorded here
  deliberately. `purged_at` is what makes the purge idempotent; `deleted_at`
  makes a withdrawn report's media eligible immediately instead of leaving
  content the user already asked us to delete on disk for 90 more days. Both
  are **nullable with a null default**, so no existing row and no existing
  read model changes behaviour. Unit `006`'s public read models must exclude
  rows whose `deleted_at` is set — that is the one obligation this unit
  places on a downstream unit, and it is additive.
- **FR-DATA-3 and FR-DATA-6 pull in opposite directions, and the brief
  resolves it.** FR-DATA-3 retains the identity server-side for moderation
  and dispute handling; FR-DATA-6 purges the PII 30 days after the account is
  deleted. The resolution: the **account row survives as a non-PII
  tombstone** — the phone and email are replaced with non-reversible,
  non-identifying placeholders, the Auth identity and the emergency contacts
  and the location-share rows are removed, and `pii_purged_at` records that
  the scrub happened. The **reports the account authored are retained**,
  because FR-DATA-4 retains metadata longer than the media and the moderation
  trail (`moderation_actions`, with `ON DELETE SET NULL` FKs) must survive
  both purges.
- **The account purge never shortens the window.** The predicate is
  `deleted_at < now() - interval '30 days'`. The user can restore inside the
  window (unit `002`); the purge only runs after it closes. A clock skew
  between the scheduler and the database is absorbed by the database's own
  `now()` — the comparison is always evaluated server-side.
- **A paused project is also a paused scheduler.** If the project pauses, the
  cron stops and the purge stops — and a stopped purge is exactly the failure
  that exhausts the Storage quota. The heartbeat and the purge therefore
  protect each other, which is why both are scheduled rather than run by
  hand.
- **The service-role key is confined to the Edge Functions and CI.** The
  functions need it because the purge crosses the RLS boundary by design
  (deleting Storage objects and scrubbing PII on rows the caller cannot
  read). It is a **server-side** secret and never travels to a client. The
  **grep over the build artifacts** is the mechanical proof, and it is a CI
  gate — it is also the check that catches the single most damaging mistake
  this unit could make.
- **FR-DATA-2's pinning is a release-build concern.** The pinning config
  ships in the **production** EAS profile and is deliberately absent from
  **dev**, so a developer is never blocked by a rotated certificate. The
  release verification asserts that the pinning config is present in the
  production artifact and that the release build rejects an unpinned host.
- **The `job_runs` table is not a product surface.** There is no admin view
  for it in Phase 1: the console is **moderation-only** (unit `007`,
  ADR-010), and a job-health dashboard would be a new surface with no
  requirement behind it. The runbook reads it from the SQL editor and the
  Supabase dashboard instead.
- **The monitor stage is part of the release, not an afterthought.** The
  eight stages end at **Monitor** precisely because a free-tier deployment
  fails quietly — a paused project, a full bucket, and a stuck `running` job
  all present as "nothing happens", not as an error.
- **The free-tier build quota is a release-planning input.** EAS free-tier
  builds are metered and queued. The runbook states the remaining quota, the
  expected queue time, and the order in which the profiles are built, so a
  release is scheduled against the quota instead of discovering it.
- **Cross-unit boundaries at a glance.** Unit `002` owns `profiles` and the
  account **deletion + recovery** path. Unit `004` owns `reports`,
  `report_media`, the Storage bucket, and `geocode_cache`. Unit `006` owns
  the feed and history read models. Unit `007` owns `moderation_actions` and
  the admin console. **This unit owns** `job_runs`, the four job Edge
  Functions, the cron schedule, `eas.json`, the CI extension, the `tools/`
  scripts, and the runbook + secrets documentation.

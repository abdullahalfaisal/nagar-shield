---
id: 006-release-runbook
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 006-release-runbook

## User Story

**As a** Nagar Shield maintainer cutting a release
**I want** one document that walks the release through every stage with the exact command that proves each stage
**So that** a release is reproducible from a clean checkout, no stage is ever skipped, and "it worked on my machine" can never be the evidence

## Acceptance Criteria

- [ ] **Given** `docs/operations/runbook.md`, **When** it is inspected, **Then** it documents the **eight-stage release progression** in this exact order — **Build → Dev → Verify → Staging → Verify → Prod → Verify → Monitor** — with a numbered heading per stage and an explicit statement that **no stage may be skipped**
- [ ] **Given** each of the eight stages, **When** it is inspected, **Then** it carries at least one **runnable verification command** (a copy-pasteable command, not a description of one) and a **pass condition** that can be evaluated without judgment
- [ ] **Given** the **Build** stage, **When** it is executed from a clean checkout, **Then** the sequence is `git clone` → `pnpm install --frozen-lockfile` → `pnpm typecheck && pnpm lint && pnpm test` → `supabase db push` → `eas build -p android --profile preview` → Vercel preview deploy, and the pass condition is that the type/lint/test commands are green and the migration applied with no drift
- [ ] **Given** the **Dev** stage, **When** it is executed, **Then** the dev-client build is installed with `adb install -r app-debug.apk` and the Maestro panic-path flow is exercised against a healthy local `supabase start` stack; the pass condition is that the panic path opens the dialer intent and the local stack reports healthy
- [ ] **Given** the **Verify** stage, **When** `pnpm release:verify --env staging` runs, **Then** it asserts the artifact secret grep returns **zero** service-role matches, the migration state matches the repo, and the build's env vars are the staging ones — and it exits non-zero when any assertion fails
- [ ] **Given** the **Staging** stage, **When** it is executed, **Then** `supabase db push --linked staging` applies the forward-only migrations and the Vercel preview console deploys; the pass condition is that the console loads and the moderator queue renders
- [ ] **Given** the second **Verify** stage, **When** it is executed, **Then** the staging end-to-end is exercised **and the purge is run against staging in dry-run mode** — the pass condition is that the dry run reports the expected worklist **and** exactly one `job_runs` row is written for the invocation
- [ ] **Given** the **Prod** stage, **When** it is executed, **Then** `eas build -p android --profile production` produces the production APK, `supabase db push --linked production` applies the migrations, and Vercel deploys production; the pass condition is that the production artifact embeds the **cert-pinning** configuration and the production env vars and the artifact grep is still clean
- [ ] **Given** the third **Verify** stage, **When** it is executed, **Then** `adb install app-release.apk` sideloads the production APK and the panic path is walked; the pass condition is that the release build **rejects an unpinned host** and the panic path opens the dialer
- [ ] **Given** the **Monitor** stage, **When** it is executed, **Then** it checks the Storage bytes against the **1 GB** cap, the database size against the **500 MB** cap, the last `job_runs` row **per job** (all `succeeded`), the absence of a stale `running` row, and that the Supabase project is **not paused**
- [ ] **Given** the runbook is followed from a **clean checkout** on a machine that has never seen the project, **When** only the documented commands are run, **Then** the same production state is reached — every prerequisite (tool versions, credentials, linked project refs, EAS login) is stated in the document
- [ ] **Given** the runbook's rollback section, **When** it is inspected, **Then** it names a concrete rollback for each deployed surface — the mobile APK (reinstall the previous APK), the database (a forward-only compensating migration, never a down-migration), the admin console (the previous Vercel deployment), and the Edge Functions (redeploy the previous function version)
- [ ] **Given** the runbook's environment-progression table, **When** it is inspected, **Then** it names the **Local → Staging → Production** composition for mobile, backend, and admin, records that staging may collapse into a single non-prod project under free-tier limits, and lists the **EAS build quota** as a release-planning input with the expected queue time
- [ ] **Given** the runbook's commands, **When** a reviewer runs each one, **Then** **no command in it is aspirational** — every command was executed against a real stack and its actual output was recorded during review

## Technical Notes

- **The runbook lives at `docs/operations/runbook.md`.** It is the document that makes stories `004-eas-build-profiles` and `005-ci-pipeline` **usable by a human**. It is written for an operator who has never seen the repo, running from a clean checkout.
- **The eight stages and their verification commands** (this is the contract; the runbook states each one with its pass condition):

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

- **No stage may be skipped, and the document says so explicitly.** Each stage is a precondition for the next. In particular, a **Prod** stage without the **staging Verify** is not permitted: the purge dry-run against staging is where the migration and the job behaviour are proven before production sees them.
- **Each Verify is a command, not an opinion.** `tools/release-verify.ts` is the per-stage verification harness behind `pnpm release:verify --env <local|staging|production>`. It:
  - runs the artifact secret grep over the mobile bundle, the admin bundle, and the Vercel output and asserts **zero** service-role matches;
  - compares the **linked project's migration state** against the repo's `supabase/migrations/` and fails on drift;
  - asserts the built artifact's env vars match the target environment (the staging APK points at staging, the production APK at production);
  - asserts the production artifact carries the **cert-pinning** configuration and that the release build rejects an unpinned host;
  - asserts the map tile **cache policy** is on in the shipped build and that no request loop hammers the public OSM tile servers;
  - exits non-zero on the first failed assertion, so a stage cannot be "signed off" on a judgement call.
- **The purge dry-run at the staging Verify is the operational rehearsal.** `tools/purge-media-dry-run.ts` calls `POST /functions/v1/purge-media` with `{ "dry_run": true }` against staging and reports the candidate worklist without deleting anything. The staging Verify asserts that the reported worklist matches expectations **and** that the invocation wrote **exactly one** `job_runs` row — the same structural property the production job depends on. The dry-run never deletes a Storage object and never writes `purged_at`.
- **The monitor stage reads free-tier native signals.** No paid APM, no Sentry, no dashboard product. The signals are:
  - the Supabase dashboard's **Storage size** against the **1 GB** cap and the **database size** against the **500 MB** cap;
  - the `job_runs` table, read from the SQL editor — the last row **per** `job_name` must be `succeeded`, and no row may be stuck at `running` with a null `finished_at` (a stale `running` row is a **signal**, not something to delete);
  - the project **not paused** — the heartbeat (`keepProjectAwake`) is what keeps it awake, and a paused project is a paused scheduler, which means a stopped purge.
  The monitor SQL is written in the document, not left as prose:

  ```sql
  SELECT DISTINCT ON (job_name)
    job_name, status, started_at, finished_at, items_processed, items_failed
  FROM job_runs
  ORDER BY job_name, started_at DESC;
  ```

  ```sql
  SELECT job_name, started_at
  FROM job_runs
  WHERE status = 'running' AND started_at < now() - interval '1 hour';
  ```
- **The rollback is per surface and forward-only.**
  - **Mobile APK:** reinstall the previous APK (`adb install -r app-<previous-version>.apk`). There is no store to roll back through; the previous artifact is kept with its versionCode.
  - **Database:** a **forward-only compensating migration** — never a down-migration, never `git revert` of an applied migration. The migration is reverted by writing a new migration that restores the prior state.
  - **Admin console:** redeploy the previous Vercel deployment (the dashboard's "promote" / rollback to a previous deployment id).
  - **Edge Functions:** redeploy the previous function version (`supabase functions deploy <name> --project-ref <ref>` with the previous source), since the functions are deployed independently of the migration set.
  The rollback section also names **what is not rollbackable**: a media purge that already hard-deleted Storage objects (the bytes are gone; only the metadata survives) and a PII scrub (the tombstone is the tombstone).
- **The environment-progression table** records the composition of each environment:

  | Environment | Mobile | Backend | Admin | Notes |
  |-------------|--------|---------|-------|-------|
  | **Local** | Expo dev client on an emulator | `supabase start` (Docker) | `next dev` on `:3000` | the migration dry-run and the RLS integration tests run here, in CI and locally |
  | **Staging** | internal APK (`eas build -p android --profile preview`) → `adb install` | shared Supabase **free** project | Vercel **preview** deployment | staging may collapse into a single non-prod project under free-tier limits — the compromise is documented |
  | **Production** | EAS production APK, **sideloaded** | Supabase project | Vercel **production** deployment | no Play Store listing, no store signing, no store review |

- **The free-tier limits are release-planning inputs, not background colour.** **1 GB Storage** (the purge keeps it inside quota), **500 MB database** (the media caps and the cache eviction keep it inside quota), and the **project pause on inactivity** (the heartbeat keeps it awake). The EAS free-tier **build quota** and **queue time** are stated in the runbook so the production build is scheduled against the remaining quota rather than discovered against it — a build queued for hours is a release-plan fact, not a surprise.
- **Clean-checkout reproducibility.** The runbook's prerequisites section names: Node LTS and pnpm versions (pinned in `package.json` / `.npmrc`), the Supabase CLI, the Expo/EAS CLI, Docker (for `supabase start`), `adb` (Android platform tools), a linked Supabase project per environment (`supabase link --project-ref <ref>`), an EAS login (`eas login`), and the Vercel CLI or the dashboard. The clone → install → migrate → build → deploy sequence reaches the same production state following only this document.
- **The runbook is reviewed against real output.** Every command in it was executed against a real stack during review and its actual output recorded. A command that was never run does not belong in the document — an aspirational command is a lie that costs a failed release.
- **The runbook sits next to `docs/operations/secrets.md`.** The runbook states *which* environment is being operated on; the secrets document states *which* credentials that environment needs and where they live (`007-secrets-and-environments`).
- **The production deploy is human-driven.** There is no push-to-`main`-deploys-production workflow in Phase 1. The CI pipeline (`005-ci-pipeline`) gates the code; the runbook gates the release. The separation is deliberate: a free-tier deployment that fails quietly is a paused project, a full bucket, and a stuck job — and a human walks the ladder.

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the root `pnpm typecheck` / `pnpm lint` / `pnpm test` scripts, the pinned tool versions, and the CI workflow whose green run is the release's precondition
- Unit `001-foundation` story `005-admin-skeleton-and-ci` — the admin console this runbook deploys to Vercel and the admin build output the verification scans
- Unit `002-identity` — the Auth setup the runbook's smoke steps exercise
- Unit `003-help-seek` — the curated dataset seed the release path depends on
- Unit `004-capture` — the media pipeline and the private Storage bucket the purge touches and the monitor stage gauges
- Unit `006-alerts` — the map wrapper whose tile-cache policy the release verification checks
- Unit `007-moderation` — the moderator console that the Staging and Prod stages deploy and the staging Verify renders
- `004-eas-build-profiles` — the `eas.json` profiles, the APK output, and the pinning configuration the Prod and Verify stages depend on
- `005-ci-pipeline` — the CI gates the Build stage assumes and the artifact scan the Verify stages call
- `001-media-purge-job` — the purge function the staging Verify dry-runs and the monitor stage audits
- `bolt-008-jobs-operations-2` — the shared `job-runner` helper and the four Edge Functions the monitor stage audits
- `bolt-008-jobs-operations-4` — `tools/release-verify.ts`, `tools/purge-media-dry-run.ts`, and `tools/secret-scan.ts` — the scripts the runbook's commands call

### Enables
- `007-secrets-and-environments` — the environment-progression table here is the operational half of the secret-placement matrix there
- The production release itself — every Phase-1 release is executed by following this document

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A stage's verification command fails | The runbook states that the release **stops at that stage**; the failing command's output is the evidence, and no later stage is run |
| An operator wants to skip the staging Verify and go straight to Prod | The runbook states explicitly that no stage may be skipped; the staging Verify is where the migration, the purge dry-run, and the artifact scan are proven |
| The production build is queued for hours on EAS | The runbook's Prod stage records the expected queue time and schedules against the remaining quota; the operator waits for the artifact rather than substituting a preview build |
| The EAS free-tier quota is exhausted before the production build | The release is deferred or a quota increase is approved — the runbook never permits shipping a build that skipped the pinning configuration |
| A migration is already applied to production but a new one is added | Migrations are forward-only; the fix is another forward migration, and the rollback section says so rather than offering a revert |
| The production migration applies but the app then fails | The rollback is per surface: reinstall the previous APK, redeploy the previous Vercel deployment, redeploy the previous function version, and write a forward compensating migration for the schema |
| The media purge has already hard-deleted objects and a rollback is requested | The rollback section states that deleted Storage bytes are **not** recoverable — only the report metadata survives; a rollback restores the *code*, never the media |
| The purge dry-run against staging reports a worklist that looks wrong | The staging Verify **fails** — the dry-run's whole purpose is to catch an unexpected worklist before production sees it; the operator investigates the age predicate rather than proceeding |
| The `job_runs` table shows a row stuck at `running` | The monitor stage reports it as a **stale running row** — a signal to investigate, not a row to delete; the next scheduled run of that job will re-select the unfinished work |
| The Supabase project has paused on inactivity | The monitor stage flags it; the heartbeat (`keepProjectAwake`) is the fix, and the runbook notes that a paused project is also a paused scheduler — so a stopped purge is an immediate quota risk |
| The Storage gauge is close to the 1 GB cap | The monitor stage flags it as a release risk; the operator runs the purge dry-run and, if needed, the real purge against production, and checks the byte count reclaimed |
| A certificate on the API host is rotated after the release | The pin set carries a **backup pin**, and the pin set in the EAS production profile is updated **before** the rotation lands; the runbook records the rotation as a planned maintenance step |
| The release verification finds a service-role match in a bundle | The Verify fails; the release stops at that stage and the offending bundle is rebuilt — a leaked key is a release blocker, not a note |
| The production APK installs but the panic path does not open the dialer | The third Verify fails; the release is rolled back per the rollback section rather than being declared "mostly fine" |
| The operator runs the runbook on a machine with a different tool version | The prerequisites section pins Node, pnpm, the Supabase CLI, the EAS CLI, and `adb`; an unpinned version is out of scope and the runbook requires the pinned one |
| A Vercel deployment fails after the database migration succeeded | The rollback section covers the halves separately: the console is redeployed to the previous deployment, and the schema fix (if any) is a forward compensating migration |
| The runbook's command output no longer matches reality after a repo change | The runbook is updated in the same pull request as the change — a runbook that drifts from the code is a failed review, and the review checklist includes running every command |

## Out of Scope

- The CI workflow's job definitions and the failing-PR mechanics — story `005-ci-pipeline`
- The EAS profile definitions, the APK output, and the pinning configuration itself — story `004-eas-build-profiles`
- The secret + environment matrix, the credential storage locations, and the rotation procedure — story `007-secrets-and-environments`
- The `tools/release-verify.ts`, `tools/purge-media-dry-run.ts`, and `tools/secret-scan.ts` implementations — `bolt-008-jobs-operations-4`; this story owns the document that calls them
- A Play Store release checklist, store signing, and store review — Phase 1 ships a **sideloaded APK** only
- An iOS release lane and an App Store release runbook
- A formal change-management process, an on-call rota, and an incident-management tool
- A paid APM (Sentry), a status page, and synthetic uptime monitoring — monitoring is free-tier native
- A database backup / restore drill — the Supabase daily backup is referenced in the requirements as a separate obligation
- The moderation console's feature behaviour — unit `007`

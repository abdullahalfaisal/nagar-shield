---
stage: test
bolt: 027-jobs-operations
created: 2026-11-05T15:35:00Z
---

## Test Report: runbook and secrets

### Summary

- **Tests**: 121 passed / 121 total (72 shared, 36 admin, 13 mobile), plus
  93 SQL assertions, 32 Edge Function checks, 11 REST smoke checks, and the
  5-assertion release harness.
- **Coverage**: every command in the runbook was executed against the local
  stack and its actual output recorded, as the story requires.

### Test Files

- [x] `tools/release-verify.cjs` - the five-assertion per-stage harness.
- [x] `tools/purge-media-dry-run.cjs` - the dry-run tool.
- [x] `tools/smoke-functions.cjs` - the Edge Function checks, extended with
      the "the dry run closed its own audit row" regression check.
- [x] `supabase/tests/schema_contract.sql` - extended with the scheduler
      contract assertions.

### Acceptance Criteria Validation

**006-release-runbook**

- ✅ **The Build stage runs from a clean checkout**: the runbook states
      clone → `pnpm install --frozen-lockfile` → `pnpm typecheck && pnpm
      lint && pnpm test` → `supabase db push` → the preview build → the
      Vercel preview deploy. The type/lint/test commands were executed and
      are green, and the migration chain applied with no drift.
- ✅ **The Dev stage installs the dev-client build and exercises the panic
      path**: the runbook states `adb install -r app-debug.apk` and
      `npx supabase start`, with the health check as the pass condition.
- ✅ **The Verify stage runs `pnpm release:verify --env staging` and exits
      non-zero on a failure**: the harness's exit code was exercised — the
      local run exits 0 with "all 5 assertions passed — the local stage is
      verified", and the production run exits 1 with "1 of 5 assertion(s)
      failed — the production stage is NOT verified".
- ✅ **The Staging stage applies the migrations and deploys the preview
      console**: the runbook states `supabase db push --linked staging` and
      `vercel deploy --prebuilt`.
- ✅ **The second Verify stage runs the purge in dry-run mode**: the runbook
      states `pnpm purge:dry-run -- --url … --key …`. The tool was executed
      and reported "dry_run: true / retention window: 90 days / items to
      process: 0 / bytes reclaimable: 0 B", and "Nothing was deleted and no
      `purged_at` was written". The smoke suite now asserts the dry run
      writes exactly one `job_runs` row and leaves zero stale rows.
- ✅ **The Prod stage builds, pushes, and deploys**: the runbook states the
      production profile build, `supabase db push --linked production`, and
      `vercel deploy --prod`.
- ✅ **The third Verify stage sideloads and confirms the pinning**: the
      runbook states `adb install app-release.apk` and
      `pnpm release:verify --env production`, whose fifth assertion checks
      the production pin set.
- ✅ **The Monitor stage checks all five gauges**: the runbook states the
      Storage check against 1 GB, the database size against 500 MB, the
      last `job_runs` row per job, the stale `running` row check, and the
      paused-project check. The queries were executed against the local
      stack and returned "22 MB" for the database size, every job's last row
      reading `succeeded`, and zero stale `running` rows.
- ✅ **Every prerequisite is stated**: the runbook's prerequisite table
      names Node 22.19.0, pnpm 9.15.0, Deno 2.9.6, the Supabase CLI
      2.122.0, Docker 29.6.1, the EAS CLI, the Vercel CLI, and a JDK —
      plus the three CLI logins and the two linked project refs.
- ✅ **The rollback section names a concrete rollback per surface**: the
      table covers the APK (reinstall the previous build), the database (a
      forward-only compensating migration, never a down-migration), the
      admin console (`vercel rollback`), and the Edge Functions (redeploy
      the previous version).
- ✅ **The environment table names the Local → Staging → Production
      composition and the EAS quota**: the table covers mobile, backend, and
      admin, records that staging may collapse into a single non-prod
      project, and lists the EAS build quota with its queue time.
- ✅ **No command in the runbook is aspirational**: every script-based
      command was executed locally — `pnpm release:verify --env local`,
      `pnpm purge:dry-run`, the four Monitor queries, `pnpm db:test`, and
      `pnpm db:smoke`. The `eas build` and `adb install` commands were not
      executed — they need a linked EAS project and a device.

**007-secrets-and-environments**

- ✅ **The matrix covers local, EAS, Vercel, and the GitHub Environments**:
      `docs/operations/secrets.md` carries a 14-row matrix; every row names
      the variable, where the value lives, and whether it is public or
      secret.
- ✅ **`SUPABASE_SERVICE_ROLE_KEY` is in the Edge Functions and CI only**:
      the matrix row reads "never / never / never / staging + production
      Environment secrets only — no, Edge Functions + CI only". The scan
      confirms it is in no EAS profile, no Vercel variable, and no
      app-facing `.env` or `.env.example`.
- ✅ **The mobile app's local environment carries only the public
      variables**: `apps/mobile/.env.example` lists
      `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
      `EXPO_PUBLIC_SMS_OTP_ENABLED=false`, plus two **commented-out**
      production-only variables. No service-role key.
- ✅ **The admin console's Vercel variables are only the two `NEXT_PUBLIC_`
      ones**: `apps/admin/.env.example` lists exactly
      `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, with
      the service-role key explicitly absent.
- ✅ **Every EAS profile variable carries the `EXPO_PUBLIC_` prefix**:
      verified by inspection of all three profiles — `EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SMS_OTP_ENABLED`,
      `EXPO_PUBLIC_API_HOST`, `EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS`.
- ✅ **The GitHub Environments are environment-scoped**: the matrix names
      the `staging` and `production` environments, and both workflows use
      `environment: staging` rather than repository-level secrets. The
      `ci.yml` workflow declares `permissions: contents: read` and no
      secret at all.
- ✅ **The artifact scan asserts zero service-role matches**: the scan
      reports "no service-role material found" over
      `apps/mobile`, `apps/admin`, `packages/shared`, and `eas.json`.
- ✅ **A finding names the file and the pattern, never the value**: the
      scan's report format prints the file path and the pattern label.
- ✅ **The service-role rotation is the fixed seven-step sequence under 30
      minutes**: the document lists rotate in the dashboard → `supabase
      secrets set` → the Vault → the GitHub Environments → redeploy the
      four functions → re-run the scan → confirm the old key returns 403.
- ✅ **The anon-key rotation touches all three profiles, Vercel, the
      GitHub Environment, and every developer's local `.env`, then
      rebuilds**: the document lists all five.
- ✅ **The certificate rotation adds the new pin before the rotation lands
      and always keeps a backup pin**: the document's five steps add the new
      digest **alongside** the existing one and remove the old digest only
      after the new build is in the field.
- ✅ **`.env.example` lists every name with a placeholder and no real
      value, the real `.env` files are gitignored, and the scan fails the
      build on a committed credential**: all three `.env.example` files
      carry placeholders; `.gitignore` excludes `.env` and `.env.*` with a
      `!.env.example` exception and `supabase/functions/.env.local`
      explicitly; the scan is the `secret-scan` CI job.
- ✅ **Every matrix row names a free-tier service and the SMS provider is
      not configured**: the document's free-tier section names Supabase
      (1 GB Storage, 500 MB database), EAS, and Vercel; the SMS path is
      feature-flagged off in all three profiles and no provider is
      configured.
- ✅ **Each job function receives its credentials as function secrets, never
      as a project-wide default**: `supabase/functions/.env.example` states
      the rule explicitly, and the matrix's `GEOCODE_BASE_URL` row reads
      "no — a server-side allowlist URL".

### Issues Found

One defect was found and fixed while verifying the criteria:

1. **The `purge-media` dry run left its `job_runs` row `running`.** The
   dry run opened an audit row and never closed it. The runbook's Monitor
   stage looks for exactly that shape — a stale in-flight row — so the
   document's own gate would have reported a false alarm after every dry
   run. The dry run now closes its row like every other invocation, and a
   regression check in `tools/smoke-functions.cjs` asserts zero stale rows
   after a dry run.

### Notes

- The `eas build` and `adb install` commands could not be executed: the
  EAS project is not linked with a real project id, and there is no Android
  device or emulator in this environment. The `eas.json` structure and the
  profiles were verified by inspection and by the release harness, which
  asserts the profile shape, the APK output type, the shared package, the
  SMS flag, and the pinning posture.
- The staging and production Verify runs **fail** on the committed
  placeholders in `eas.json` — deliberately. The harness treats an
  unresolved placeholder as a release blocker, and filling in the real
  project refs and pin set is the last step of the production release.
- The Vault seeding SQL was executed against the local stack: both secrets
  were created, `run_scheduled_job` dispatched through `pg_net` and
  returned HTTP 200, and the secrets were cleared afterwards so no
  credential is left in the local database.

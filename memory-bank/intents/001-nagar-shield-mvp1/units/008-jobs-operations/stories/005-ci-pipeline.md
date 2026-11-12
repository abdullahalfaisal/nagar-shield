---
id: 005-ci-pipeline
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 005-ci-pipeline

## User Story

**As a** Nagar Shield maintainer reviewing a pull request
**I want** one CI pipeline that runs the type, lint, unit, shared, migration, RLS, and secret checks in a fixed order and fails the pull request on any of them
**So that** a broken change can never reach staging or production, and a leaked service-role key can never reach a bundle

## Acceptance Criteria

- [ ] **Given** a pull request is opened or updated, **When** `.github/workflows/ci.yml` runs, **Then** the workflow is triggered on `pull_request` (and on `push` to `main`), and it runs the `lint`, `typecheck`, `shared-test`, `unit-test` (mobile / admin / functions), `migration-dry-run`, `rls-integration`, and `secret-scan` jobs in the documented order
- [ ] **Given** the CI workflow, **When** the jobs are inspected, **Then** the `shared-test` job completes **before** the mobile, admin, and functions test jobs begin, and each of those declares `needs: [shared-test]` — the fastest contract signal fails the PR first
- [ ] **Given** a type error is introduced anywhere in the workspace (`apps/mobile`, `apps/admin`, `packages/shared`, `supabase/functions`), **When** CI runs, **Then** the `typecheck` job fails, the workflow exits non-zero, and the pull request is marked as **failing** — the pipeline never continues to the deploy stages
- [ ] **Given** a lint error is introduced, **When** CI runs, **Then** the `lint` job fails and the pull request is marked as failing
- [ ] **Given** a unit test fails (mobile, admin, shared, or the Edge Function job helpers), **When** CI runs, **Then** the relevant test job fails and the pull request is marked as failing
- [ ] **Given** an RLS policy regression is introduced (a policy that leaks a row, or a missing policy that a client relies on), **When** the `rls-integration` job runs, **Then** the job fails and the pull request is marked as failing — an RLS failure is a **stop**, not a warning
- [ ] **Given** the `migration-dry-run` job, **When** it runs, **Then** it starts a **local** Supabase stack (`supabase start` in Docker), replays **every** migration in `supabase/migrations/` in order against it with **no error and no drift**, and the job fails if any migration errors or if the resulting schema differs from the repo's expected state — it never touches staging or production
- [ ] **Given** the `rls-integration` job, **When** it runs, **Then** it exercises the RLS policies against the local stack as an **anon** client and as an **authenticated** client — including the negative tests (an anon client cannot read a private row, an authenticated non-moderator cannot moderate, and **no client can read or write `job_runs`**) — and every failure fails the job
- [ ] **Given** the `secret-scan` job, **When** it runs over the built mobile bundle, the admin bundle, and the Vercel build output, **Then** it asserts **zero** matches for `SUPABASE_SERVICE_ROLE_KEY`, the literal `service_role`, and the service-role JWT payload (`"role":"service_role"`) — and the job **fails** if a match is found
- [ ] **Given** the `secret-scan` job, **When** it inspects the embedded mobile config, **Then** it also asserts that `EXPO_PUBLIC_SMS_OTP_ENABLED` is `false` and that **no** third-party analytics or ad SDK is present in the bundle (FR-DATA-5) — the same scan carries both invariants
- [ ] **Given** the `secret-scan` job, **When** it runs, **Then** the service-role key it looks for is read from the GitHub **Environment** secret and **never** echoed into the workflow log — the scan reports a match's **file and pattern**, never the matched secret value
- [ ] **Given** the CI workflow, **When** it installs dependencies, **Then** every job runs `pnpm install --frozen-lockfile` against the committed `pnpm-lock.yaml`, and the installing job and the testing job use the same pinned Node and pnpm versions
- [ ] **Given** the `rls-integration` and `migration-dry-run` jobs, **When** they run, **Then** they target a **local** Supabase instance only — the job's environment contains the local `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` for `supabase start` and **no** staging or production project ref
- [ ] **Given** the nightly `main` run (`.github/workflows/build.yml`), **When** it runs, **Then** it builds the Android **APK** with the `preview` profile (`eas build -p android --profile preview`), runs the Maestro subset against the artifact, and scans the APK for secrets — the nightly smoke build never touches production
- [ ] **Given** a fork pull request, **When** the workflow runs, **Then** the workflow runs with `pull_request` (not `pull_request_target`), requires **no** write permissions, and **no** secret is exposed to the fork run — the RLS and secret jobs use the local stack and no credential at all

## Technical Notes

- **This story EXTENDS the workflow unit `001` started.** `.github/workflows/ci.yml` already defines `lint`, `typecheck`, `shared-test`, `unit-test-mobile`, `unit-test-admin`, and a reserved build/release job. This story **adds** `migration-dry-run`, `rls-integration`, `secret-scan`, and the functions test job, and it fills in the nightly `.github/workflows/build.yml`. It does not replace the existing jobs.
- **The job order and the dependency graph:**

  ```text
  lint ─┐
  typecheck ─┼─> shared-test ─> unit-test-mobile ─┐
              │                 unit-test-admin  ─┼─> migration-dry-run ─> rls-integration ─> secret-scan
              │                 unit-test-functions ─┘
  ```

  `shared-test` is the contract source for every other workspace, so it runs first among the tests and gates the rest. `migration-dry-run` must precede `rls-integration` because the RLS tests need a schema with the migrations applied. `secret-scan` runs last because it needs the **built** bundles.
- **The concrete commands per job:**

  | Job | Command |
  |-----|---------|
  | `lint` | `pnpm lint` |
  | `typecheck` | `pnpm typecheck` (`tsc --noEmit` per workspace, including `supabase/functions` under the Deno tsconfig) |
  | `shared-test` | `pnpm --filter @shared test` |
  | `unit-test-mobile` | `pnpm --filter mobile test -- --ci` (`jest-expo`) |
  | `unit-test-admin` | `pnpm --filter admin test -- --ci` |
  | `unit-test-functions` | `pnpm --filter functions test -- --ci` (Jest, Deno-compatible helpers: age cut-offs, idempotency, tombstone builder) |
  | `migration-dry-run` | `supabase start && supabase db reset && supabase migration list && pnpm db:drift-check` |
  | `rls-integration` | `pnpm test:integration:rls` (Node / SQL scripts against the local stack) |
  | `secret-scan` | `pnpm secret:scan` (over the mobile bundle, the admin bundle, and the Vercel output) |
  | nightly build | `eas build -p android --profile preview --platform android` + `pnpm maestro:smoke` |

- **The migration dry-run runs against Supabase local, never against a remote project.** `supabase start` brings up Postgres, Auth, Storage, and the local Edge Function runtime in Docker; `supabase db reset` replays every migration in `supabase/migrations/` in filename order against a **fresh** database. The drift check compares the resulting schema to the committed expectation. Migrations are **forward-only** — there is no down-migration, so the dry-run is the only way a bad migration is caught before it reaches staging.
- **The RLS integration tests run against the local stack.** They are the negative tests the architecture calls for: an anon client cannot read an anonymous author's `author_id`; a citizen cannot moderate; a moderator can read the queue but not the raw `job_runs` table; **no** anon or authenticated client can read or write `job_runs` (the no-policy posture). Each test asserts both the allowed and the denied path.
- **The secret scan is the mechanical proof of the "never in a bundle" invariant.** `tools/secret-scan.ts` scans:
  - the built mobile JS bundle (`apps/mobile/dist` / the exported EAS bundle),
  - the admin's Next.js build output (`apps/admin/.next`),
  - the Vercel build output,
  for `SUPABASE_SERVICE_ROLE_KEY`, the literal `service_role`, and the service-role JWT marker. The scan reads the **expected** key from the GitHub Environment secret and asserts it is **absent**; a match prints the file and the pattern, never the secret.
- **The scan also enforces FR-DATA-5.** It asserts that no third-party analytics or ad SDK is present (`@react-native-firebase/analytics`, `amplitude`, `mixpanel`, `segment`, `facebook-react-native-sdk`, `adjust`, `appsflyer`) and that `EXPO_PUBLIC_SMS_OTP_ENABLED` is `false` in the embedded config. A third-party SDK would also be a data-sale risk (FR-DATA-5), so one scan carries both.
- **CI must fail the PR, not warn.** Every job runs with default `continue-on-error: false`. A failing job makes the workflow exit non-zero and the pull request shows a red check. There is no "allowed to fail" job on the PR path.
- **Fork PRs get no secrets.** The workflow triggers on `pull_request`, not `pull_request_target`, and declares no write permissions. The `migration-dry-run` and `rls-integration` jobs need no credential — they run entirely on the local stack. The `secret-scan` job on a fork PR scans the **build output** against a **pattern list** (the key name and the JWT marker) rather than a live secret value, so the fork run never receives the key.
- **The nightly build is a smoke test, not a release.** `.github/workflows/build.yml` runs on a schedule and on `main`: it builds the `preview` APK, runs the Maestro panic-path subset against an emulator, and scans the APK for secrets. It uses the EAS token from the GitHub **Environment** secrets. It never deploys to production — the production deploy is a **human-driven** runbook step (`006-release-runbook`).
- **The EAS token and the service-role key live in GitHub Environment secrets**, scoped to the `production` / `staging` environments — never as repository-level secrets, never in a workflow file. See `007-secrets-and-environments`.
- **Free-tier costs.** The nightly build consumes EAS build quota, so it is scheduled to run **once per day**, not on every push to `main`. The PR path never triggers an EAS build — the PR path is lint, typecheck, tests, migrations, RLS, and the artifact scan.
- **The suite is expected to be fast.** The PR path targets **under 10 minutes**: the shared tests are the first signal, the Docker-backed Supabase job is the slowest and runs last among the tests, and no EAS build happens on a PR.

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the root `pnpm typecheck` / `pnpm lint` / `pnpm test` scripts, the pinned Node + pnpm versions, and the `.github/workflows/ci.yml` base this story extends
- Unit `001-foundation` story `005-admin-skeleton-and-ci` — the existing `lint`, `typecheck`, `shared-test`, `unit-test-mobile`, `unit-test-admin` jobs, the reserved build/release job, and the repository-level secret-scan test
- Unit `001-foundation` story `002-shared-contracts` — the shared Zod contracts whose tests run first as `shared-test` and gate every other test job
- Unit `002-identity` — the `profiles` / Auth schema and its RLS policies the RLS integration tests exercise
- Unit `003-help-seek` — the stations / hotlines schema and seed the migration dry-run replays
- Unit `004-capture` — the `reports` / `report_media` / `geocode_cache` tables, the private Storage bucket, and the storage RLS policies the RLS integration tests exercise
- Unit `005-location` — the `location_shares` audit table and its RLS policies
- Unit `006-alerts` — the public read models whose RLS and projection rules the negative tests cover
- Unit `007-moderation` — the `moderation_actions` audit trail, the moderator RBAC policies, and the admin build output the secret scan inspects
- `bolt-008-jobs-operations-1` — `supabase/migrations/0007_jobs.sql` and the no-policy RLS posture on `job_runs` that the RLS tests assert
- `bolt-008-jobs-operations-2` — the shared `job-runner` helper whose pure logic the `unit-test-functions` job covers
- `004-eas-build-profiles` — the `eas.json` profiles and the artifacts the nightly build and the secret scan inspect

### Enables
- `006-release-runbook` — the CI gates that the runbook's Build and Verify stages depend on, and the green-PR precondition the release progression assumes
- `007-secrets-and-environments` — the GitHub Environments and secrets this pipeline reads, and the "never in a bundle" invariant the secret-scan job enforces
- `001-media-purge-job` — the CI job that runs this purge's unit and Supabase-local integration tests
- `002-deleted-account-pii-purge` — the CI job that runs this purge's unit and Supabase-local integration tests
- `003-geocode-cache-cleanup` — the CI job that runs this cleanup's unit and Supabase-local integration tests

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A type error is introduced in `supabase/functions` | The `typecheck` job fails and the PR turns red; the functions job never runs |
| A lint error is introduced in `packages/shared` | The `lint` job fails; the PR turns red before any test runs |
| A shared contract test fails | The `shared-test` job fails; the mobile, admin, and functions test jobs are **skipped** (they declare `needs: [shared-test]`) rather than running against broken contracts |
| A migration is added with a syntax error | The `migration-dry-run` job fails at `supabase db reset`; the staging and production projects are untouched because the dry-run never leaves the local stack |
| A migration is added that creates drift from the expected schema | The drift check in the `migration-dry-run` job fails; the PR turns red |
| An RLS policy is loosened to expose a private row | The negative RLS test fails: the anon client reads a row it must not be able to; the `rls-integration` job fails and the PR turns red |
| A policy is added on `job_runs` for the `authenticated` role | The RLS test asserting that no client can read `job_runs` fails — the no-policy posture is a contract, not a default |
| The service-role key is committed into `apps/mobile` by mistake | The `secret-scan` job fails on the built bundle and names the file; the PR turns red before the change can reach a build |
| The service-role key is in the admin's Next.js build output | The `secret-scan` job fails on the admin bundle; the PR turns red |
| The secret-scan job finds a match | It prints the **file path and the pattern**, never the matched secret value — the workflow log does not become a second leak |
| A PR comes from a fork | The workflow runs with no secrets and no write permissions; the RLS and migration jobs still run because they need no credential |
| Docker is unavailable on the runner | The `migration-dry-run` and `rls-integration` jobs fail loudly rather than silently skipping — a skipped security gate is a failed PR |
| The EAS free-tier build quota is exhausted on the nightly run | The nightly `build.yml` job fails and alerts; the PR pipeline is unaffected because no PR triggers an EAS build |
| The nightly EAS build is queued for hours | The job waits for the build to complete (or times out with a clear message); the quota and queue time are accounted for in the runbook |
| The Maestro smoke subset fails on the nightly APK | The nightly job fails and reports the failing flow; it never promotes anything — the production deploy is a manual runbook stage |
| A job is marked `continue-on-error: true` by mistake | A CI lint rule rejects `continue-on-error: true` in the workflow files; a PR-path job may never be allowed to fail silently |
| The lockfile is out of sync with `package.json` | `pnpm install --frozen-lockfile` fails the workflow with a clear lockfile error before any test runs |
| The Supabase local start exceeds the runner's timeout | The job fails with the container logs attached; the schema is never assumed to be half-applied |

## Out of Scope

- The EAS build profiles themselves (`eas.json`, the APK output, the pinning configuration) — story `004-eas-build-profiles`
- The release progression, the per-stage verification commands, and the rollback procedure — story `006-release-runbook`
- The secret + environment matrix and the rotation procedure — story `007-secrets-and-environments`
- The admin console build and the moderator decision flows — unit `007`
- The `tools/secret-scan.ts` implementation detail beyond its CI contract — the script is shared with `006-release-runbook` and `007-secrets-and-environments`
- The production deploy pipeline (a `main`-push-to-production deploy) — Phase 1 ships a **human-driven** release via the runbook
- A paid CI runner, a larger build matrix, and multi-region CI — the free tier is the plan
- Coverage thresholds, mutation testing, and visual-regression diffing — not required by any FR
- A scheduled dependency-vulnerability scanner and an SBOM pipeline
- Maestro E2E flows beyond the nightly smoke subset — the E2E suite itself belongs to the feature units

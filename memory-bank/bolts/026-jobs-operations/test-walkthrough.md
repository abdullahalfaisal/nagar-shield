---
stage: test
bolt: 026-jobs-operations
created: 2026-11-05T14:45:00Z
---

## Test Report: build and ci

### Summary

- **Tests**: 121 passed / 121 total (72 shared, 36 admin, 13 mobile), plus
  93 SQL assertions and 32 Edge Function checks.
- **Coverage**: the acceptance criteria are verified by the workspace gate
  and by the release harness, not by a line-coverage number.

### Test Files

- [x] `tools/release-verify.cjs` - the five-assertion per-stage harness:
      the artifact secret grep, the migration state, the profile env vars,
      the SMS OTP flag, and the cert-pinning posture.
- [x] `tools/secret-scan.cjs` - the artifact scan over the client sources,
      the built bundles, and the EAS profiles.
- [x] `tools/smoke-functions.cjs` - the Edge Function auth gates, extended
      with the heartbeat's positive and negative checks.
- [x] `supabase/tests/schema_contract.sql` - extended with the scheduler
      contract assertions.

### Acceptance Criteria Validation

**004-eas-build-profiles**

- ✅ **Exactly three profiles, each with its own env block and APK output**:
      `eas.json` defines `dev`, `preview`, and `production`; each carries
      `distribution: internal` and `android.buildType: apk`. The release
      harness reads the profile map and reports "3 profile(s)".
- ✅ **The `preview` and `production` profiles output an APK, never an AAB**:
      both set `"buildType": "apk"`. No AAB path exists in the file.
- ✅ **The `dev` profile is a development client against the local stack**:
      `developmentClient: true` and
      `EXPO_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321`. The harness
      asserts the dev profile does **not** carry a `.supabase.co` host.
- ✅ **Only `production` pins the API host**: the harness's fifth assertion
      passes for `local` ("only the production profile pins the API host")
      and for `production` ("the production artifact carries the cert-pinning
      config — 1 pin(s)").
- ✅ **No built APK contains service-role material**: the scan over
      `apps/mobile`, `apps/admin`, `packages/shared`, and `eas.json` returns
      "no service-role material found", and the harness's first assertion
      passes.
- ✅ **Every profile's env vars carry the `EXPO_PUBLIC_` prefix, and the SMS
      flag is off in each**: the harness's fourth assertion passes —
      "the SMS OTP feature flag is off in every profile — 3 profile(s)".
- ✅ **No Play Store configuration**: `eas.json` has no `playStore` block and
      no store-review path; `distribution: internal` is set on both release
      profiles.
- ✅ **The project id and the Android package are committed in
      `app.config.ts`**: `extra.eas.projectId` and `android.package:
      com.nagarshield.app` are both present, and the package matches across
      all three profiles.

**005-ci-pipeline**

- ✅ **Triggers on `pull_request` and on `push` to `main`, running the jobs
      in the documented order**: `ci.yml` declares both triggers and the
      nine jobs in the graph order.
- ✅ **`shared-test` gates the three consumer test jobs**: each of
      `unit-test-mobile`, `unit-test-admin`, and `unit-test-functions`
      declares `needs: [shared-test]`.
- ✅ **Any defect turns the PR red; no job is `continue-on-error`**: no job
      in either workflow sets `continue-on-error`.
- ✅ **`migration-dry-run` replays every migration against a local stack**:
      the job runs `supabase start && supabase db reset --local`, then the
      data and shared drift checks, then `pnpm db:test`. The local run
      applied all **16** migrations with no drift, and the 93 SQL assertions
      pass.
- ✅ **`rls-integration` exercises anon and authenticated clients**:
      `pnpm db:smoke` reports "11/11 REST smoke checks passed", including
      "a citizen is refused the moderation queue — HTTP 403", "the service
      role cannot bypass the role check — HTTP 403", and "the feed items
      omit author_id".
- ✅ **`secret-scan` asserts zero service-role matches, no analytics SDK,
      and the SMS flag off**: the scan reports "no service-role material
      found", "no third-party analytics or ad SDK found", and "SMS OTP
      remains feature-flagged off".
- ✅ **A match reports the file and the pattern, never the value**: the scan
      prints the file path and the pattern name only.
- ✅ **Every job installs with `--frozen-lockfile` on the same pinned
      toolchain**: `NODE_VERSION: 22.19.0` and `PNPM_VERSION: 9.15.0` are
      workflow-level env vars, and every job runs
      `pnpm install --frozen-lockfile`.
- ✅ **The migration and RLS jobs target a local instance only**: neither
      job references a staging or production project ref; both run
      `supabase start` locally.
- ✅ **The nightly build produces the preview APK, runs Maestro, and scans
      the APK — and never touches production**: `build.yml` runs
      `eas build -p android --profile preview`, the artifact scan, and the
      Maestro panic-path subset. No production profile is referenced.
- ✅ **A fork PR runs with no write permissions and no secret**:
      `permissions: contents: read`, the `pull_request` trigger, and the
      secret scan reads a pattern list rather than a live key.

### Issues Found

Two defects were found and fixed while verifying the criteria:

1. **`finalize-capture` called its write RPC with the service client.** The
   `finalize_capture` RPC reads `auth.uid()`, so it needs the **caller's**
   JWT; the service client carries no user identity and the RPC rejected
   every call with `AUTH_REQUIRED`. Confirmed with a direct probe —
   the service-role key returned `42501 AUTH_REQUIRED`, the caller's JWT
   returned `200`. Fixed by switching the RPC call to the caller client.
   The Edge Function smoke went from 22/29 to **31/31**; it is now 32/32
   with the added heartbeat checks.

2. **The `purge-media` dry run left its `job_runs` row `running`.** The
   dry run opened an audit row and never closed it, so the runbook's
   monitor stage would report a stale in-flight job. The dry run now
   closes its row like every other invocation, and a regression check in
   `tools/smoke-functions.cjs` asserts zero stale rows after a dry run.

### Notes

- `pnpm release:verify --env local` passes all five assertions. The
  `--env production` run **fails** on the unresolved project-ref
  placeholder — deliberately. The committed `eas.json` carries
  placeholders for the staging and production refs and the pin set, and the
  harness treats an unresolved placeholder as a release blocker rather
  than a pass.
- The CI workflow itself could not be executed against GitHub Actions from
  this environment — there is no remote repository and no runner. Its YAML
  structure, the job graph, the `needs:` edges, and the command list were
  verified by inspection against the story's contract, and every command it
  invokes was executed locally and passed.
- The Maestro subset and the EAS build were not executed: the Maestro flow
  file does not exist yet, and an EAS build needs the EAS project to be
  linked with a real project id.

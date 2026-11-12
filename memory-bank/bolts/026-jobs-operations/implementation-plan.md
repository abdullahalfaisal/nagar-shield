---
stage: plan
bolt: 026-jobs-operations
created: 2026-11-05T14:00:00Z
---

## Implementation Plan: build and ci

### Objective

Make the Nagar Shield mobile app **installable and shippable** from one
reproducible build definition, and put a CI pipeline in front of it that
fails a pull request on any type, lint, unit, migration, RLS, or secret
defect.

Two stories:

- **004-eas-build-profiles** — one `eas.json` with three profiles that each
  produce an installable Android APK, with the right backend and the right
  security posture.
- **005-ci-pipeline** — one CI pipeline that runs the checks in a fixed
  order and fails the PR on any of them.

### Deliverables

**Story 004 — EAS build profiles**

- `eas.json` — exactly three profiles: `dev`, `preview`, `production`.
- `apps/mobile/app.config.ts` — the EAS project id, the Android package,
  the `versionCode`, and the certificate-pinning plugin.
- `apps/mobile/plugins/withCertPinning.js` — the config plugin that writes
  the Android network-security config at prebuild time.
- `apps/mobile/.env.example` — the mobile app's public variables.
- `apps/mobile/app.json` — the committed base config the dynamic config
  layers onto.

**Story 005 — CI pipeline**

- `.github/workflows/ci.yml` — the PR gate.
- `.github/workflows/build.yml` — the nightly preview-APK smoke build.
- `tools/secret-scan.cjs` — the artifact scan.
- `tools/release-verify.cjs` — the per-stage release verification harness.

### Dependencies

- **001-foundation** — the pnpm workspace, the root scripts, and the pinned
  Node + pnpm versions the CI jobs share.
- **008-jobs-operations** — the job functions whose artefacts the secret
  scan inspects, and the purge whose dry-run the staging Verify stage runs.
- **Expo SDK 58** — the config-plugin API (`withAndroidManifest`,
  `withDangerousMod`).
- **Deno 2.9.6** — the Edge Function type check inside the CI graph.

### Technical Approach

**The EAS profiles.** `eas.json` is the single build definition. `dev` is a
development-client APK against the local stack; `preview` is a release APK
against staging; `production` is a release APK against production and is the
**only** profile that pins the API host. All three set
`EXPO_PUBLIC_SMS_OTP_ENABLED=false` — no SMS provider is funded.

`expo-build-properties` has no `networkSecurityConfig` option, so the
pinning ships as a **custom config plugin** rather than a build-properties
flag. The plugin reads `EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS`; empty means system
trust only, populated means the API host carries a `<pin-set>` alongside the
system certificates so a pin that is about to expire cannot brick the app.

**The CI job graph.** `lint` and `typecheck` are the cheapest signals and
gate everything. `shared-test` is the first test signal and gates the three
consumer test jobs, so a broken contract skips them instead of running them
against a broken baseline. `migration-dry-run` precedes `rls-integration`
because the RLS tests need a migrated schema. `secret-scan` runs last
because it inspects the **built** output.

```
lint ─┐
typecheck ─┼─> shared-test ─> unit-test-mobile ─┐
           │                 unit-test-admin  ─┼─> migration-dry-run ─> rls-integration ─> secret-scan
           │                 unit-test-functions ─┘
```

**Fork safety.** The workflow triggers on `pull_request`, not
`pull_request_target`, and declares `permissions: contents: read`. The
migration, RLS, and secret jobs need no credential — they run against a
local Supabase stack and a pattern list — so a fork PR gets no secret at
all.

**The secret scan.** It runs over the client sources, the built bundles,
and the EAS profiles, and asserts three things: no service-role material,
no third-party analytics or ad SDK (FR-DATA-5), and the SMS OTP flag off.
A finding prints the **file and the pattern**, never the matched value — the
CI log must not become a second copy of the leak.

### Acceptance Criteria

**004-eas-build-profiles**

- [ ] `eas.json` defines exactly three profiles — `dev`, `preview`,
      `production` — each with its own env block and its own APK output.
- [ ] The `preview` and `production` profiles output an **`.apk`**, never an
      `.aab`, and install with `adb install` without a signature conflict.
- [ ] The `dev` profile produces a development client against the local /
      staging stack and embeds no production API host.
- [ ] The `production` profile pins the API host; `dev` and `preview` carry
      **no** pinning configuration.
- [ ] No built APK contains `SUPABASE_SERVICE_ROLE_KEY`, the literal
      `service_role`, or the service-role JWT prefix.
- [ ] Every profile's embedded env vars carry the `EXPO_PUBLIC_` prefix, and
      `EXPO_PUBLIC_SMS_OTP_ENABLED=false` in **each** of the three.
- [ ] There is no Play Store configuration anywhere in the release path.
- [ ] The EAS project id and the Android package are committed in
      `app.config.ts`, so `eas build` resolves without an interactive login.

**005-ci-pipeline**

- [ ] `ci.yml` triggers on `pull_request` and on `push` to `main`, and runs
      the jobs in the documented order.
- [ ] `shared-test` completes **before** the mobile, admin, and functions
      test jobs, and each of those declares `needs: [shared-test]`.
- [ ] A type, lint, unit, migration, RLS, or secret failure turns the PR
      red; no job is `continue-on-error`.
- [ ] `migration-dry-run` replays **every** migration against a **local**
      stack and fails on a migration error or a drift.
- [ ] `rls-integration` exercises the policies as an anon client and as an
      authenticated client, including the negative tests.
- [ ] `secret-scan` asserts zero service-role matches in the built mobile
      bundle, the admin bundle, and the EAS profiles, and asserts the SMS
      flag off and no third-party analytics SDK.
- [ ] The scan reports a match's **file and pattern**, never the value.
- [ ] Every job installs with `pnpm install --frozen-lockfile` against the
      committed lockfile, on the same pinned Node and pnpm.
- [ ] The migration and RLS jobs target a **local** instance only — no
      staging or production project ref.
- [ ] The nightly `build.yml` builds the `preview` APK, runs the Maestro
      subset, and scans the APK — and never touches production.
- [ ] A fork PR runs with `pull_request`, no write permissions, and no
      secret.

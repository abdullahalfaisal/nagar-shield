---
id: 004-eas-build-profiles
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: '2026-11-04T00:00:00Z'
assigned_bolt: null
implemented: true
---

# Story: 004-eas-build-profiles

## User Story

**As a** Nagar Shield maintainer shipping the app to testers and to real users
**I want** one `eas.json` with three named build profiles that produce an installable Android APK
**So that** a developer, a staging tester, and a production user each get the right backend and the right security posture from a single, reproducible build definition — with no Play Store in the loop

## Acceptance Criteria

- [ ] **Given** the `eas.json` at the repository root, **When** it is inspected, **Then** it defines exactly three build profiles named `dev`, `preview`, and `production`, each with its own `developmentClient` / `distribution` shape and its own env-var block — the file is the single source of truth for how a binary is built
- [ ] **Given** the `preview` profile, **When** `eas build -p android --profile preview` runs, **Then** the output is an **`.apk`** (never an `.aab`), the artifact is downloadable from the EAS build page, and it installs on a running emulator with `adb install app-preview.apk` without an "app not installed" or signature-conflict error
- [ ] **Given** the `production` profile, **When** `eas build -p android --profile production` runs, **Then** the output is also an **`.apk`** (not an `.aab`) and it installs on a device with `adb install app-release.apk` — the sideload path is the only distribution path in Phase 1
- [ ] **Given** the `dev` profile, **When** `eas build -p android --profile dev` runs, **Then** it produces a **development client** build that talks to the local / staging stack, with the dev-client flag enabled and the production API host **not** embedded
- [ ] **Given** the `production` profile, **When** the built APK is inspected for its network-security configuration, **Then** the **API host is certificate-pinned** — the release build carries the pinning configuration for the API host and rejects a TLS connection whose certificate does not match the pinned set (FR-DATA-2)
- [ ] **Given** the `dev` profile, **When** the built APK is inspected, **Then** it carries **no** certificate-pinning configuration — a developer is never blocked by a rotated certificate, and the pinning config ships only in the release profile
- [ ] **Given** any built APK, **When** it is searched for `SUPABASE_SERVICE_ROLE_KEY`, the literal `service_role`, and the service-role JWT prefix, **Then** there are **zero** matches — the service-role key is **never** an EAS build env var and never reaches the bundle
- [ ] **Given** any built APK, **When** its embedded env vars are inspected, **Then** it contains only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_SMS_OTP_ENABLED` — every value carries the `EXPO_PUBLIC_` prefix and is therefore public by construction
- [ ] **Given** every profile in `eas.json`, **When** the file is inspected, **Then** `EXPO_PUBLIC_SMS_OTP_ENABLED=false` is asserted in **each** of the three profiles — the SMS OTP path is flagged off because no provider is funded (FR-DATA-5 / waiver W-2), and no profile enables it
- [ ] **Given** the release profiles, **When** `eas.json` is inspected, **Then** there is **no** Play Store configuration — no `playStore` block, no release-signing-upload workflow, no store-review step, and no release path that blocks on a listing
- [ ] **Given** the `production` profile, **When** the Android build config is inspected, **Then** it sets `versionCode` / `version` explicitly (not `1.0` forever), the app id follows the Nagar Shield naming convention (`com.nagarshield.app`), and the `android.package` is a single stable id shared by `dev`, `preview`, and `production`
- [ ] **Given** the built APK, **When** it is installed and launched on an emulator, **Then** the app boots to the routed first screen without a redbox, the onboarding / sign-in flow is reachable, and the panic path's zero-network guarantee still holds (the app must not block on the network at launch)
- [ ] **Given** the EAS project configuration, **When** it is inspected, **Then** the project id is committed in `app.config.ts` (`extra.eas.projectId`) and the Android package is committed in `app.config.ts` (`android.package`), so `eas build` resolves the project without an interactive login step

## Technical Notes

- **`eas.json` lives at the repository root** and is the single build definition. Unit `001` owns the skeleton (the `cli.version` / `build` shape and the `projectId` placeholder); this story owns the real profiles, the real project id, the Android package, the APK output type, the pinning configuration, and the per-profile env wiring.
- **The three profiles and their jobs:**

  | Profile | Output | Backend | Pinning | Purpose |
  |---------|--------|---------|---------|---------|
  | `dev` | development-client **APK** | local / staging | **no** | daily development against a live stack |
  | `preview` | release **APK** | staging | **no** | the internal, sideloaded staging APK |
  | `production` | release **APK** | production | **yes** (FR-DATA-2) | the sideloaded production APK |

  `distribution: 'internal'` is set for `preview` and `production` so EAS produces an APK directly — no Play Store signing, listing, or review step exists anywhere in Phase 1.
- **The shape of the file** (project id and package are placeholders resolved at implementation time):

  ```json
  {
    "cli": { "version": ">= 10.0.0", "appVersionSource": "remote" },
    "build": {
      "dev": {
        "developmentClient": true,
        "distribution": "internal",
        "env": {
          "EXPO_PUBLIC_SUPABASE_URL": "https://<project-ref>.supabase.co",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<anon-key>",
          "EXPO_PUBLIC_SMS_OTP_ENABLED": "false"
        },
        "android": { "buildType": "apk", "package": "com.nagarshield.app" }
      },
      "preview": {
        "distribution": "internal",
        "env": {
          "EXPO_PUBLIC_SUPABASE_URL": "https://<staging-ref>.supabase.co",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<staging-anon-key>",
          "EXPO_PUBLIC_SMS_OTP_ENABLED": "false"
        },
        "android": { "buildType": "apk", "package": "com.nagarshield.app" }
      },
      "production": {
        "distribution": "internal",
        "env": {
          "EXPO_PUBLIC_SUPABASE_URL": "https://<production-ref>.supabase.co",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<production-anon-key>",
          "EXPO_PUBLIC_SMS_OTP_ENABLED": "false",
          "EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS": "<sha256-pin-set>"
        },
        "android": { "buildType": "apk", "package": "com.nagarshield.app" }
      }
    }
  }
  ```

- **Cert pinning is a release-profile concern (FR-DATA-2).** The pinning configuration ships in `production` and is deliberately absent from `dev` and `preview`:
  - `production` sets `EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS` to the API host's SHA-256 **pin set** (the base64 SHA-256 of the DER-encoded subject public key, newline- or comma-separated, with a backup pin for the next certificate).
  - The Android network-security configuration (`android:networkSecurityConfig` in `app.config.ts`, backed by `apps/mobile/android/xml/network_security_config.xml`) declares the API host with a `<pin-set>` and `android:networkSecurityConfig` pinned mode; every other host (the OSM tile servers, the EAS update server) stays in the default system-trust mode, because pinning a third-party tile CDN would break the map on every certificate rotation.
  - The dev profile omits `EXPO_PUBLIC_CERT_PIN_PUBLIC_KEYS` entirely, so the pinning code path is inert and a developer is never locked out by a rotated certificate.
  - The release verification (`tools/release-verify.ts`, story `006-release-runbook`) asserts that the production artifact contains the pin set and that the release build **rejects an unpinned host**.
- **Every env var in the bundle carries the `EXPO_PUBLIC_` prefix.** Expo inlines `EXPO_PUBLIC_*` variables at build time, which is exactly why the **service-role key is never an EAS build env var**: the moment it was named `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` it would be inlined into the JS bundle. The key is confined to the Edge Functions and CI (`007-secrets-and-environments`).
- **The APK is sideloaded, not distributed.** The install path is `adb install -r app-preview.apk` (emulator) or `adb install app-release.apk` (device), or a direct file share. `adb install -r` replaces an existing install; because all three profiles share one package id, a preview APK can be replaced by a production APK without an uninstall.
- **The `android.package` is `com.nagarshield.app`** for all three profiles — one id, one app id, one signing lineage. The EAS project id and the package are committed in `app.config.ts` (`extra.eas.projectId`, `android.package`) so a CI build never needs an interactive `eas init`.
- **`versionCode` / `version` are explicit on the release profiles.** A production build that silently keeps `versionCode = 1` cannot be upgraded in place on a device, and the sideload path has no store to arbitrate versions. The nightly `main` build asserts the versionCode is monotonic.
- **The EAS free-tier build quota is a release-planning input.** Builds are metered and queued. The runbook schedules the production build against the remaining quota and states the expected queue time; a build queued for hours is a release-plan fact, not a surprise.
- **The artifact secret scan is the mechanical proof.** `tools/secret-scan.ts` greps the built APK's JS bundle (and the admin bundle and the Vercel output) for `SUPABASE_SERVICE_ROLE_KEY`, the literal `service_role`, and the service-role JWT prefix (`eyJ` + a `role":"service_role"` payload). Zero matches is a **CI gate** (story `005-ci-pipeline`), not a manual step.
- **FR-DATA-5 rides on the same scan.** The scan also asserts that no third-party analytics or ad SDK is present in the bundle (no `@react-native-firebase/analytics`, no `amplitude`, no `facebook-react-native-sdk`, no `segment`) and that `EXPO_PUBLIC_SMS_OTP_ENABLED` is `false` in the embedded config.
- **No Play Store path exists.** There is no `playStore` block, no Play App Signing key, no internal-app-sharing upload, and no store-release workflow. The app's distribution is a file the operator installs.
- **Verification commands:**
  - Build the staging APK: `eas build -p android --profile preview --platform android`
  - Build the production APK: `eas build -p android --profile production --platform android`
  - Install on an emulator: `adb install -r app-preview.apk` / `adb install app-release.apk`
  - Confirm the install: `adb shell pm list packages | grep com.nagarshield.app`
  - Confirm the launch: `adb shell monkey -p com.nagarshield.app -c android.intent.category.LAUNCHER 1`
  - Scan the artifact: `pnpm secret:scan --app app-release.apk`

## Implementation

### What the profile values resolve to

The `dev` profile carries the **real** local stack's values: the local
Supabase URL (`http://127.0.0.1:54321`) and the local stack's **anon**
key — the same publishable key `apps/mobile/.env` holds. The anon key is
public by construction (it is scoped by RLS, not by secrecy), and the
`dev` profile is a development-client build that talks to the local stack,
so embedding it is correct and it carries no secret.

The `preview` and `production` profiles still carry placeholders:

| Placeholder | Profile | What it needs |
|---|---|---|
| `<staging-ref>` | `preview` | the staging Supabase project ref — the 20-character slug in `https://<ref>.supabase.co` |
| `<staging-anon-key>` | `preview` | the staging project's publishable anon key |
| `<production-ref>` | `production` | the production Supabase project ref (also the `EXPO_PUBLIC_API_HOST`) |
| `<production-anon-key>` | `production` | the production project's publishable anon key |
| `<sha256-pin-set>` | `production` | the API host's SHA-256 subject-public-key digests, comma-separated, **with a backup pin** |

These are **credentials for a hosted Supabase project**, not code. There
is no Supabase project linked (`supabase/.temp/project-ref` does not
exist and `supabase projects list` reports no access token), so the
values cannot be derived from the repository — they are supplied by the
maintainer who owns the hosted projects.

The `eas.json` is **not** where the service-role key lives, and it never
will be: the service-role key bypasses every RLS policy, and an
`EXPO_PUBLIC_`-prefixed value is inlined into the JS bundle. It stays in
the Edge Functions and the GitHub Environment secrets.

### The release gate was wrong in two ways

`pnpm release:verify` is the mechanical gate for this story, and it had
two defects that made it unsound. Both are fixed in
`tools/release-verify.cjs`:

1. **The staging stage could never pass.** The verifier looked for an EAS
   profile literally named `staging`, but the staging APK is built from the
   **`preview`** profile (`eas build -p android --profile preview`, runbook
   line 61). `pnpm release:verify --env staging` therefore always reported
   *"the staging profile is missing from eas.json"* — a false negative that
   would have blocked a correctly-built staging release. The verifier now
   maps the environment to the profile name it is actually built from
   (`local → dev`, `staging → preview`, `production → production`).

2. **The certificate-pinning assertion passed on a placeholder.** The
   production pin set was checked by counting the comma-separated entries,
   and `<sha256-pin-set>` splits into exactly **one** entry — so a
   production profile that pinned *nothing* satisfied the assertion and
   the release gate reported success. The assertion now rejects an
   unresolved placeholder outright, and requires **at least two** digests:
   a single pin with no backup is a permanent lockout risk, because the
   rotation procedure requires the next certificate's digest to ship
   *before* the old one expires.

A third gap was closed alongside them: the placeholder check only examined
`EXPO_PUBLIC_SUPABASE_URL`. A profile with a real URL but a placeholder
**anon key** would have built an APK that authenticates against nothing
and passed the gate. Every env value in the profile is now checked.

### Verification

The gate's behaviour was proved in both directions, not just observed:

- With the committed placeholders in place, `--env local` passes all five
  assertions and `--env staging` / `--env production` fail on the
  placeholder — the correct outcome, because the hosted credentials are
  not yet supplied.
- With real-shaped values substituted temporarily (a plausible project ref,
  a plausible anon key, a two-digest pin set), `--env staging` and
  `--env production` **both** pass all five assertions. The file was
  restored immediately afterwards, and `git diff` confirms only the `dev`
  anon key differs from the committed file.

`--env local` reports 34 migrations, matching the repo's
`supabase/migrations/` exactly.

## Dependencies

### Requires
- Unit `001-foundation` — the pnpm workspace, the `eas.json` skeleton this story fills in, the `app.config.ts` this story adds `extra.eas.projectId` and `android.package` to, and the CI workflow's reserved build/release job
- Unit `001-foundation` story `004-mobile-app-shell` — the Android-only app id convention, the `EXPO_PUBLIC_*` env-var reading convention, and the `.env.example` contract
- Unit `001-foundation` story `005-admin-skeleton-and-ci` — the CI workflow this story's build job attaches to, and the repository-level secret-scan test that already guards `apps/mobile`
- `007-secrets-and-environments` — the env-var placement matrix that decides which variables EAS may hold (and, by omission, that it may not hold the service-role key)

### Enables
- `005-ci-pipeline` — the nightly `main` EAS build job that consumes these profiles and the artifact scan that inspects their output
- `006-release-runbook` — the Build, Dev, Staging, Prod, and Verify stages that call `eas build --profile preview` / `--profile production` and `adb install`
- `007-secrets-and-environments` — the "never in a bundle" invariant, whose mechanical proof is the scan over the APK this story produces

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The `preview` APK is installed over an existing `dev` build | `adb install -r` succeeds — all three profiles share one package id and one signing lineage, so the install replaces cleanly |
| A production APK is installed over a preview APK | `adb install -r` succeeds and the app now points at the production backend; the env vars are baked in at build time, so the replacement is the whole update mechanism |
| The EAS build is queued for hours | The runbook accounts for the queue time before the release is scheduled; the build is not "discovered" against the quota |
| The EAS free-tier monthly build quota is exhausted | The build fails with a quota error before the build starts; the runbook's monitor stage checks the remaining quota, and the staging build is sequenced ahead of the production build |
| The API host's certificate is rotated | The pin set carries a **backup pin** for the next certificate, and the pin set is updated in the EAS production profile **before** the rotation lands; the release verification asserts the new pin is present before the production build ships |
| The pin set is missing from the production profile | The release verification fails the Prod → Verify stage: a release build with no pinning is a hard stop (FR-DATA-2), not a warning |
| The OSM tile server rotates its certificate | Nothing breaks — only the **API host** is pinned; the tile CDN stays in system-trust mode, and the map continues to load |
| A developer on the `dev` profile hits a rotated certificate | Nothing breaks — the dev profile carries no pinning config, so the pinning code path is inert |
| `EXPO_PUBLIC_SMS_OTP_ENABLED` is set to `true` by mistake | The artifact scan fails the build on the embedded value — no profile may enable the SMS path because no provider is funded |
| A developer adds `SUPABASE_SERVICE_ROLE_KEY` to an EAS profile's `env` | EAS would not inline it (it lacks the `EXPO_PUBLIC_` prefix), but the artifact scan and the `eas.json` lint rule fail the build: the key is never an EAS build env var at all |
| The service-role key is referenced from `apps/mobile` code | The repository secret-scan test and the artifact scan both fail; the key cannot reach a bundle from either direction |
| The emulator has an older `dev` client installed with a different signature | `adb uninstall com.nagarshield.app` then `adb install` resolves it; the runbook documents the uninstall step so a signature mismatch is never a release blocker |
| The APK is transferred to a device by file share instead of `adb` | The install still works through the device's package installer; the runbook documents both paths because sideloading by file share is a first-class Phase-1 distribution method |
| A third-party analytics SDK is added to the mobile app | The artifact scan fails the build on the SDK name — no analytics or ad SDK may be integrated anywhere in the pipeline (FR-DATA-5) |
| The build runs with no `EXPO_PUBLIC_SUPABASE_URL` in the profile | The build fails fast with a missing-env error rather than producing an APK that boots against `undefined`; the profiles always carry all three `EXPO_PUBLIC_*` values |

## Out of Scope

- iOS builds, AAB output, and App Store configuration — out of scope for Phase 1 (Android + sideloaded APK only)
- Google Play Store listing, signing, upload, review, and release — explicitly excluded; no release step may block on one
- Play internal app sharing, Play device testing tracks, and release signing keys
- The nightly `main` EAS build job and the Maestro smoke subset — story `005-ci-pipeline` (`.github/workflows/build.yml`)
- The release progression, the per-stage verification commands, and the rollback note — story `006-release-runbook`
- The env-var placement matrix and the rotation procedure — story `007-secrets-and-environments`
- The `tools/secret-scan.ts` implementation itself — story `005-ci-pipeline` / `007-secrets-and-environments`; this story only produces the artifact it scans
- EAS Update / OTA updates, expo-updates channels, and runtime version rollouts
- The map tile caching policy and the MapLibre wrapper — unit `006`
- Push notifications, FCM, analytics, and crash reporting (Sentry) — out of scope for Phase 1

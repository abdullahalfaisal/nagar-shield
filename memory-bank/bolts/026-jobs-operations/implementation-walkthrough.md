---
stage: implement
bolt: 026-jobs-operations
created: 2026-11-05T14:30:00Z
---

## Implementation Walkthrough: build and ci

### Summary

The Nagar Shield app is now buildable from one committed definition and
gated by a CI pipeline that fails a pull request on any defect. Three EAS
profiles produce installable Android APKs, each pointed at the right
backend; the production profile alone pins the API host. The CI workflow
runs lint, typecheck, the unit suites, a local migration dry-run, the RLS
integration checks, and the artifact secret scan in a fixed dependency
order, with no job allowed to fail silently.

### Structure Overview

`eas.json` at the repository root holds the three build profiles.
`apps/mobile/app.json` stays the readable, committed base config;
`apps/mobile/app.config.ts` layers the build-time-only values on top and
registers the pinning plugin. `apps/mobile/plugins/withCertPinning.js` is
the one custom config plugin — it writes the Android network-security XML
during prebuild. `.github/workflows/ci.yml` holds the PR gate and
`.github/workflows/build.yml` the nightly smoke build. The two verification
tools live under `tools/`: the artifact scan and the per-stage release
harness.

### Completed Work

- [x] `eas.json` - the three build profiles, the APK output type, the
      shared Android package, the production `versionCode`, the per-profile
      env blocks, and the SMS OTP flag off in every profile.
- [x] `apps/mobile/app.json` - the committed base config: the package, the
      plugins list, the cleartext-traffic block, and the splash and icon
      assets.
- [x] `apps/mobile/app.config.ts` - the dynamic config: the EAS project id,
      the Android package, the `versionCode`, the `extra.eas.projectId`
      block, and the pinning plugin registration.
- [x] `apps/mobile/plugins/withCertPinning.js` - the pinning plugin: the
      manifest cleartext block, the network-security XML writer, the pin
      parser, and the pin-set expiry.
- [x] `apps/mobile/.env.example` - the mobile app's public variables, with
      no service-role key.
- [x] `.github/workflows/ci.yml` - the PR gate: the job graph, the pinned
      toolchain, the frozen-lockfile installs, and the fork-safe
      permissions.
- [x] `.github/workflows/build.yml` - the nightly preview-APK build, the
      artifact scan, and the Maestro panic-path subset.
- [x] `tools/secret-scan.cjs` - the artifact scan over the sources, the
      bundles, and the EAS profiles.
- [x] `tools/release-verify.cjs` - the five-assertion per-stage release
      harness.
- [x] `package.json` - the `secret:scan`, `release:verify`, and `purge:dry-run`
      scripts, and a `verify` script that chains the whole gate.

### Key Decisions

- **The pinning ships as a custom plugin, not a build-properties flag.**
  `expo-build-properties` exposes no `networkSecurityConfig` option, so the
  network-security XML is written by a plugin during prebuild. The pin set
  is read from the environment, so the same source produces an unpinned dev
  build and a pinned production build.

- **Only the API host is pinned.** The OSM tile CDN and the EAS update
  server stay in the default system-trust mode — pinning a third-party CDN
  breaks the map on every certificate rotation.

- **The secret scan runs on a pattern list, not a live secret value.** A
  fork pull request therefore never receives the key, and the scan still
  catches a leaked key by its shape. The scan prints the file and the
  pattern, never the matched value.

- **`verify_jwt` is written out per function in `supabase/config.toml`.**
  The CLI default flipped between versions, and a silent flip would break
  the scheduler: the job functions are called with the service-role
  credential, which is a secret key rather than a signed JWT. The posture
  is explicit rather than inherited.

- **The nightly build is scheduled, not triggered.** An EAS build consumes
  the free-tier quota, so it runs once a day and never on a pull request.
  The PR path is lint, typecheck, tests, migrations, RLS, and the scan.

### Deviations from Plan

- The plan named `test-report.md` as an expected output. The bolt type's
  stage 3 artifact is `test-walkthrough.md`, and that is what was written —
  the bolt type governs the artifact naming.

- The plan assumed `tools/secret-scan.ts`. The repository's `tools/` scripts
  are CommonJS `.cjs` files, so the scan is `tools/secret-scan.cjs` and
  follows the existing convention.

### Dependencies Added

- [x] `fs-extra` - the specsmd `bolt-complete.cjs` script requires it and
      it was missing from the workspace.
- [x] `js-yaml` - the specsmd `bolt-complete.cjs` script requires it and
      it was missing from the workspace.

### Developer Notes

- The EAS project id and the pin set are **placeholders** in the committed
  `eas.json`. `pnpm release:verify --env production` fails on an
  unresolved placeholder — that is deliberate. A build made from the
  placeholder would ship a dead API URL, so the harness treats it as a
  release blocker rather than a pass.
- `apps/mobile/app.config.ts` reads `config.config`, not `config.exp`. The
  Expo SDK 58 `ConfigContext` type carries the base config under `config`.
- The `withCertPinning` plugin is JavaScript, not TypeScript — the Expo
  config plugin loader evaluates it directly and does not type-check it.

---
id: 003-bundled-station-hotline-dataset
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 003-bundled-station-hotline-dataset

## User Story

**As a** Nagar Shield user
**I want** the emergency numbers, hotline list, and station directory to be part of the app itself
**So that** the help surfaces work with no network at all, even when I am offline or the server is unreachable

## Acceptance Criteria

- [ ] **Given** the curated Dhaka station and hotline JSON in the repository, **When** the app is built, **Then** the same JSON payload is imported into the app bundle and the bundle's copy is byte-identical to the repository copy for that release
- [ ] **Given** the device has no network, **When** the hotline list and the emergency numbers are rendered, **Then** they render in full from the bundled dataset and zero network requests are made
- [ ] **Given** the dial path, **When** a help card is tapped and confirmed, **Then** the number is read from the bundled dataset and no request, retry, or timeout occurs between the card tap and the `ACTION_DIAL` intent
- [ ] **Given** the bundled dataset, **When** the release is mirrored into Postgres, **Then** the `stations` and `hotlines` rows are regenerated from that same JSON by one mirror/refresh script and a test asserts the mirror matches the bundle for the same release
- [ ] **Given** a refresh run, **When** the curator edits the repo JSON, **Then** re-running the mirror script regenerates the Postgres rows from the JSON rather than patching them, and retired entries are marked `is_active = false` rather than deleted
- [ ] **Given** the bundled dataset's size, **When** the APK is built, **Then** the dataset adds less than 100 KB to the APK size
- [ ] **Given** the dataset refresh cadence, **When** a release is cut, **Then** the dataset changes only through the quarterly curator refresh and never at runtime; there is no in-app hot-patch or remote override of the bundled numbers
- [ ] **Given** a bundled JSON entry with a missing required field, **When** the bundle is validated at build time, **Then** the build fails with the offending file, entry id, and field named, and the release does not ship an invalid dataset
- [ ] **Given** the Postgres mirror, **When** a client queries `stations` or `hotlines`, **Then** only rows with `is_active = true` are returned to the public anon key, and the service-role key never reaches the client bundle
- [ ] **Given** a hotline entry, **When** it is read from the bundled dataset, **Then** it carries its service name, name in Bangla, phone, category, description, `sort_order`, and the `last_verified_at` curator stamp used for the quarterly audit

## Technical Notes

- **The repo JSON is the single source of truth.** `stations.json` + `hotlines.json` in the repository are the curated payload. Postgres **mirrors** it; the app bundle **ships** it. One script regenerates both, so a release can never ship a bundle that disagrees with the server.
- **Three artefacts, one generator.** The quarterly refresh regenerates (a) the bundled JSON imported by the mobile app, (b) the Postgres mirror, and (c) the `last_verified_at` curator stamp. There is no hand-written seed that can drift from the JSON.
- **Entity shapes** (`stations`, `hotlines`): `stations` = `id` uuid PK, `station_type` enum `police|hospital|fire`, `name`, `name_bn`, `phone`, `lat`, `lng`, `address`, `is_active`, `created_at`; `hotlines` = `id` uuid PK, `name`, `name_bn`, `phone`, `category`, `description`, `sort_order`, `is_active`, `last_verified_at`.
- **`stations.station_type` uses `hospital`, not `medical`.** The Help card label is "মেডিকেল / Medical" (the emergency number `999`); the station entity is a physical hospital. The card label and the dataset enum stay distinct.
- **Fire is `102` everywhere, including the dataset.** A `fire` station row exists for the Find-a-station map only; the Fire help card always prefills `102` and never a station number. Nearest-fire-station routing is FR-NG-9, Phase 2 only.
- **PostGIS on `stations`.** A `geography(Point,4326)` column with a GiST index makes the 10 km lookup a `ST_DWithin` query rather than an app-side haversine over ~60 rows.
- **Public read, RLS as the authorization mechanism.** `stations` and `hotlines` are publicly readable with the anon key under RLS; the service-role key never reaches the client bundle.
- **Zero-network dial path (ADR-003).** The panic path makes no server call at all; the numbers are bundled, and the `ACTION_DIAL` intent is fired after explicit confirmation.
- **Quarterly refresh, not hot-patching.** The dataset changes with an app release, not at runtime. The refresh is a curated, audited operation — `last_verified_at` on each hotline is what makes it auditable.
- **Volume and retention.** ~60 station rows and ~12 hotline rows; the bundle is tens of KB; rows are retained indefinitely and retired via `is_active = false`.
- **No user-generated content in the dataset.** The wrong-number workflow is a *separate* write path (`wrong_number_reports`), never an in-place edit of the curated JSON.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` Zod schemas for the station / hotline shapes, `ApiErrorCode`, the typed Supabase client, and the i18n key contract
- `supabase/migrations/0002_help_seek.sql` — the `stations` and `hotlines` tables, the PostGIS `geography` column and GiST index, and their public-read RLS policies

### Enables
- `001-home-and-help-alert-grid` — the bundled emergency numbers the Help Alert cards render and dial
- `005-more-help-and-hotlines` — the curated hotline list rendered from the bundle
- `006-thana-line-fallback` — the station rows the `nearest_thana` lookup reads
- `007-find-a-station-map` — the station markers and phone numbers shown on the map
- `008-wrong-number-report` — the `entry_type` + `entry_id` references the report stores
- Unit `007-moderation` — the curator's quarterly refresh of the mirror from this JSON
- Unit `008-jobs-operations` — the release pipeline and the quarterly dataset refresh job

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The device is in airplane mode and the app is cold-started | The dataset is read from the bundle, the Help Alert cards and hotline list render in full, and the dial path works with zero requests |
| The repo JSON and the Postgres mirror disagree | The mirror/refresh test fails for that release; the mirror is regenerated from the JSON, never hand-edited |
| A curator removes a hotline from the JSON | The mirror keeps the row but sets `is_active = false`; the app's next release no longer shows it, and the retired row remains for the audit trail |
| A hotline's `last_verified_at` is older than one quarter | The curator's refresh report lists it as due for verification; the app still ships the last verified number rather than dropping the service |
| A station's coordinates are null or out of Bangladesh's bounds | The build-time dataset validation fails with the offending entry id and field, and the release is blocked |
| A hotline number is stored with spaces or dashes | The dataset is normalised to digits plus an optional leading `+` at authoring time so the value is directly usable by the dialer sanitiser |
| The app bundle and the server were built from different releases | The release-time mirror test fails; the two are only ever shipped from one generator run |
| Two stations share the same name in different thanas | Both are kept as distinct rows; the display name is disambiguated with the address, not by renaming the row |
| The bundle exceeds the 100 KB size budget | The release build fails the size check and the dataset is split or the payload trimmed before shipping |

## Out of Scope

- The Help Alert card UI and the dialer confirmation — `001-home-and-help-alert-grid`
- The Personal Emergency picker — `002-personal-emergency-picker`
- The More Help sheet and hotline list UI — `005-more-help-and-hotlines`
- The `nearest_thana` RPC and the 10 km → `999` fallback — `006-thana-line-fallback`
- The Find-a-station map surface — `007-find-a-station-map`
- The wrong-number report write path and curator triage UI — `008-wrong-number-report` and unit 007
- Editing the curated dataset by users at runtime — reports are collected, not applied
- Live fetching of hotline or station data from any third-party API

## Implementation

**The curated dataset ships, the Postgres mirror is generated from it, and the offline dial path makes zero network requests. The story is not `complete` because eight of its ten acceptance criteria name an assertion that was never built.**

### What ships

- The repo JSON is the single source of truth: `packages/shared/src/data/stations.json` and `hotlines.json`. The mobile app imports the same payload through the `@nagar-shield/shared` workspace link (`apps/mobile/node_modules/@nagar-shield/shared` is a symlink to `packages/shared`), so Metro bundles the very same files — there is no copy step that *could* drift.
- The emergency numbers and the hotline list render offline: `apps/mobile/app/(app)/more-help.tsx:45` reads `HOTLINES` from the bundle and `app/(app)/station-map.tsx:72` reads `STATIONS`. Neither path uses `useQuery` or the Supabase client.
- The dial path is genuinely zero-network: `apps/mobile/src/shared/services/dialer.ts:14-24` is `Linking.canOpenURL` → `openURL('tel:…')`, and `apps/mobile/src/shared/services/dialPath.test.ts:77-85` asserts `expect(fetchSpy).not.toHaveBeenCalled()` while `dialPath.test.ts:66-75` asserts no `ACTION_CALL` intent is fired.
- The mirror regenerates rather than patches: `tools/mirror-reference-data.cjs` emits `insert … on conflict (id) do update set … is_active = excluded.is_active` (lines 215-223, 232-240) and contains **no `delete` statement**. `is_active boolean not null default true` carries the comment *"Retired entries are flagged, never deleted"* (`supabase/migrations/20261105000001_initial_schema.sql:318,336`), and the app filters retired rows (`packages/shared/src/data/index.ts:67`).
- `pnpm data:check` passes today: `✓ Dataset size 14.0 KB`, `✓ supabase/seed.sql matches the JSON`, `✓ The Postgres mirror matches the JSON`. It runs in CI at `.github/workflows/ci.yml:259-260`.
- Public anon-key reads return only active rows: `supabase/migrations/20261105000002_rls_policies.sql:295-305` creates `using (is_active)` policies for both tables, verified live against the running stack.
- Every hotline carries all seven fields — `name`, `nameBn`, `phone`, `category`, `description`, `sortOrder`, `lastVerifiedAt` — enforced by `hotlineEntrySchema` (`packages/shared/src/data/index.ts:30-40`) and surfaced at `apps/mobile/app/(app)/more-help.tsx:84-86` via `formatVerifiedStamp` / `isVerificationStale`.

### The gaps, criterion by criterion

**AC1 — no byte-identity test.** The bundle copy is the repo copy (the symlink makes this true), so the *outcome* holds. The criterion's mechanism — a copy that *could* drift, with a test that proves it has not — does not exist. Nothing would fail if a second copy of the JSON were ever added.

**AC2 — the zero-request assertion covers the dial path, not the hotline list.** `dialPath.test.ts` proves the dialler makes no request. No test renders the hotline list or the station list and asserts that no request is made.

**AC3 — the help cards hardcode the numbers instead of reading them from the bundle.** The criterion says *"the number is read from the bundled dataset"*. `apps/mobile/app/(app)/help-alert.tsx:95-96, 103-104, 111-112` hardcode `number="999"`, `dial('999')`, and `dial('102')`. The bundle's own `EMERGENCY_NUMBERS` (`packages/shared/src/data/index.ts:85-89`) is **imported nowhere in `apps/mobile`** — the only importer is `packages/shared/src/data/data.test.ts`. The values agree today, but they are not read from the dataset, so a change to the JSON would not reach the dial path.

**AC4 — the drift check compares row IDs, not values.** `tools/mirror-reference-data.cjs:294-330` selects `name|phone|lat|lng|is_active` from the live tables and then compares **only the id set** — `expectedStationIds.has(id)` / `expectedHotlineIds.has(id)`. A mirrored row with a **wrong phone number** passes the check. The criterion says *"a test asserts the mirror matches the bundle for the same release"*; the current check asserts the mirror has the same *rows*, not the same *values*. The script is also a bare `.cjs` with no jest coverage.

**AC5 — the retirement path is never exercised.** The mirror's regeneration semantics and the `is_active = false` flag are both implemented, but no JSON entry currently has `isActive: false`, so the path never runs. Worse: if a curator **removes** an entry from the JSON, `checkDrift` reports *"row X exists in the database but not in the JSON"* as drift and the script **has no deactivation step** — the retired row stays `is_active = true` in Postgres. The criterion says *"retired entries are marked `is_active = false` rather than deleted"*; that only happens if the curator marks the entry inactive in the JSON rather than removing it.

**AC6 — the size check measures the source JSON, not the APK.** `tools/mirror-reference-data.cjs:113-124` enforces `MAX_BUNDLE_BYTES = 100 * 1024` on the two JSON files (14.0 KB actual), which is a reasonable proxy, but the criterion says *"the dataset adds less than 100 KB to the **APK** size"*. `.github/workflows/build.yml` builds the APK and scans it for secrets but **never measures its size**.

**AC7 — MET.** The dataset is a compile-time import with no override mechanism, and the wrong-number path writes to a separate `wrong_number_reports` table rather than mutating curated rows.

**AC8 — the app-build-time validator names an array index, not the entry id.** Two validation paths exist. `tools/mirror-reference-data.cjs:42-110` (`validateDataset`) names the file, the entry id, and the field — ``${where}: entry "${entry.id}" is missing required field "${field}"}`` — and also validates coordinate bounds (lines 66-76); it runs in `--check` (CI) and `--write-seed`. But the path that actually gates the **app** build is the Zod parse at module load, `packages/shared/src/data/index.ts:61-62`, whose error reads `path: "stations.0.phone"` — an **array index, not the entry id** — with no file name. The descriptive message exists in the CI tool; the app build fails with the useless message.

**AC9 — MET.** RLS `using (is_active)` for both tables, verified live; and no service-role material anywhere in `apps/mobile`, `apps/admin`, or `packages/shared`, enforced by `tools/secret-scan.cjs` and `tools/release-verify.cjs:87-113`.

**AC10 — MET.** All seven fields present, schema-enforced, and surfaced in the UI.

### What closing this needs

1. `checkDrift` compared **values**, not just row ids — so a mirrored row with the wrong phone number fails.
2. The help cards to read `EMERGENCY_NUMBERS` from `@nagar-shield/shared` instead of hardcoding `999` and `102`.
3. The Zod error to name the **entry id** and the file, so a bad dataset fails the app build with an actionable message.
4. A build-time size check on the actual APK, not the source JSON.
5. A retirement test — a fixture with `isActive: false` proving the mirror sets `is_active = false` rather than deleting the row — and a deactivation step for entries removed from the JSON.
6. An offline-render test for the hotline list that asserts zero requests, matching the one that already exists for the dial path.
Zod parse at module load, `packages/shared/src/data/index.ts:61-62`, whose error reads `path: "stations.0.phone"` — an **array index, not the entry id** — with no file name. The descriptive message exists in the CI tool; the app build fails with the useless message.

**AC9 — MET.** RLS `using (is_active)` for both tables, verified live; and no service-role material anywhere in `apps/mobile`, `apps/admin`, or `packages/shared`, enforced by `tools/secret-scan.cjs` and `tools/release-verify.cjs:87-113`.

**AC10 — MET.** All seven fields present, schema-enforced, and surfaced in the UI.

### What closing this needs

1. `checkDrift` compared **values**, not just row ids — so a mirrored row with the wrong phone number fails.
2. The help cards to read `EMERGENCY_NUMBERS` from `@nagar-shield/shared` instead of hardcoding `999` and `102`.
3. The Zod error to name the **entry id** and the file, so a bad dataset fails the app build with an actionable message.
4. A build-time size check on the actual APK, not the source JSON.
5. A retirement test — a fixture with `isActive: false` proving the mirror sets `is_active = false` rather than deleting the row — and a deactivation step for entries removed from the JSON.
6. An offline-render test for the hotline list that asserts zero requests, matching the one that already exists for the dial path.
Zod parse at module load, `packages/shared/src/data/index.ts:61-62`, whose error reads `path: "stations.0.phone"` — an **array index, not the entry id** — with no file name. The descriptive message exists in the CI tool; the app build fails with the useless message.

**AC9 — MET.** RLS `using (is_active)` for both tables, verified live; and no service-role material anywhere in `apps/mobile`, `apps/admin`, or `packages/shared`, enforced by `tools/secret-scan.cjs` and `tools/release-verify.cjs:87-113`.

**AC10 — MET.** All seven fields present, schema-enforced, and surfaced in the UI.

### What closing this needs

1. `checkDrift` compared **values**, not just row ids — so a mirrored row with the wrong phone number fails.
2. The help cards to read `EMERGENCY_NUMBERS` from `@nagar-shield/shared` instead of hardcoding `999` and `102`.
3. The Zod error to name the **entry id** and the file, so a bad dataset fails the app build with an actionable message.
4. A build-time size check on the actual APK, not the source JSON.
5. A retirement test — a fixture with `isActive: false` proving the mirror sets `is_active = false` rather than deleting the row — and a deactivation step for entries removed from the JSON.
6. An offline-render test for the hotline list that asserts zero requests, matching the one that already exists for the dial path.
Zod parse at module load, `packages/shared/src/data/index.ts:61-62`, whose error reads `path: "stations.0.phone"` — an **array index, not the entry id** — with no file name. The descriptive message exists in the CI tool; the app build fails with the useless message.

**AC9 — MET.** RLS `using (is_active)` for both tables, verified live; and no service-role material anywhere in `apps/mobile`, `apps/admin`, or `packages/shared`, enforced by `tools/secret-scan.cjs` and `tools/release-verify.cjs:87-113`.

**AC10 — MET.** All seven fields present, schema-enforced, and surfaced in the UI.

### What closing this needs

1. `checkDrift` compared **values**, not just row ids — so a mirrored row with the wrong phone number fails.
2. The help cards to read `EMERGENCY_NUMBERS` from `@nagar-shield/shared` instead of hardcoding `999` and `102`.
3. The Zod error to name the **entry id** and the file, so a bad dataset fails the app build with an actionable message.
4. A build-time size check on the actual APK, not the source JSON.
5. A retirement test — a fixture with `isActive: false` proving the mirror sets `is_active = false` rather than deleting the row — and a deactivation step for entries removed from the JSON.
6. An offline-render test for the hotline list that asserts zero requests, matching the one that already exists for the dial path.
Zod parse at module load, `packages/shared/src/data/index.ts:61-62`, whose error reads `path: "stations.0.phone"` — an **array index, not the entry id** — with no file name. The descriptive message exists in the CI tool; the app build fails with the useless message.

**AC9 — MET.** RLS `using (is_active)` for both tables, verified live; and no service-role material anywhere in `apps/mobile`, `apps/admin`, or `packages/shared`, enforced by `tools/secret-scan.cjs` and `tools/release-verify.cjs:87-113`.

**AC10 — MET.** All seven fields present, schema-enforced, and surfaced in the UI.

### What closing this needs

1. `checkDrift` compared **values**, not just row ids — so a mirrored row with the wrong phone number fails.
2. The help cards to read `EMERGENCY_NUMBERS` from `@nagar-shield/shared` instead of hardcoding `999` and `102`.
3. The Zod error to name the **entry id** and the file, so a bad dataset fails the app build with an actionable message.
4. A build-time size check on the actual APK, not the source JSON.
5. A retirement test — a fixture with `isActive: false` proving the mirror sets `is_active = false` rather than deleting the row — and a deactivation step for entries removed from the JSON.
6. An offline-render test for the hotline list that asserts zero requests, matching the one that already exists for the dial path.

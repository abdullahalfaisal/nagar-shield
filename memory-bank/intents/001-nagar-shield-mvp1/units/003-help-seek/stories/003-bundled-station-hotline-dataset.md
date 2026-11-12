---
id: 003-bundled-station-hotline-dataset
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
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

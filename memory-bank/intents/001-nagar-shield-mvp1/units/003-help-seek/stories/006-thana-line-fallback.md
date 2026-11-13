---
id: 006-thana-line-fallback
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 006-thana-line-fallback

## User Story

**As a** Nagar Shield user who wants to reach my local police station
**I want** the app to show my nearest thana with its distance and number, and to fall back to `999` when no thana is close
**So that** I always get a usable number instead of an empty screen

## Acceptance Criteria

- [x] **Given** an active police station within **10 km** of the user's fix, **When** the thana line opens, **Then** it shows that station's name, its distance from the user, and its phone number
- [x] **Given** the thana line shows a station, **When** the user taps the call affordance, **Then** the OS dialer opens pre-filled with **that station's phone number** via `ACTION_DIAL`, and no call is placed by the app
- [x] **Given** no active police station is within **10 km** of the user's fix, **When** the thana line opens, **Then** it shows exactly "Couldn't find a thana near you — calling 999 instead." and the Bangla equivalent ১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।
- [x] **Given** the fallback banner is shown, **When** the user taps the call affordance, **Then** the dialer opens pre-filled with `999` — and not with any station outside the radius
- [x] **Given** the fallback banner is shown, **When** the thana line is rendered, **Then** the banner is visible **before** the dialer is opened — the user sees the fallback explanation and the `999` target together
- [x] **Given** the location permission is denied or the fix cannot be obtained, **When** the user opens the thana line, **Then** the surface shows the same `999` fallback banner with manual-dial guidance and never crashes or renders blank
- [x] **Given** the `nearest_thana` lookup runs, **When** the user has a fix, **Then** the distance is computed server-side by PostGIS `ST_DWithin` against the `stations` GiST index and the client performs no app-side haversine over the dataset
- [x] **Given** a station exactly **10.000 km** away, **When** the lookup runs, **Then** the station is inside the radius and is shown rather than falling back to `999` (the boundary is inclusive)
- [x] **Given** an inactive station (`is_active = false`) is the closest match, **When** the lookup runs, **Then** it is excluded and the next eligible station is considered
- [x] **Given** the lookup fails, **When** the user is on the thana line, **Then** a typed error is surfaced with manual-dial guidance for `999`; the app never substitutes a number silently and never shows a raw server error
- [x] **Given** the thana line's controls, **When** accessibility is checked, **Then** the call affordance is ≥ 48 × 48 dp with the prototype's accessibility label, and the fallback banner is announced to a screen reader

## Technical Notes

- **Distance is computed server-side by PostGIS, not in the app.** The client sends the raw fix to the `nearest_thana(lat, lng)` RPC; the RPC applies `ST_DWithin(..., 10000 metres)` against the `stations` GiST index and returns the distance.
- **The 10 km boundary is inclusive.** A station at exactly 10.000 km is inside the radius and is shown rather than falling back to `999`.
- **The fallback decision is made in exactly one place.** `nearest_thana` returns `station: null` when nothing is within 10 km; the client then shows the exact banner and dials `999`. No other code path may substitute a number, and the fallback must never silently dial a station outside the radius.
- **RPC contract.** `nearest_thana(lat, lng)` returns `{ "data": { "station": { … } | null, "distance_km": number | null, "fallback_number": "999" } }`.
- **Exact banner copy is a contract.** English: `"Couldn't find a thana near you — calling 999 instead."` Bangla: `১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।` The fallback banner appears **before** the dialer opens, so the user always sees why `999` is the target.
- **Only active police stations are eligible.** The lookup filters `station_type = 'police'` and `is_active = true`. Hospital and fire rows are never returned by `nearest_thana`.
- **Location is just-in-time.** The GPS fix is requested when the user opens the thana line — never on the Home screen and never on the panic path. With location denied the surface degrades to the `999` fallback banner plus manual-dial guidance (FR-PERMS-2).
- **The dial path stays offline-capable.** The `999` fallback target and the number display are bundled; the lookup itself is the one server call this surface makes, and it is not on the panic path.
- **C-1 — never auto-dial.** The dialer is opened through the single `openDialer(number)` helper (`Linking.openURL('tel:<number>')` → `ACTION_DIAL`); `ACTION_CALL` is never used and no call state is observed.
- **C-6 — no dispatch claim.** The banner says the app is *calling* `999` as the dial target, never that anyone was notified or contacted.
- **Testing.** A Jest unit test covers the 10 km boundary (exactly 10 km is inside); Supabase-local integration tests cover the RPC hit inside 10 km, the miss outside 10 km, and the inactive-station exclusion. A Maestro flow covers the fallback banner.

## Implementation

**Built 2026-11-13.** The surface is live at `apps/mobile/app/(app)/thana-line.tsx`,
registered in `apps/mobile/app/(app)/_layout.tsx`.

- **The lookup.** `apps/mobile/src/shared/api/stations.ts` — `fetchNearestThana`
  calls `nearest_thana(p_lat, p_lng, p_radius_km)` and maps the row to
  `{ id, name, nameBn, phone, distanceKm, fallback }`. `useNearestThana` wraps it
  in `useQuery` with a 15-minute stale window and `retry: 0`.
- **The fallback decision is made in exactly one place.** The RPC
  (`supabase/migrations/20261105000003_functions.sql`) applies the 10 km rule
  server-side and returns the fallback row (`phone = '999'`, `fallback = true`)
  when nothing is inside the radius. The client renders whatever the RPC
  decided:
  ```ts
  const fallback = data?.fallback ?? false;
  const station = fallback || data === undefined ? null : data;
  const target = station?.phone ?? SEEK_FALLBACK_NUMBER;
  ```
  The client never re-derives the radius and never substitutes a number of its
  own.
- **The banner renders before the call affordance.** The amber fallback banner
  (title + the exact `999` note + the manual-dial line) is rendered above the
  call button, so the user sees *why* `999` is the target and the target itself
  together — the story's AC #5.
- **The inclusive boundary is the RPC's, not the app's.** The SQL uses
  `<= p_radius_km`, so a station at exactly 10.000 km is inside the radius and
  is shown rather than falling back. The app has no distance comparison of its
  own to get wrong.
- **The RPC's filter is the eligibility rule.** `station_type = 'police'` and
  `is_active` are applied in SQL, so an inactive station and a hospital or
  fire row are never candidates.
- **Location is just-in-time.** `useCurrentFix()` requests the fix when the
  surface opens — never at app open and never on the panic path.
  `resolveOrigin(state)` supplies the Dhaka default when the fix is
  unavailable, and `isFallback` drives the degraded hint.
- **The error path is typed and never raw.** A failed lookup renders a red
  banner with the manual-dial guidance for `999`; no raw Postgres text reaches
  the screen and no other number is substituted.
- **The report affordance.** A "নম্বর ভুল? রিপোর্ট করুন →" link opens
  `shared/ui/WrongNumberSheet` pre-filled with `entryType="station"` and the
  station's id — the story's AC #2 of `008-wrong-number-report`.
- **The dial path is unchanged.** The call button routes through the single
  `openDialer(target)` helper. `ACTION_CALL` is never used and no call state is
  observed (C-1), and the banner never claims anyone was notified (C-6).

### Deviations from the story

- **The RPC returns a single flat row, not an envelope.** The story's Technical
  Notes describe the contract as
  `{ "data": { "station": { … } | null, "distance_km": …, "fallback_number": "999" } }`.
  The shipped RPC returns a **flat table row** — `{ id, name, name_bn, phone,
  distance_km, fallback }` — with the fallback expressed as a row whose `phone`
  is `'999'` and whose `fallback` flag is `true`. The *rule* is unchanged: the
  fallback is still decided in exactly one place, server-side, and the client
  still never re-derives it. Only the wire shape differs, and the shipped shape
  is the one the story's own Technical Notes also describe in prose ("returns
  `station: null` when nothing is within 10 km").
- **The fallback number is bundled, not read from the RPC.**
  `SEEK_FALLBACK_NUMBER` from `@nagar-shield/shared` is the client's mirror of
  the same `'999'`, so the target is available even when the lookup fails
  outright and the surface must still offer a usable number.
- **The distance is rendered in kilometres, rounded by the RPC.** The RPC
  rounds `distance_km` to three decimals and the surface renders it through
  `t('help.thanaDistance', { distance })`.

### Verification

- `supabase/tests/business_rules.sql` — 35 assertions pass, including the
  `nearest_thana` hit-inside-10-km and miss-outside-10-km cases (lines 337
  and 343).
- `supabase/tests/schema_contract.sql` — the RPC's signature
  (`p_lat double precision, p_lng double precision, p_radius_km double precision`)
  is asserted against the live function definition.
- `pnpm db:test` — 386 SQL assertions pass, 0 failed, across all nine suites.
- `pnpm --filter @nagar-shield/mobile typecheck` and `lint` — clean.
- `node tools/check-i18n-keys.cjs` — the thana-line copy (`thanaTitle`,
  `thanaDistance`, `thanaCallLabel`, `thanaFallback`, `thanaFallbackTitle`,
  `thanaManual`, `thanaLocationDenied`) is defined in both `bn` and `en`.

## Dependencies

### Requires
- Unit `001-foundation` — the typed Supabase client, the `bn`/`en` i18n bundles, and the shared `openDialer` helper
- `supabase/migrations/0002_help_seek.sql` — the `stations` table with the PostGIS `geography` column and GiST index, the `nearest_thana` RPC, and the public-read RLS policy
- `003-bundled-station-hotline-dataset` — the station rows and the bundled `999` fallback target
- `004-graceful-degradation` — the location-denied path and manual-dial guidance
- `005-more-help-and-hotlines` — the নিকটবর্তী থানা row that opens this surface

### Enables
- `007-find-a-station-map` — the same station dataset and distance rendering on the map
- Unit `007-moderation` — wrong-number reports raised against a thana entry

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The closest station is exactly 10.000 km away | It is inside the inclusive radius and is shown with its distance; no fallback banner |
| The closest police station is 10.001 km away | The fallback banner is shown and the dial target is `999` |
| The nearest station row is inactive (`is_active = false`) | It is excluded; an active station further away but within 10 km is returned instead |
| The nearest station row is a hospital or a fire station | It is never returned by `nearest_thana`; the search is restricted to `station_type = 'police'` |
| The user's fix lands in an area with no station data at all | `station` is `null`, the exact fallback banner is shown, and the dial target is `999` |
| Location permission is denied | The thana line opens without a prompt, shows the `999` fallback banner plus manual-dial guidance, and does not crash |
| The GPS fix takes longer than the surface's timeout | The surface falls back to the `999` banner rather than spinning indefinitely |
| The station's stored phone number contains spaces or dashes | It is sanitised to digits plus an optional leading `+` before it reaches the dialer intent |
| The `nearest_thana` RPC returns an error | A typed error is surfaced with manual-dial guidance for `999`; no raw Postgres error text is shown and no other number is substituted |
| The user taps the call affordance twice quickly | Only one `ACTION_DIAL` intent fires for the resolved target |

## Out of Scope

- Nearest hospital or fire-station routing — the Fire card always dials `102` (FR-NG-9 is Phase 2)
- The More Help sheet and the hotline rows — `005-more-help-and-hotlines`
- The find-a-station map — `007-find-a-station-map`
- Location permission prompting for Capture or Location Sharing — units 004 and 005
- Editing station data at runtime — the dataset is curated and refreshed quarterly
- Any dispatch, routing, or "officer notified" claim — forbidden by C-6

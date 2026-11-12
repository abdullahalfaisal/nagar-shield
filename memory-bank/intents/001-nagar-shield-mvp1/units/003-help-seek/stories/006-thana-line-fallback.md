---
id: 006-thana-line-fallback
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 006-thana-line-fallback

## User Story

**As a** Nagar Shield user who wants to reach my local police station
**I want** the app to show my nearest thana with its distance and number, and to fall back to `999` when no thana is close
**So that** I always get a usable number instead of an empty screen

## Acceptance Criteria

- [ ] **Given** an active police station within **10 km** of the user's fix, **When** the thana line opens, **Then** it shows that station's name, its distance from the user, and its phone number
- [ ] **Given** the thana line shows a station, **When** the user taps the call affordance, **Then** the OS dialer opens pre-filled with **that station's phone number** via `ACTION_DIAL`, and no call is placed by the app
- [ ] **Given** no active police station is within **10 km** of the user's fix, **When** the thana line opens, **Then** it shows exactly "Couldn't find a thana near you — calling 999 instead." and the Bangla equivalent ১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।
- [ ] **Given** the fallback banner is shown, **When** the user taps the call affordance, **Then** the dialer opens pre-filled with `999` — and not with any station outside the radius
- [ ] **Given** the fallback banner is shown, **When** the thana line is rendered, **Then** the banner is visible **before** the dialer is opened — the user sees the fallback explanation and the `999` target together
- [ ] **Given** the location permission is denied or the fix cannot be obtained, **When** the user opens the thana line, **Then** the surface shows the same `999` fallback banner with manual-dial guidance and never crashes or renders blank
- [ ] **Given** the `nearest_thana` lookup runs, **When** the user has a fix, **Then** the distance is computed server-side by PostGIS `ST_DWithin` against the `stations` GiST index and the client performs no app-side haversine over the dataset
- [ ] **Given** a station exactly **10.000 km** away, **When** the lookup runs, **Then** the station is inside the radius and is shown rather than falling back to `999` (the boundary is inclusive)
- [ ] **Given** an inactive station (`is_active = false`) is the closest match, **When** the lookup runs, **Then** it is excluded and the next eligible station is considered
- [ ] **Given** the lookup fails, **When** the user is on the thana line, **Then** a typed error is surfaced with manual-dial guidance for `999`; the app never substitutes a number silently and never shows a raw server error
- [ ] **Given** the thana line's controls, **When** accessibility is checked, **Then** the call affordance is ≥ 48 × 48 dp with the prototype's accessibility label, and the fallback banner is announced to a screen reader

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

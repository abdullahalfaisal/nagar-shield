---
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Help & Seek

## Purpose

Own the panic path. This unit builds the **Help Alert** surface — Police,
Medical, Fire, and Personal Emergency as four full-width **80 dp** help cards —
plus **More Help** (curated hotlines / thana line / find-a-station) one level
deeper, and the **Home layout composition** that carries them. Home *is* the
Help Alert surface: the four cards are the largest, highest-contrast elements
on the first screen, and the dial path from app open to a pre-filled OS dialer
is the fastest thing in the product.

The panic path is **client-only and zero-network**: the numbers live in the app
bundle, the `ACTION_DIAL` intent is fired after an explicit confirmation, and
the app never places a call, never observes call state, and never claims that
anyone was contacted. This unit also owns the curated station / hotline dataset
(the JSON in the repo is the source of truth; Postgres mirrors it), the
nearest-thana query with its 10 km → `999` fallback, and the wrong-number
report workflow that feeds the curator.

## Scope

### In Scope

- `supabase/migrations/0002_help_seek.sql` — `stations`, `hotlines`,
  `wrong_number_reports`, CHECK constraints, RLS policies, PostGIS geography
  column + GiST index on `stations`, and the `nearest_thana` RPC
- `nearest_thana(lat, lng)` RPC — nearest active police station within 10 km,
  with the `999` fallback surfaced to the client
- Curated dataset: `stations.json` + `hotlines.json` in the repo (Dhaka metro)
  as the **source of truth**, the Postgres mirror seed, and the **bundled copy
  imported into the app bundle** for the offline dial path
- `openDialer(number)` helper (`expo-linking`, `tel:` → Android `ACTION_DIAL`)
  — the single place in the app where a phone number reaches the OS, plus a
  guard that rejects anything other than `ACTION_DIAL`
- `confirmDial(surface, number)` — the confirmation sheet naming the exact
  number and displaying the measured `app_open_to_dialer_ms`
- `helpAlertTap(surface, number)` telemetry
- Mobile: **Home layout composition + Help Alert block** (the four 80 dp cards
  and the dashed More Help card), the Help Alert screen (screen 18), the More
  Help bottom sheet, the Personal Emergency contact-picker sheet, the Thana
  line surface, the Find-a-station map, the wrong-number report sheet, the
  Emergency Contacts list screen (screen 20), and the More Options hub
  (screen 15) rows owned by this unit
- `listPrimaryContacts()` for the Personal Emergency picker, and the
  `reportWrongNumber(entry_type, entry_id, reason, details)` write path
- i18n keys for every new string in `bn` (primary) and `en`

### Out of Scope

- Any server involvement in the dial path — the panic path makes **zero**
  network calls (ADR-003)
- Call placement, call outcome, or call-state observation — forbidden by C-1
  and by the FR-HELP-5 override (2026-10-12)
- The `identity` domain module: `profiles`, auth, and the
  `emergency_contacts` **schema / RLS / CRUD API** are unit 002's. This unit
  only *reads* contacts for the picker and renders screen 20
- The Alerts feed, the area chip row, the History screen and the History map
  read model (unit 006) — this unit owns the MapLibre wrapper that unit 006
  reuses for Find-a-station, and the Home slot unit 006 fills
- Capture, upload, and the offline upload queue (unit 004); one-shot location
  sharing (unit 005)
- The moderator console and the curator's verification queue UI (unit 007) —
  this unit only writes `wrong_number_reports` rows for that workflow
- Nearest-fire-station routing / per-station fire dispatch (FR-NG-9, Phase 2
  only). Fire is always `102`
- Charts / crime-statistics dashboards (excluded by FR-NG-3 / FR-NG-4 /
  ADR-010)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-HELP-1 | Five Home surfaces — four 80 dp help cards + one dashed More Help card | Must |
| FR-HELP-2 | Police → `999` | Must |
| FR-HELP-3 | Medical → `999` | Must |
| FR-HELP-4 | Fire → `102` | Must |
| FR-HELP-5 | Personal Emergency contact picker (first primary preselected, no auto-failover) | Must |
| FR-HELP-6 | OS dialer via `ACTION_DIAL`, never auto-dial | Must |
| FR-HELP-7 | Confirmation copy naming the exact number + `app_open_to_dialer_ms` | Must |
| FR-HELP-8 | Median app-open → dialer-prefilled < 12 s | Must |
| FR-SEEK-1 | More Help sheet with three categories (hotlines / thana line / find a station) | Must |
| FR-SEEK-2 | Curated hotline list, rendered from the bundled dataset | Must |
| FR-SEEK-3 | Thana line with the 10 km → `999` fallback | Must |
| FR-SEEK-4 | Find-a-station map (MapLibre + OSM) | Should |
| FR-SEEK-5 | Curated dataset shipped in the app bundle, refreshed quarterly | Must |
| FR-SEEK-6 | Wrong-number report → curator workflow | Should |
| FR-PERMS-2 | Help Alert still works with location denied (manual-dial guidance) | Must |
| FR-PERMS-3 | Battery-saver warning alongside the help action | Should |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `stations` | Curated Dhaka-metro stations — police thanas, hospitals, fire stations — mirrored from the repo JSON | `id` uuid PK, `station_type` enum `police\|hospital\|fire`, `name` text not null, `name_bn` text not null, `phone` text not null, `lat` double precision not null, `lng` double precision not null, `address` text, `is_active` boolean default true, `created_at` timestamptz default now() |
| `hotlines` | Curated non-emergency helplines (women & children, disaster, ambulance, electricity, mental health, anti-drug, cyber-crime), mirrored from the repo JSON | `id` uuid PK, `name` text not null, `name_bn` text not null, `phone` text not null, `category` text not null, `description` text, `sort_order` integer not null default 0, `is_active` boolean default true, `last_verified_at` timestamptz |
| `wrong_number_reports` | A citizen's report that a hotline or thana number is wrong; routed to the curator for next-refresh verification | `id` uuid PK, `entry_type` enum `station\|hotline`, `entry_id` uuid, `reported_by` uuid (nullable → `profiles.id`), `reason` text not null, `details` text, `status` enum `pending\|verified\|rejected` default `pending`, `created_at` timestamptz default now() |

Notes on the schema:

- `stations` gains a `geography(Point,4326)` column with a GiST index
  (`memory-bank/standards/data-stack.md`) so the 10 km lookup is a PostGIS
  `ST_DWithin` query rather than an app-side haversine over ~60 rows.
- `wrong_number_reports.entry_id` is **polymorphic** (`station` → `stations.id`,
  `hotline` → `hotlines.id`), so it cannot carry a plain FK. Integrity is
  enforced by a CHECK trigger that resolves the target against the table named
  by `entry_type`.
- `hotlines.last_verified_at` is the curator's verification stamp; it is what
  makes the quarterly refresh auditable.
- The **curated JSON in the repo is the source of truth**; the Postgres mirror
  is regenerated from it on each quarterly refresh. The app bundle ships the
  same JSON, so the offline list and the server list cannot drift within a
  release.

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `nearest_thana` | RPC — nearest **active police** station within 10 km of the given point, using PostGIS `ST_DWithin` over the `stations` GiST index. Returns the station + distance, or `null` when nothing is within 10 km so the client can apply the `999` fallback | `lat` double precision, `lng` double precision | `{ "data": { "station": { … } \| null, "distance_km": number \| null, "fallback_number": "999" } }` |
| `openDialer` | Opens the Android system dialer via `expo-linking` → `Linking.openURL('tel:<number>')`, which resolves to an `ACTION_DIAL` intent. **Never** `ACTION_CALL`; never observes call state | `number` string (digits / leading `+` only — sanitised before use) | `Result<void, AppError>` |
| `helpAlertTap` | Telemetry — records the tapped surface and the **exact number** being dialled (`police`/`medical`/`fire`/`personal`) | `surface` string, `number` string | telemetry event `help_alert_tap` |
| `confirmDial` | Shows the confirmation sheet naming the exact number and the measured `app_open_to_dialer_ms`; on confirm, calls `openDialer` | `surface` string, `number` string | sheet shown → intent fired → `app_open_to_dialer_ms` recorded |
| `listPrimaryContacts` | Reads the signed-in user's **primary** emergency contacts ordered by `sort_order` for the Personal Emergency picker; the first primary is preselected | auth session | `EmergencyContact[]` (unit 002's `emergency_contacts`, read-only) |
| `reportWrongNumber` | Persists a wrong-number report against a hotline or thana entry for curator verification | `entry_type` `station\|hotline`, `entry_id` uuid, `reason` text, `details` text | `{ "data": { "id": "…", "status": "pending" } }` |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 8 |
| Must Have | 6 |
| Should Have | 2 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-HELP-01 | Home surface + Help Alert panic grid + dialer confirmation (Police / Medical / Fire) | Must | Planned |
| US-HELP-02 | Personal Emergency contact picker sheet | Must | Planned |
| US-HELP-03 | Offline-capable bundled station / hotline dataset | Must | Planned |
| US-HELP-04 | Graceful degradation — location denied → manual dial guidance; battery saver → warning | Must | Planned |
| US-SEEK-01 | More Help sheet + curated hotline list | Must | Planned |
| US-SEEK-02 | Thana line with 10 km → `999` fallback | Must | Planned |
| US-SEEK-03 | Find-a-station map (MapLibre + OSM) | Should | Planned |
| US-SEEK-04 | Wrong-number report flow | Should | Planned |

> US-HELP-04 covers FR-PERMS-2 (Must) and FR-PERMS-3 (Should); the story is
> Must because its location-denied half is a Must. US-SEEK-03 and US-SEEK-04
> are Should because FR-SEEK-4 and FR-SEEK-6 are Should.

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | `packages/shared` contracts (station / hotline / wrong-number Zod schemas, `ApiErrorCode`, i18n key contract), the typed Supabase client, the Expo Router `(app)` group, the light/dark design tokens, `shared/ui` primitives (`BottomSheet`, `ListRow`, `Chip`, `TextField`), and `expo-linear-gradient` for the help cards |
| `002-identity` | `emergency_contacts` (owner-scoped read) for the Personal Emergency picker and screen 20; the session for `listPrimaryContacts()` and for stamping `wrong_number_reports.reported_by` |

### Depended By

| Unit | Reason |
|------|--------|
| `004-capture` | Drops the **ক্যাপচার** tile into the Home quick-action grid and owns the Capture route behind it |
| `005-location` | Drops the **লোকেশন শেয়ার** tile into the Home quick-action grid and shares the `expo-location` helper |
| `006-alerts` | Owns FR-UX-2 (Home composition acceptance) and drops the **Alerts feed** + area chip row into the Home feed slot; reuses the MapLibre wrapper this unit builds for Find-a-station |
| `007-moderation` | Reads `wrong_number_reports` in the curator / moderator workflow |
| `008-jobs-operations` | Needs the full schema for the release pipeline and the quarterly dataset refresh job |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Android OS dialer | Renders the pre-filled dialer; the OS places the call, not us | Low — but some OEM ROMs suppress `ACTION_DIAL` under power saving, hence FR-PERMS-3 |
| `expo-linking` (`tel:`) | Fires `ACTION_DIAL` | Low — must be the only number→OS path in the app |
| `expo-location` | One foreground GPS fix for the thana lookup and the map centre | Medium — permission may be denied (FR-PERMS-2) and the fix can be slow indoors; the dial path must not wait on it |
| MapLibre GL (`@maplibre/maplibre-react-native`) + OSM raster tiles | Find-a-station map | Medium — OSM public tile usage policy; attribution is mandatory and the map degrades to a bundled station list with no network |
| Supabase Postgres + PostgREST | `stations` / `hotlines` reads, `wrong_number_reports` writes, `nearest_thana` RPC | Low — none of these are on the dial path |
| Android OS power-save mode | Detects battery saver for FR-PERMS-3 | Low — `expo-battery` reads it via `isLowPowerModeEnabledAsync()` (`PowerManager.isPowerSaveMode`); a failed read degrades to `'unknown'` and the static copy, never to a claimed `'off'` |
| npm registry | Expo SDK, MapLibre RN, React Query, i18next | Low |

---

## Technical Context

### Suggested Technology

Expo SDK + Expo Router, `expo-linking` for the `tel:` / `ACTION_DIAL` intent,
`expo-location` for the GPS fix and distance, `expo-linear-gradient` for the
four card gradients, `@maplibre/maplibre-react-native` with OSM raster tiles for
Find-a-station, `@supabase/supabase-js` (typed, from unit 001) for PostgREST +
the `nearest_thana` RPC, `@tanstack/react-query` for the station / hotline
queries, `i18next` + `expo-localization` for `bn` / `en`, React Hook Form +
Zod resolvers for the wrong-number sheet, Jest + React Native Testing Library
for unit tests, Maestro for the Android E2E panic path, and Supabase local for
RLS / RPC integration tests.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Mobile → Android OS dialer | Native intent | `ACTION_DIAL` via `expo-linking` `Linking.openURL('tel:<number>')` — **never** `ACTION_CALL` |
| Mobile → `expo-location` | Native module | Foreground GPS fix → `nearest_thana(lat, lng)` |
| Mobile → Supabase PostgREST `/rest/v1/stations` | API | HTTPS — public read, `is_active = true` only |
| Mobile → Supabase PostgREST `/rest/v1/hotlines` | API | HTTPS — public read, ordered by `sort_order` |
| Mobile → Supabase PostgREST `/rest/v1/wrong_number_reports` | API | HTTPS — insert own row |
| Mobile → Supabase RPC `nearest_thana` | API | HTTPS — `POST /rest/v1/rpc/nearest_thana` |
| Mobile → MapLibre + OSM raster tiles | Native module + HTTPS | Free-tier-safe map; OSM attribution shown on every map surface |
| Mobile → bundled curated dataset | App bundle | Static JSON import — zero network |
| Mobile → `emergency_contacts` (unit 002) | API | HTTPS — owner-scoped read for the picker |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `stations` rows | Postgres table + mirrored bundled JSON | ~60 rows | Indefinite; refreshed quarterly, `is_active = false` retires a row |
| `hotlines` rows | Postgres table + mirrored bundled JSON | ~12 rows | Quarterly refresh; `last_verified_at` tracked |
| `wrong_number_reports` rows | Postgres table | Low volume | Retained until the curator closes the report at the next quarterly refresh |
| Bundled curated dataset | App-bundle JSON (imported at build time) | ~small (tens of KB) | Replaced by the next quarterly release |
| Dial-path state | None — the dial path performs zero network calls | 0 | n/a |
| `app_open_to_dialer_ms` | Device telemetry buffer | 1 event per dial | Flushed opportunistically; never blocks the dial path |

### Mobile Screens

Every surface below is a **1:1 port** of `docs/design/screen-spec.md` and
`docs/design/screen-help-alert.html`; no redesign, no additional chrome.

| Screen | Prototype spec | Story | Notes |
|--------|----------------|-------|-------|
| Home (Dashboard) | screen 14 | US-HELP-01 | **This unit owns the Home layout composition and the Help Alert block**; the search bar, quick-action grid and Alerts feed are other units' content (see Home Composition) |
| Help Alert | screen 18 | US-HELP-01, US-SEEK-01 | The four help cards + the More Help dashed card + the More Help bottom sheet — `docs/design/screen-help-alert.html` is the exact markup contract |
| More Options | screen 15 | US-HELP-01 | Nav hub: **জরুরি সেবা** → Help Alert, **সংরক্ষিত কন্টাক্ট** → screen 20; the remaining rows keep the prototype labels and route to the owning units (notifications → 006, settings / about / logout → 002) |
| Emergency Contacts | screen 20 | US-HELP-02 | Contact list + call action + the primary star toggle, rendered by this unit over unit 002's `emergency_contacts` API. The screen's "If no answer, it moves to the next primary" copy is **replaced** (see Notes) |
| Personal Emergency picker | new sheet (no prototype screen) | US-HELP-02 | Built from `shared/ui/BottomSheet`; lists primaries in `sort_order` with the first preselected; the "call next contact" affordance appears only after 25 s and is user-armed |
| Thana line | new sheet (no prototype screen) | US-SEEK-02 | Nearest station name + distance + phone, or the exact fallback banner |
| Find-a-station map | new surface (reuses the History map component) | US-SEEK-03 | MapLibre + OSM; station markers with name + number + call action |
| Wrong-number report | prototype `#wrong-number-dialog` | US-SEEK-04 | Amber `report` icon, title, helper text, textarea, **রিপোর্ট পাঠান** primary, **বাতিল** secondary, and the "রিপোর্ট পাঠানো হয়েছে" toast |

### Home Composition

**Home is the Help Alert surface.** Per FR-HELP-1 the Home viewport carries
exactly **four full-width 80 dp help cards** (Police / Medical / Fire / Personal
Emergency) plus **one More Help card** rendered as a dashed card one level
deeper. The four cards are the visually dominant elements on Home — the
largest, highest-contrast objects in the first screen (FR-UX-2, whose formal
acceptance sits with unit 006).

This unit owns the **Home layout composition** — the shell, the slot order, and
the Help Alert block — so that units 004 / 005 / 006 have an explicit place to
drop their content. The prototype's Home (screen 14) additionally carries a
search bar, a 6-tile quick-action grid, and the Alerts feed; those are **other
units' content inside this unit's layout**.

| Home slot | Content | Owner |
|-----------|---------|-------|
| App bar | Greeting + date + `more_horiz` (→ screen 15) + avatar | `003` (shell) / `002` (avatar + more options) |
| **Help Alert block** | **4 × 80 dp help cards + dashed More Help card** | **`003` — this unit, no exceptions** |
| Search bar | `এলাকা খুঁজুন...` | `006` (area search over the feed) — slot reserved by `003` |
| দ্রুত অ্যাকশন grid | 6 tiles: ক্যাপচার / হেল্প অ্যালার্ট / লোকেশন শেয়ার / ক্রাইম হিস্ট্রি / জরুরি কন্টাক্ট / আরও | `003` owns the grid shell **and** the **হেল্প অ্যালার্ট** tile (→ screen 18); `004` owns ক্যাপচার; `005` owns লোকেশন শেয়ার; `006` owns ক্রাইম হিস্ট্রি; `002` owns জরুরি কন্টাক্ট (→ screen 20) and আরও (→ screen 15) |
| Alerts feed | "Auto-refreshes every 60s" indicator + area chip row + alert cards | `006` — dropped into the feed slot below the grid |

Ordering rule for anyone editing Home: **the Help Alert block stays the first
and largest block.** A change that pushes the four cards below the fold, shrinks
them, or delays them is rejected (ARCHITECTURE rule 20 — panic path first).

---

## Constraints

- **C-1 — never auto-dial.** The app fires `ACTION_DIAL` and stops. The string
  `ACTION_CALL` must not appear in any source file, and no code path may read
  call state (no `TelephonyManager` / `PhoneStateListener` / `READ_PHONE_STATE`
  permission). `openDialer()` is the single, auditable number → OS path.
- **C-6 — no "emergency service" framing.** The app is a number-finder and a
  civic-information utility. No copy may claim the app dispatched, routed,
  notified, or contacted anyone. The OS and the operator do the routing, not
  Nagar Shield.
- **The dial path is offline-capable and makes zero network calls.** The panic
  numbers are bundled in the app; no request, no retry, no timeout on the path
  from tap to `ACTION_DIAL`. FR-HELP-8's median (< 12 s) is a *client*
  measurement — `app_open_to_dialer_ms` from app open to intent fire.
- **Fire is `102`** — not `999`, not `16123`. Locked PRD fact **A-7**
  (re-confirmed by the project owner on 2026-10-12 after an incorrect
  prototype-review note asserted `16123`). Police `999`, Medical `999`.
- **The Personal Emergency "call next contact" affordance appears only after
  25 s** and is **user-armed**: the app cannot know whether a call was
  answered, so there is **no automatic failover** and no call-state claim.
  The affordance prefills the *next* primary's number; the user taps to open
  the dialer.
- **The 10 km thana fallback must show the exact banner copy:**
  `"Couldn't find a thana near you — calling 999 instead."` The Bangla
  counterpart is the prototype line `১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।`
  The dial target in the fallback case is `999`.
- **Curated data is refreshed quarterly** by the curator; the repo JSON is the
  source of truth, Postgres mirrors it, and the app bundle ships the same
  payload. The hotline list must render with **no network available**.
- **48 dp minimum tap targets** on every control, including the call circle
  (36 dp visual) and the hotline rows — the hit area is padded to ≥ 48 dp.
- **The help cards are the visually dominant Home elements** and must match
  `docs/design/screen-help-alert.html` **1:1**: gradient per card (purple /
  red / amber / green), 56 dp icon tile, 80 dp card height, Bangla title +
  Bangla sub + English line, phone number + call circle.
- **Location is never required for the dial path.** With location denied,
  Help Alert still opens the dialer with the correct number and shows
  manual-dial guidance (FR-PERMS-2); the thana line degrades to the `999`
  fallback banner.
- RLS is the authorization mechanism: `stations` and `hotlines` are public
  reads; a citizen may insert only their own `wrong_number_reports` row and
  may read only their own reports. The service-role key never reaches the
  client bundle.
- All user-facing strings go through i18n; **Bangla is primary**, English is
  secondary, and no string is hardcoded in either language.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass, plus the
  migration dry-run against Supabase local.

---

## Success Criteria

### Functional

- [ ] Tapping the Police card fires an Android `ACTION_DIAL` intent with
      `999`, and **no** `ACTION_CALL` intent is ever fired (asserted from the
      recorded intent, plus a source scan for `ACTION_CALL`)
- [ ] The confirmation sheet names the exact number being dialled ("Calling 999
      — tap to confirm." / "Calling 102 — tap to confirm.") and displays the
      measured `app_open_to_dialer_ms`
- [ ] The median `app_open_to_dialer_ms` for Police, Medical and Fire is
      **< 12,000 ms** over the measurement window (FR-HELP-8)
- [ ] The dial path succeeds with the network disabled (airplane mode): the
      cards render, the confirmation sheet appears, and the dialer opens
- [ ] No code path reads call state — a source scan finds no call-state
      listener, no telephony-state permission, and no call-outcome branch
- [ ] The Personal Emergency sheet lists primary contacts in `sort_order` with
      the **first primary preselected**; the "call next contact" affordance is
      **not** shown before 25 s and never fires automatically
- [ ] With no police station within 10 km, the thana surface shows the exact
      fallback banner and the dial target is `999`
- [ ] With a police station within 10 km, the nearest station is shown with
      its name, distance, and phone number, and tapping it prefills that
      number
- [ ] The hotline list renders with **no network** available, and shows the
      prototype's exact entries — নারী ও শিশু হেল্পলাইন `109`, দুর্যোগ
      হেল্পলাইন `333`, অ্যাম্বুলেন্স `999`, বিদ্যুৎ অভিযোগ `16116` — plus
      নিকটবর্তী থানা and ম্যাপে স্টেশন খুঁজুন, and the
      "নম্বর ভুল? রিপোর্ট করুন →" link
- [ ] A wrong-number report **persists**: the row is written to
      `wrong_number_reports` with the referenced entry and is visible to the
      curator workflow
- [ ] With **location denied**, Help Alert still opens the dialer with the
      correct number and shows manual-dial guidance (FR-PERMS-2)
- [ ] With **power saving on**, the battery warning appears alongside the help
      action (FR-PERMS-3)
- [ ] The Fire card displays `১০২` and prefills `102`; Police and Medical
      display `৯৯৯` and prefill `999`; the `helpAlertTap` telemetry records the
      correct number for each card
- [ ] Home shows exactly four 80 dp help cards plus one More Help card, and
      More Help opens the sub-sheet (not a separate full screen)

### Non-Functional

- [ ] The four help cards, the More Help card, and the More Help sheet are a
      **1:1 visual match** to `docs/design/screen-help-alert.html` (screenshot
      comparison against the prototype for screen 18 and the sheet)
- [ ] Every interactive control on the Home block, the More Help sheet, the
      picker sheet, the thana line, the map, and the wrong-number sheet is
      ≥ 48 × 48 dp and carries an accessibility label (the prototype's
      `aria-label` strings are the contract)
- [ ] Every new i18n key resolves in `bn` (primary, native-speaker reviewed)
      and `en`
- [ ] The dial path adds no network request — verified by a network-disabled
      run and by a request interceptor that fails the test if any request is
      made between the help-card tap and the intent
- [ ] App cold start to first render < 2 s on a mid-range emulator, and the
      biometric gate from unit 002 does not push the Home → dialer median past
      12 s
- [ ] The OSM tile surface shows the required attribution; the map degrades to
      a bundled station list when tiles are unreachable
- [ ] The bundled curated dataset adds < 100 KB to the APK

### Quality

- [ ] Jest unit tests cover the dialer-number selection (police `999`,
      medical `999`, fire `102`, thana fallback `999`), the 10 km boundary
      (a station at exactly 10 km is **inside** the radius), the primary
      ordering / first-preselection logic, and the 25 s affordance gate
- [ ] A Jest test asserts the source tree contains no `ACTION_CALL`, no
      call-state listener, and no telephony-state permission request
- [ ] Supabase-local integration tests cover the `nearest_thana` RPC (hit
      inside 10 km, miss outside 10 km, inactive station excluded), the
      `wrong_number_reports` insert + RLS policies, and the polymorphic
      `entry_id` integrity trigger
- [ ] A Maestro E2E flow covers open → Police card → confirmation sheet →
      `ACTION_DIAL` with `999`, and a second flow covers the thana fallback
      banner
- [ ] A quarterly-refresh script regenerates the Postgres mirror from the repo
      JSON and a test asserts the mirror matches the bundle for the same
      release
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass, and the migration
      dry-run against Supabase local passes

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-003-help-seek-1 | ddd | US-HELP-03, US-SEEK-02 | `0002_help_seek.sql` (`stations`, `hotlines`, `wrong_number_reports`, RLS, geography + GiST index, `nearest_thana` RPC) + curated JSON + seed + mirror/refresh script |
| bolt-003-help-seek-2 | simple | US-HELP-01 | `openDialer` + `confirmDial` + `helpAlertTap` helper, the Home layout composition and Help Alert block, the Help Alert screen (18), the More Options hub (15) |
| bolt-003-help-seek-3 | simple | US-SEEK-01, US-SEEK-03, US-SEEK-04 | More Help bottom sheet + hotline list, Thana line with the 10 km fallback, Find-a-station map (MapLibre + OSM), wrong-number report sheet |
| bolt-003-help-seek-4 | simple | US-HELP-02, US-HELP-04 | Personal Emergency picker sheet (25 s user-armed affordance), Emergency Contacts screen (20), graceful degradation (location denied → manual dial guidance; battery saver → warning) |

---

## Notes

- **The prototype markup is the contract for the Help Alert screen.**
  `docs/design/screen-help-alert.html` is the exact markup for the four help
  cards and the More Help sheet, and the implementation must match it 1:1:
  gradient per card (Police **purple** `--grad-hero`, Medical **red**
  `--grad-emergency`, Fire **amber** `linear-gradient(135deg, #D97706, #F59E0B)`,
  Personal **green** `linear-gradient(135deg, #059669, #10B981)`), a 56 dp
  translucent icon tile, an 80 dp card height, a Bangla title + Bangla sub +
  English line, and a phone number + a 36 dp call circle (hit area padded to
  48 dp). The More Help card is the dashed card — `1.5px dashed var(--ink-300)`,
  18 px radius, a 48 dp `more_horiz` tile in `--ink-100`, and a `chevron_right`
  affordance.
- **The More Help sheet already contains the exact entries** and must be
  reproduced as-is: নারী ও শিশু হেল্পলাইন `109`, দুর্যোগ হেল্পলাইন `333`,
  অ্যাম্বুলেন্স `999`, বিদ্যুৎ অভিযোগ `16116`, নিকটবর্তী থানা (with the
  sub-line `সবচেয়ে কাছের থানায় কল` and the italic note
  `১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।`), and
  ম্যাপে স্টেশন খুঁজুন (`হাসপাতাল · ফায়ার · থানা`), followed by the
  "নম্বর ভুল? রিপোর্ট করুন →" link and the "বন্ধ করুন" button.
- **FR-SEEK-1 names three categories; the prototype sheet shows six rows.**
  The four hotline rows are the "Other hotlines" category; "নিকটবর্তী থানা" is
  the "Thana line" category; "ম্যাপে স্টেশন খুঁজুন" is the "Find a station"
  category. The prototype flattens all three categories into one sheet, while
  FR-SEEK-1 requires each category to "open its own list or map surface".
  **Resolution:** the sheet keeps the prototype's six rows and visual order
  1:1 (the copy is the contract), and tapping a row opens the corresponding
  category surface — the hotline list, the thana line, or the map. The
  three-category structure is preserved as the navigation model without
  reordering or removing a prototype row.
- **The prototype's screen 20 copy is a dispatch claim and must be corrected.**
  It reads "Personal Emergency dials your ★ primary contacts first. If no
  answer, it moves to the next primary, then the rest." The second sentence
  promises an **automatic** failover on no-answer, which is exactly what
  FR-HELP-5's 2026-10-12 override forbids (the app cannot observe call state).
  The first sentence is also inaccurate ("dials" — the app opens a dialer).
  Both are replaced with copy that states what the app actually does: it opens
  the dialer pre-filled with a contact the **user** picks, and the next
  primary is always one tap away. The screen 20 *layout* (grouped contact
  rows, avatars, the primary star, the green FAB) is ported unchanged.
- **The prototype's Personal Emergency card shows a hardcoded count.**
  `আপনার ৫টি সংরক্ষিত কন্টাক্ট` / `৫ জন` are placeholders. The card renders the
  **real** primary-contact count from `emergency_contacts` (the same pattern
  as the `১২টি সংরক্ষিত` deviation recorded in the UX guide), with the plural
  form handled in both locales.
- **The prototype's `helpAlertTap('police','999')` is telemetry-only** — a
  `console.info` in the prototype. In the app it becomes a real event that
  records the surface and the **exact number**, so FR-HELP-2/3/4's "each card's
  `helpAlertTap` telemetry records the correct number" is testable.
- **FR-HELP-7 requires the confirmation sheet to show `app_open_to_dialer_ms`,
  and the prototype has no confirmation sheet.** It is a new surface built from
  `shared/ui/BottomSheet` in the prototype's visual language. It states the
  number explicitly ("Calling 999 — tap to confirm." / "Calling 102 — tap to
  confirm.") and shows the measured elapsed time. It is a *confirmation*, not
  a claim: the app must not say the call was placed, connected, or answered.
- **`app_open_to_dialer_ms` is measured, not estimated.** The clock starts when
  the app process reports first render (a timestamp captured at cold start and
  carried on the app-open event) and stops when the `ACTION_DIAL` intent is
  fired. The median is computed over Police / Medical / Fire only — those are
  the three surfaces FR-HELP-8 names.
- **Distance is computed server-side by PostGIS, not in the app.** The client
  sends the raw fix to `nearest_thana`; the RPC applies `ST_DWithin(..., 10000
  metres)` against the `stations` GiST index and returns the distance. The
  10 km boundary is **inclusive** — a station at exactly 10.000 km is inside
  the radius and is shown rather than falling back to `999`.
- **The fallback decision is made in exactly one place.** `nearest_thana`
  returns `station: null` when nothing is within 10 km; the client then shows
  the exact banner and dials `999`. No other code path may substitute a
  number, and the fallback must never silently dial a station outside the
  radius.
- **Find-a-station reuses the History map component.** FR-SEEK-4 says
  explicitly to reuse it, and unit 006 owns the History map. To avoid a
  circular dependency, **this unit builds the shared MapLibre wrapper**
  (`shared/ui/StationMap` + the OSM raster style) and unit 006 consumes the
  same wrapper for the History map. The two surfaces stay visually identical
  because they share one component, not two copies.
- **Battery-saver detection has no first-class Expo API.** FR-PERMS-3 requires
  detecting Android power saving / aggressive mode. This likely needs a thin
  native module through the Expo Modules API (or `react-native-power-manager`).
  This is a **build risk**, not a product risk: if the native module is not
  available on the target SDK, the warning degrades to a static copy. Raise it
  with the parent before implementation rather than shipping a silent no-op.
- **The location permission prompt is just-in-time, never at app open.** The
  GPS fix is requested when the user opens the thana line or the map — never
  on the Home screen and never on the panic path. The dial path must complete
  without a location fix existing at all (FR-PERMS-2).
- **The wrong-number report's `reported_by` is optional.** FR-SEEK-6 says
  "any user", and the sheet is reachable from the More Help sheet. When there
  is no session the row is still written with a null `reported_by`; the curator
  workflow does not require an identity to triage a stale number.
- **The wrong-number sheet is a separate bottom sheet** stacked over the More
  Help sheet (the prototype's `#wrong-number-dialog`), with the amber `report`
  icon, the textarea, a 52 dp primary "রিপোর্ট পাঠান", a 44 dp secondary
  "বাতিল", and the "রিপোর্ট পাঠানো হয়েছে" toast on success. The prototype's
  placeholder ("উদাহরণ: ১৬১১৬ এর বদলে ১৬১১৭ হওয়া উচিত") is illustrative
  copy, not a dataset claim — `16116` is the verified electricity complaint
  number in the curated dataset.
- **Quarterly refresh, not hot-patching.** The dataset changes with an app
  release, not at runtime. The Postgres mirror and the bundled JSON are
  regenerated from the same repo JSON by one script, so a release can never
  ship a bundle that disagrees with the server.
- **`wrong_number_reports` status is curator-owned.** This unit writes
  `pending` rows and never transitions the status; unit 007's curator
  workflow closes them after the quarterly verification.
- **`stations.station_type` uses `hospital`, not `medical`.** The prototype's
  Help card label is "মেডিকেল / Medical" (the emergency number `999`), while
  the station entity is a physical hospital. Keep the card label and the
  dataset enum distinct to avoid conflating "medical emergency number" with
  "nearest hospital".
- **Fire is `102` everywhere, including the station dataset.** Per FR-NG-9
  and A-7 there is **no** nearest-fire-station routing at MVP. A fire station
  row in `stations` exists for the Find-a-station map only; the Fire help card
  always prefills `102` and never a station number.
- **Home ownership, stated once more for the other units.** This unit owns the
  Home **layout composition** and the **Help Alert block** (the four 80 dp
  cards + the dashed More Help card). Units 004 / 005 / 006 drop their
  content into the reserved slots — search bar and Alerts feed into the feed
  slot; ক্যাপচার / লোকেশন শেয়ার / ক্রাইম হিস্ট্রি into the quick-action
  grid; জরুরি কন্টাক্ট and আরও into the grid with unit 002. The **হেল্প অ্যালার্ট**
  tile is this unit's and navigates to screen 18. The Help Alert block stays
  first and largest — a change that pushes it below the fold is rejected
  (ARCHITECTURE rule 20).
- **The "More Options" screen (15) is a shared nav hub.** This unit owns the
  জরুরি সেবা and সংরক্ষিত কন্টাক্ট rows; the remaining rows keep the
  prototype's labels and route to their owning units. Screen 15 itself is
  ported by this unit so the routes exist.
- **`expo-linking` `tel:` is the only dial path.** `Linking.openURL('tel:…')`
  resolves to `ACTION_DIAL` on Android. The number is sanitised to digits and
  an optional leading `+` before it reaches the intent — no `tel://`, no
  encoded text, no arbitrary URI.
- **No service-role key, and no "we called" claim, anywhere in this unit.**
  `stations`, `hotlines`, and `wrong_number_reports` are all reachable with
  the anon key under RLS.
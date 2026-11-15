---
unit: 006-alerts
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Alerts & History

## Purpose

Own the **read and react** surfaces of Nagar Shield: the Bangladesh-wide
**Alerts feed** that sits on Home (BD-wide reports, newest first, with the
area-filter chip row, a 60-second foreground-only auto-refresh, pull-to-refresh,
and flagging), and the local **History** view (the user's own reports plus the
reports within **1 km of the current fix in the last 24 hours**, with radius /
window / category filters and a MapLibre + OSM map).

The Alerts feed is the product's public face, and it is also its largest trust
surface. It therefore has two non-negotiable properties that this unit owns
end to end:

1. **The public feed never exposes an author.** `reports.author_id` is
   server-side only; the public read model is a projection that omits
   `author_id` entirely for `public_visibility = 'anonymous'` reports, and a
   negative RLS test asserts that **no** public response contains the column.
2. **The feed is a moderation surface, not a crime dashboard.** A report
   disappears from the feed when it is hidden; nothing in this unit ever renders
   a chart, a heatmap, a trend line, a hotspot ranking, or any other
   crime-statistics output.

Flagging is the only write path this unit owns. `flag_report` is a single
transactional Edge Function that enforces the per-user rate limit (10 flags per
hour), the **3-flag auto-hide** threshold, and the **5 flagged reports in 24 h
author auto-hide**. Unit `007-moderation` owns everything after that — the
queue, the restore / remove decision, and the moderator's note.

---

## Scope

### In Scope

- `supabase/migrations/0005_alerts.sql` — the `flags` table (uuid PK, FKs to
  `reports` and `profiles`, the 5-value reason CHECK, `UNIQUE (report_id,
  flagger_id)`), the supporting indexes (`flags (report_id)`,
  `flags (flagger_id, created_at)`), the RLS policies, and the two read-model
  RPCs
- `alerts_feed(division, city, thana, neighborhood, cursor, limit)` RPC — a
  **public projection** over `reports`: `moderation_status IN ('visible',
  'restored')` only, `author_id` omitted entirely when `public_visibility =
  'anonymous'`, ordered `captured_at DESC, id DESC`, cursor-paginated
- `history_nearby(lat, lng, radius_km, window_hours, category, cursor, limit)`
  RPC — PostGIS `ST_DWithin` over the `reports` geography GiST index with the
  **1 km / 24 h** defaults, plus the caller's own reports
- `flag_report(report_id, reason)` Edge Function — rate limit → insert flag →
  3-flag threshold → 5-flag author auto-hide, all in one transaction
- Mobile: the **Alerts feed block on Home** (screen 14) — the auto-refresh
  indicator, the horizontal area chip row, the alert cards, the flag sheet, and
  the alert-detail surface
- Mobile: the **History screen** (screen 21), the **History Distribution**
  surface (screen 22, counts only), and the **History map** (MapLibre + OSM,
  reusing unit `003`'s shared wrapper)
- `useAlertsFeed()` / `useHistoryNearby()` TanStack Query hooks,
  `useAutoRefresh(60_000)`, `useBatteryGuard()`, and the area-filter state
  shared with Home's search bar
- i18n keys for every new string in `bn` (primary) and `en`

### Out of Scope

- The `reports` / `report_media` schema, RLS, write path, area-hierarchy
  resolution, media pipeline, and offline upload queue — unit `004`. This unit
  **reads** `reports` and `report_media` and never writes them
- `profiles`, auth, sessions, account disable — unit `002`. This unit reads
  `profiles` only to satisfy the `flags.flagger_id` FK
- The Home **layout composition** and the Help Alert block — unit `003`. This
  unit drops the Alerts feed into the reserved Home feed slot. The shared
  MapLibre wrapper (`shared/ui/StationMap` + the OSM raster style) is **unit
  `003`'s**; this unit consumes it and must not fork it
- The moderator queue, the restore / remove decision, `moderation_actions`, and
  the author auto-hide *visibility* for staff — unit `007`. This unit owns the
  auto-hide **transition** and the flag rows that feed the queue
- The 90-day media purge and the geocode-cache cleanup — unit `008`
- Push notifications / FCM fanout on a new report — **Phase 2**. Phase 1
  refreshes by polling only
- Charts / crime-statistics dashboards, heatmaps, trend analysis, hotspot
  rankings, and crime prediction — **excluded** by FR-NG-3 / FR-NG-4 / ADR-010.
  The prototype's screen 23 ("Charts — Admin App") is never built, and the
  বিতরণ tab renders **counts in a list**, never a graph
- Any emergency-service framing — the feed is civic information, never a
  dispatch channel (C-6)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-ALERTS-1 | BD-wide feed, recency ordered — reports across all divisions appear, newest first | Must |
| FR-ALERTS-2 | 60-second foreground refresh, paused when battery < 20% | **Should** |
| FR-ALERTS-3 | Pull to refresh — an immediate re-query on demand | Must |
| FR-ALERTS-4 | Area filter — division / city / thana / neighborhood, via the prototype chip row | Must |
| FR-ALERTS-5 | Alert row format — `New alert from <area>: <category> — <description>`, rendered as the prototype's Bangla / English pair | Must |
| FR-ALERTS-6 | Flagging — fixed 5-value reason enum, persisted with the reporter; a duplicate flag is rejected with `CONFLICT` | Must |
| FR-ALERTS-7 | Auto-hide at 3 flags — the 3rd distinct flag sets `hidden_pending_review` and the report leaves the public feed | Must |
| FR-ALERTS-8 | Moderator restore — a restored report reappears in the public feed | Must |
| FR-ALERTS-9 | Moderator remove — a removed report never appears in the public feed | Must |
| FR-ALERTS-10 | Flag rate limit — at most 10 flags per hour per user; the 11th is rejected with `FLAG_RATE_LIMIT` and `retry_after_sec` | Must |
| FR-ALERTS-11 | Author auto-hide — 5+ flagged reports in 24 h hides all of that author's reports from the last 24 h | **Should** |
| FR-HIST-1 | History opens at the widest offered radius (15 km) and a 24-hour window | Must |
| FR-HIST-2 | History filters — radius, time window, and category; each changes the result set | Must |
| FR-HIST-3 | Immediate visibility — a submitted report appears in the author's History with no moderation gate | Must |
| FR-HIST-4 | Fast load — the default History view loads in < 2 s on a warm session, with a skeleton while loading | Must |
| FR-UX-2 | Help Alert dominance — the four help cards stay the largest, highest-contrast elements in the Home viewport | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `flags` | One citizen's report that a public alert is misleading, harassing, duplicate, off-topic, or otherwise wrong. The only table this unit owns | `id` uuid PK default `gen_random_uuid()`, `report_id` uuid not null FK → `reports.id`, `flagger_id` uuid not null FK → `profiles.id`, `reason` text not null CHECK in `('misinformation','harassment','duplicate','off_topic','other')`, `created_at` timestamptz not null default now(), `UNIQUE (report_id, flagger_id)` |
| `reports` | The incident row behind every feed card and every History row. **Owned by unit 004 — read-only here** | `id` uuid PK, `author_id` uuid not null (server-side only), `public_visibility` text not null, `category` text nullable, `description` text nullable, `lat` / `lng` double precision not null, `area_hierarchy` jsonb not null, `captured_at` timestamptz not null, `moderation_status` text not null, `created_at` / `updated_at` timestamptz |
| `report_media` | The media attached to a report, used by the alert-detail surface. **Owned by unit 004 — read-only here** | `id` uuid PK, `report_id` uuid not null FK → `reports.id`, `storage_path` text not null, `media_type` text not null, `byte_size` integer not null, `duration_seconds` numeric nullable, `width` / `height` integer nullable |
| `area_hierarchy` | The server-resolved area of a report. **Not a table in this unit** — it is read from `reports.area_hierarchy` (jsonb) | `division` text, `city` text, `thana` text nullable, `neighborhood` text nullable |

Notes on the schema:

- `flags` has **no** free-text note column in Phase 1 — the entity carries the
  reason and the reporter only.
- The `UNIQUE (report_id, flagger_id)` constraint is what makes "the 3rd
  **distinct** flag" a well-defined statement and what turns a repeat flag into
  a `CONFLICT` rather than a second count.
- `flags.report_id` and `flags.flagger_id` cascade on delete of the parent
  report / profile, so the 90-day report purge (unit 008) and account deletion
  (unit 002) leave no orphan flags behind.
- The read models add **no new table**. Both `alerts_feed` and `history_nearby`
  are RPCs over `reports`, backed by the existing
  `reports (captured_at DESC)`, `reports (moderation_status)`, and the PostGIS
  `geography(Point,4326)` GiST indexes owned by unit 004.

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `alerts_feed` | RPC — the **public projection** of the BD-wide feed. Filters to `moderation_status IN ('visible','restored')`; omits `author_id` entirely when `public_visibility = 'anonymous'`; applies the optional area filters against `reports.area_hierarchy`; orders `captured_at DESC, id DESC`; cursor-paginated | `division` text nullable, `city` text nullable, `thana` text nullable, `neighborhood` text nullable, `cursor` text nullable, `limit` integer (default 20, max 100) | `{ "data": { "items": [ … ], "next_cursor": "…" \| null } }` — each item carries `id`, `category`, `description`, `captured_at`, `area_hierarchy`, `public_visibility`, `has_media`; **no `author_id`** |
| `history_nearby` | RPC — the local History read model. PostGIS `ST_DWithin` against the caller's origin point using the **1 km** default radius and the **24 h** default window, the optional `category` filter, **plus the caller's own reports**; cursor-paginated on `(captured_at DESC, id DESC)` | `lat` double precision, `lng` double precision, `radius_km` numeric (default 1), `window_hours` integer (default 24), `category` text nullable, `cursor` text nullable, `limit` integer (default 20, max 100) | `{ "data": { "items": [ … ], "next_cursor": "…" \| null, "total_count": n } }` |
| `flag_report` | Edge Function — the only write path. **One transaction**: (1) authenticate; (2) enforce the rate limit (≤ 10 flags / hour per user); (3) insert the flag, mapping the unique violation to `CONFLICT`; (4) if the report now has **≥ 3** flags, set it to `hidden_pending_review`; (5) if the report's author has **5+ distinct flagged reports in the last 24 h**, set **all** of that author's reports from the last 24 h to `hidden_pending_review` | `report_id` uuid, `reason` one of the 5 enum values | `{ "data": { "flag_id": "…", "report_id": "…", "report_hidden": boolean, "author_hidden": boolean } }`; on failure `{ "error": { "code": "FLAG_RATE_LIMIT" \| "CONFLICT" \| "VALIDATION_FAILED" \| "AUTH_REQUIRED" \| "NOT_FOUND", "message": "…", "details": { "retry_after_sec": n } } }` |
| `useAlertsFeed` | TanStack Query hook — the feed query keyed by the active area filter, with a **60 s stale window** and cursor pagination (`useInfiniteQuery`) | `{ division?, city?, thana?, neighborhood? }` | `{ items, nextCursor, isFetching, isRefetching, refetch }` |
| `useHistoryNearby` | TanStack Query hook — the History query keyed by origin + filters, with the same 60 s stale window | `{ lat, lng, radiusKm, windowHours, category? }` | `{ items, nextCursor, totalCount, isLoading, refetch }` |
| `useAutoRefresh` | Foreground-only polling driver — re-queries the active feed every **60_000 ms** while the app is foregrounded; pauses when the battery is **< 20%**, when the app is backgrounded, and when the device is offline. Never schedules a background task | `intervalMs` (default `60_000`), the query key(s) to invalidate | `{ isPaused, pausedReason: 'battery' \| 'background' \| 'offline' \| null }` |
| `useBatteryGuard` | Subscribes to the device battery level and exposes the guard state consumed by `useAutoRefresh` and by the feed header indicator | none | `{ level: number \| null, isLow: boolean, isUnknown: boolean }` |
| `resolveAreaFilter` | Maps the selected chip (or a search-bar selection) to the RPC's area parameters — `All BD` → no filter; `My division` / `My city` → the current fix's `division` / `city`; `Mirpur` / `Dhanmondi` → `thana`; a search selection may set any of the four levels | chip id, current `area_hierarchy` | `{ division?, city?, thana?, neighborhood? }` |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 9 |
| Must Have | 8 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-ALERTS-01 | Alerts feed list — BD-wide, recency ordered, public projection | Must | Planned |
| US-ALERTS-02 | Auto-refresh every 60 s + pull-to-refresh + battery pause | Must | Planned |
| US-ALERTS-03 | Area filter chips | Must | Planned |
| US-ALERTS-04 | Flag an alert — reason enum, duplicate rejection, rate limit | Must | Planned |
| US-ALERTS-05 | Author auto-hide at 5 flagged reports in 24 h | **Should** | Planned |
| US-HIST-01 | History list — 1 km / 24 h default, immediate visibility, < 2 s load | Must | Planned |
| US-HIST-02 | History filters — radius / window / category | Must | Planned |
| US-HIST-03 | History map — MapLibre + OSM, reusing the station-map wrapper | Must | Planned |
| US-ALERTS-06 | Alert detail screen (the prototype's `data-nav="21a"` target has no screen — build it) | Must | Planned |

> US-ALERTS-02 is **Must** because it carries the Must half (FR-ALERTS-3,
> pull-to-refresh) alongside the Should half (FR-ALERTS-2, the 60-second
> foreground refresh and the battery pause). US-ALERTS-05 is **Should** because
> FR-ALERTS-11 is Should. US-ALERTS-06 is Must because FR-ALERTS-5 requires the
> alert to be readable as a detail, and the card alone cannot carry the media.

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | `packages/shared` contracts (`FlagReason`, `ReportCategory`, `ModerationStatus`, `AreaHierarchy`, `ApiErrorCode` incl. `FLAG_RATE_LIMIT` / `CONFLICT` / `VALIDATION_FAILED`, the i18n key contract), the typed Supabase client, the Expo Router `(app)` group, the light/dark design tokens, the shared UI primitives (`Chip`, `SegmentedTabs`, `BottomSheet`, `AppBar`, `PulseDot`, `ListRow`), and the TanStack Query setup |
| `002-identity` | The session used as `flags.flagger_id` and as the History "own reports" predicate; the `profiles` rows the FK points at; the `AUTH_DISABLED` gate on every write |
| `004-capture` | The `reports` / `report_media` tables, their RLS and the PostGIS GiST index, the `area_hierarchy` payload, the media signed-URL path, and the report-detail layout pattern reused by the alert-detail surface (US-ALERTS-06) |
| `003-help-seek` | **The shared MapLibre wrapper only** (`shared/ui/StationMap` + the OSM raster style) that the History map consumes — this unit must not fork a second map component, and the Home feed slot that the Alerts feed is dropped into |

### Depended By

| Unit | Reason |
|------|--------|
| `007-moderation` | Reads `flags` and the `hidden_pending_review` queue; owns the restore / remove decision that puts a report back into (`restored`) or keeps it out of (`removed`) the public feed, and the staff-visible author auto-hide |
| `008-jobs-operations` | Needs the full schema (the `flags` cascade, the `reports` retention leg) for the release pipeline and the purge jobs |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Supabase Postgres + PostgREST + Edge Functions | `alerts_feed`, `history_nearby`, `flag_report` | Low — none of these are on the panic path; the Home feed degrades to the last cached page when the network is down |
| MapLibre GL (`@maplibre/maplibre-react-native`) + OSM raster tiles | The History map | Medium — OSM public-tile usage policy; the attribution is mandatory and the map must degrade to the list when tiles are unreachable |
| `expo-location` | The History origin point (the `lat` / `lng` passed to `history_nearby` and the map centre) | Medium — the permission may be denied and the fix may be slow indoors; the manual-origin path must be available and the Home feed must not depend on a fix |
| `expo-battery` | The battery level behind the < 20% auto-refresh pause | Medium — see Notes: the level can be reported as unknown on some devices / emulators |
| `expo-network` | Connectivity, so the refresh timer does not fire a doomed request and the UI can say it is offline | Low |
| Android OS battery saver / Doze | Out of scope for this unit's gate — the pause condition is **battery level < 20%**, not power-save mode (unit 003 owns the power-save warning) | Low |
| npm registry | Expo SDK, `expo-battery`, `expo-network`, `expo-location`, MapLibre RN, TanStack Query | Low |

---

## Technical Context

### Suggested Technology

Expo SDK + Expo Router, `@tanstack/react-query` (`useInfiniteQuery` for the
cursor-paginated feeds, `useQuery` for the History query, `queryClient` for the
invalidation), `@supabase/supabase-js` (typed, from unit 001) for the two RPCs
and the `flag_report` Edge Function call, `expo-battery` for the
battery level behind the `< 20%` pause, `expo-network` for connectivity,
`expo-location` for the History origin point, `@maplibre/maplibre-react-native`
with OSM raster tiles for the History map (the shared wrapper from unit 003),
`expo-linear-gradient` for the selected area chip's `var(--grad-primary)`
background, `@expo/vector-icons` (Material Symbols) for the card icons,
`i18next` + `expo-localization` for `bn` / `en`, React Hook Form + the shared
Zod resolvers for the flag-reason radio group, Jest + React Native Testing
Library for the unit tests, Maestro for the Android E2E feed / flag flows, and
Supabase local for the RLS / RPC / Edge Function integration tests.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Mobile → Supabase RPC `alerts_feed` | API | HTTPS — `POST /rest/v1/rpc/alerts_feed`; the public projection is the only feed read path, so a raw `reports` select is never used by the client |
| Mobile → Supabase RPC `history_nearby` | API | HTTPS — `POST /rest/v1/rpc/history_nearby`; PostGIS `ST_DWithin` runs server-side against the `reports` GiST index |
| Mobile → Edge Function `flag_report` | API | HTTPS — `POST /functions/v1/flag_report` with the user's JWT; returns the `{ "data": … }` / `{ "error": … }` envelope |
| Mobile → `@tanstack/react-query` | Package | The in-memory query cache; a **60 s stale window** for both feed queries; `invalidateQueries` drives the 60-second refresh and the post-flag invalidation |
| Mobile → `expo-battery` | Native module | The battery level behind the `< 20%` auto-refresh pause and the quiet indicator |
| Mobile → `expo-network` | Native module | Connectivity state — the refresh timer does not fire while offline, and the header says so instead of silently failing |
| Mobile → `expo-location` | Native module | One foreground fix → the History origin point (`lat` / `lng`), the map centre, and the "My division" / "My city" chips |
| Mobile → MapLibre + OSM raster tiles (shared wrapper, unit 003) | Native module + HTTPS | The History map; the wrapper is unit 003's `shared/ui/StationMap` + the OSM raster style — reused, never forked |
| Mobile → unit 004's report-media signed URL | API | HTTPS — the alert-detail surface requests a short-lived signed URL for the report media; the bucket is never public |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `flags` rows | Postgres table | **Low volume** — a handful per user per week, bounded by the 10/hour rate limit; the 3-flag and 5-flag transitions cascade onto `reports` | Retained with the account; cascade-deleted with the parent report |
| `reports` (read model) | Postgres table, read-only here | ~50k rows at 90 days | Metadata retained longer than the media purge (unit 008) |
| `report_media` (read model) | Postgres table, read-only here | ~50k rows | Tied to the parent report |
| `alerts_feed` / `history_nearby` read models | **No new table** — RPCs over `reports`, index-backed | 0 extra rows | n/a |
| TanStack Query cache | In-memory (app process) | The last 3 pages per feed query | Until the app process dies; a **60 s** stale window |
| Battery / network state | In-memory (app process) | 1 value each | Until the next event |

---

## Mobile Screens

Every surface below is a **1:1 port** of the prototype markup and
`docs/design/screen-spec.md`; no redesign, no additional chrome. The prototype's
fake iOS status bar is **not** ported — the real Android status bar replaces it.

| Screen | Prototype spec | Story | Notes |
|--------|----------------|-------|-------|
| Home (Dashboard) — Alerts feed block | screen 14 | US-ALERTS-01, US-ALERTS-02, US-ALERTS-03, US-ALERTS-04, US-ALERTS-06 | The feed is dropped into the **feed slot below the quick-action grid** that unit 003 reserves. Unit 003 owns the Home composition and the Help Alert block; **FR-UX-2** — the four help cards stay the largest, highest-contrast elements in the Home viewport — is this unit's acceptance obligation on that layout |
| History Overview | screen 21 | US-HIST-01, US-HIST-02 | The full 1:1 port — see the markup contract below |
| History Distribution | screen 22 | US-HIST-02 | **Counts in a list, never a chart.** See Notes |
| History map | new surface (reuses the station map wrapper) | US-HIST-03 | MapLibre + OSM; nearby report markers + the origin point, using unit 003's shared wrapper |
| Alert detail | new surface (no prototype screen — the `data-nav="21a"` target has no screen) | US-ALERTS-06 | The layout is derived from the alert card plus unit 004's report-detail pattern: image + description + category + area + time. See Notes |
| Flag sheet | prototype `#flag-dialog` | US-ALERTS-04 | The shared bottom sheet: title **এই সতর্কতা রিপোর্ট করুন**, helper **সঠিক কারণ বাছাই করুন — মডারেটর পর্যালোচনা করবেন**, the five reason radios, the optional note textarea, **রিপোর্ট পাঠান**, **বাতিল**, and the **রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ** toast |

### Screen 14 — the Alerts feed block (the markup contract)

Ported from the prototype's `data-screen="14"` markup, element by element. The
CSS values are the contract — the React Native port uses the same numbers.

| Element | Markup / copy | Notes |
|---------|---------------|-------|
| Feed header | `margin: 0 20px 8px`, `display: flex`, `align-items: center`, `gap: 6px`, `font-size: 11px`, `color: var(--ink-500)`, `font-weight: 600` — a **6 dp pulsing red dot** (`background: var(--red-500)`, `border-radius: 50%`, `animation: pulse-red 1.5s infinite`) + the label **Auto-refreshes every 60s** | The dot is the prototype's `.pulse-red` primitive (`shared/ui/PulseDot`). Under `reduceMotion` the pulse is disabled and the dot is static. When the refresh is **paused** (battery < 20%, backgrounded, or offline) the dot stops pulsing and the label switches to the quiet indicator (see Constraints) |
| Area chip row | `display: flex`, `gap: 8px`, `overflow-x: auto`, `padding: 0 20px 12px` — the chips are **All BD**, **My division**, **My city**, **Mirpur**, **Dhanmondi**. Selected (**All BD** by default): `background: var(--grad-primary)`, `color: white`, `padding: 8px 14px`, `border-radius: 999px`, `font-size: 12px`, `font-weight: 600`. Unselected: `background: var(--surface-white)`, `border: 1px solid var(--ink-200)`, `padding: 8px 14px`, `border-radius: 999px`, `font-size: 12px`, `font-weight: 600`, `color: var(--ink-700)` | The row is horizontally scrollable and every chip is `flex-shrink: 0`. Chips are `shared/ui/Chip`; the selected state carries `accessibilityState={{ selected: true }}`. **See Notes** — the prototype source contains this chip row twice; only one row is ported |
| Alert card | `margin: 0 20px 10px`, `padding: 14px 16px`, `background: var(--surface-white)`, `border: 1px solid var(--ink-100)`, `border-left: 4px solid <category accent>`, `border-radius: 14px`, `display: flex`, `gap: 12px`, `box-shadow: var(--shadow-card)`, `position: relative` | The left border is **4 px** and the card radius is **14 px** (`--r-md`). The card is a `Pressable` that opens the alert-detail surface (US-ALERTS-06) |
| Category icon tile | **40 dp** circle (`border-radius: 50%`), `background: rgba(<accent>, 0.15)`, `color: <accent>`, containing a **22 dp** Material Symbols icon | The icon is the category's Material Symbol: `backpack` (theft), `warning` (assault), `local_fire_department` (fire), `medical_services` (medical), `diamond` (accident), and the mapped equivalent for each of the other categories |
| Area line | `font-size: 11px`, `color: var(--ink-500)`, `font-weight: 600` — e.g. **Mirpur · মিরপুর** | The prototype's `English · বাংলা` pair, taken from `reports.area_hierarchy` (thana, then neighborhood) with the Bangla half from the area lookup. A missing thana falls back to the city / division |
| Category line | `font-size: 15px`, `font-weight: 700`, `color: var(--ink-950)`, `margin: 2px 0 4px` — e.g. **চুরি — Theft** | The Bangla / English pair format. A **null** category renders the neutral placeholder **অকার্যনির্দিষ্ট — Uncategorized** (FR-ALERTS-5) |
| Description | `font-size: 13px`, `color: var(--ink-600)`, `line-height: 1.4` | A **missing** description renders **no empty gap** — the description block is omitted entirely, not rendered as an empty string |
| Relative time | `font-size: 11px`, `color: var(--ink-500)`, `margin-top: 6px` — e.g. **5 min ago**, **1 hr ago** | Derived from `captured_at`; localised (Bangla numerals where the prototype uses them) |
| Flag button | **48 × 48 dp**, transparent, `color: var(--ink-500)`, `border-radius: 50%`, `align-self: flex-start`, containing a **20 dp** `flag` Material Symbol, `data-dialog="flag"` | Opens the flag sheet. `accessibilityLabel` = **রিপোর্ট করুন** (the prototype's `aria-label`). The 48 dp box is the tap target (FR-UX-4) |
| Detail link | `font-size: 11px`, `color: var(--violet-700)`, `font-weight: 600`, `margin-top: 6px` — **✎ বিস্তারিত দেখুন**, `data-nav="21a"` | The prototype's link. The **target screen does not exist in the prototype**, so this unit builds the alert-detail surface (US-ALERTS-06) |

#### Category left-border accents (from the prototype — 1:1)

| Category | Accent | Icon | Tint |
|----------|--------|------|------|
| theft | `#7B1FA2` | `backpack` | `rgba(123,31,162,0.15)` |
| assault | `#DC2626` | `warning` | `rgba(220,38,38,0.15)` |
| fire | `#D97706` | `local_fire_department` | `rgba(217,119,6,0.15)` |
| medical | `#C2185B` | `medical_services` | `rgba(194,24,91,0.15)` |
| accident | **`#5D4037`** | `diamond` | `rgba(93,64,55,0.15)` |

The remaining categories (robbery, harassment, fraud, vandalism, suspicious,
other) reuse the neutral ramp of the closest family — the accent map is a
single shared constant, and the **neutral "uncategorized"** state uses the
`--ink-300` grey.

### Screen 21 — History Overview (the markup contract)

Ported from `docs/design/screen-history-overview.html` (the prototype's
`data-screen="21"`), element by element:

| Element | Markup / copy | Notes |
|---------|---------------|-------|
| App bar | `.app-bar`, `.back-btn` with `arrow_back` (→ Home, screen 14), centred `.app-bar-title` **ক্রাইম হিস্ট্রি**, 40 px spacer on the right | The fake iOS status bar is **not** ported |
| Location pill | `.location-pill` — `margin: 16px 20px`, `padding: 10px 16px`, `background: white`, `border: 1px solid var(--ink-100)`, `border-radius: 999px`, `font-size: 13px`, `color: var(--ink-700)`, `font-weight: 500` — the `location_on` icon (18 dp, `--purple-700`), the address text, and a trailing `keyboard_arrow_down` in `--ink-400` | The prototype's hardcoded **বসুন্ধরা R/A, ঢাকা** is a placeholder. The build renders the **live** address for the current fix, and the `keyboard_arrow_down` opens the radius / window / category filter sheet |
| Segmented tabs | `.segmented-tabs` (`margin: 0 20px 16px`, `background: var(--ink-100)`, `border-radius: var(--r-md)`, `padding: 4px`) — **ধরন** (active), **মোট**, **বিতরণ** | **ধরন** = the list of reports (the default). **মোট** = the totals for the current filter set. **বিতরণ** = the distribution — see the warning below |
| Map link | `.view-graph-link` — the `map` icon (18 dp) + **ম্যাপ ভিউ** | Opens the History map. **The prototype's link points at screen 23 (Charts); this build points it at the History map** |
| Body copy | `padding: 14px 20px`, `text-align: center`, `color: var(--ink-500)`, `font-size: 13px`, `line-height: 1.5` — **"Reports you file and recent reports within 1 km in the last 24 hours."** | The prototype's second line, *"Detailed map + filters coming soon."*, is **removed** — both the map and the filters are built in Phase 1, so the "coming soon" copy would be false. The copy is localised (`bn` / `en`) and states the **real** defaults (1 km / 24 h) |
| List / skeleton | The report rows under the body copy; a skeleton row while the query loads | FR-HIST-4 — the skeleton is replaced within 2 s on a warm session |

### Screen 22 — History Distribution (the markup contract, and its limit)

| Element | Markup / copy | Notes |
|---------|---------------|-------|
| App bar | `.app-bar`, `.back-btn` with `arrow_back` (→ History, screen 21), `.app-bar-title` **ক্রাইম হিস্ট্রি** | The prototype's back button points at Home (14); the build returns to History (21) because this is a **tab** of the History screen, not a separate destination |
| Content | The distribution **as a list of counts**: one row per category with the category label (Bangla / English pair) and the **count** | **No chart. No bar. No percentage. No trend.** See Notes |

> **Distribution tab — no chart, ever.** The prototype's screen 22 is a
> "coming soon" placeholder and the prototype's screen 23 is the Charts /
> crime-statistics screen. Both the **Charts concept** and the
> **crime-statistics output** are excluded by FR-NG-3 / FR-NG-4 / ADR-010. The
> বিতরণ tab therefore renders a **count per category for the user's current
> History filter set** — a plain list, the same `.list-row` primitive used
> elsewhere — and **never** a chart, a dashboard, a heatmap, a trend, a
> hotspot ranking, or a percentage breakdown. The prototype's own copy on
> screen 22 already states the product rule: *"We don't show crime statistics,
> heatmaps, or hotspot rankings — Nagar Shield is for live reports, not
> aggregator data."* A build that renders a graph here is a **defect**, and
> the source tree must contain **no chart library and no chart code path**.

---

## Constraints

- **The public feed must NEVER expose `author_id`** for an anonymous report.
  This is enforced twice — by the **RLS policy** on `reports` (public select
  only when `moderation_status in ('visible','restored')`) **and** by the
  **projection** inside `alerts_feed` (the column is omitted from the result
  set entirely, not nulled). A **negative RLS test** asserts that no public
  response body contains the string `author_id`. `author_id` remains
  server-side for moderation (FR-DATA-3 / FR-MOD-2) — it is the *server* that
  keeps it, never the client.
- **The `moderation_status` filter is `visible` / `restored` only.**
  `hidden_pending_review` and `removed` rows never appear in the public feed
  (FR-ALERTS-7 / FR-ALERTS-9). A restored report reappears (FR-ALERTS-8).
- **The flag threshold is 3** (OQ-4). The **3rd distinct flag** on a report
  sets `moderation_status = 'hidden_pending_review'` and the report leaves the
  public feed. Distinctness comes from `UNIQUE (report_id, flagger_id)`.
- **Max 10 flags per user per hour** (FR-ALERTS-10). The 11th flag within the
  hour is rejected with `FLAG_RATE_LIMIT` and `details.retry_after_sec`; the
  client maps the code to a Bangla / English string and shows the retry time.
- **A duplicate flag is rejected with `CONFLICT`** (FR-ALERTS-6) — the same
  user flagging the same report twice. The client shows the "already reported"
  state and does **not** re-count toward the threshold.
- **Author auto-hide at 5 flagged reports in 24 h** (FR-ALERTS-11, Should).
  When the 5th distinct report of an author is flagged inside 24 h, **all** of
  that author's reports from the last 24 h move to `hidden_pending_review`.
- **Auto-refresh is FOREGROUND-ONLY** and **pauses under 20% battery**
  (PRD-X-2, FR-ALERTS-2). The polling timer is driven by the app's foreground
  state; it is never a background task, never a headless job, and never a
  push. Under 20% the feed stops re-querying and a **quiet indicator** shows
  in place of the pulsing dot.
- **No live push.** FCM fanout is Phase 2. Phase 1 refreshes by polling and by
  pull-to-refresh only.
- **A missing category renders a neutral "uncategorized" placeholder** — it
  never renders an empty gap and never invents a category.
- **A missing description renders no empty gap** — the description block is
  omitted, not rendered as an empty string.
- **The alert row copy format is `New alert from <area>: <category> —
  <description>`** (FR-ALERTS-5), rendered as the prototype's **Bangla / English
  pair** — the area as `Mirpur · মিরপুর` and the category as `চুরি — Theft`.
  The description is shown **as written** (plain text, never HTML).
- **History opens at 15 km / 24 h** (FR-HIST-1 — the widest offered radius, so a
  cold launch shows the full local picture) and the default view loads in
  **< 2 s** on a warm session with a skeleton while loading (FR-HIST-4).
- **A newly submitted report appears in History immediately, with no moderation
  gate** (FR-HIST-3). The History query includes the caller's own reports
  regardless of the radius / window filters.
- **No chart / crime-statistics output, ever.** See the warning on screen 22.
  No chart library is added to the dependency set.
- **The public feed is a read model — no client-side writes to `reports`.**
  The only write this unit owns is `flag_report`.
- **RLS is the authorization mechanism.** The service-role key stays in the
  Edge Function and CI; it must never appear in the mobile bundle. `flags`
  inserts are scoped to `flagger_id = auth.uid()` and the `(report_id,
  flagger_id)` uniqueness is enforced by the DB, not only by the client.
- **48 dp minimum tap targets** on every control — including the 48 dp flag
  button, every area chip, every segmented tab, and every History list row —
  with an accessibility label on each (the prototype's `aria-label` strings are
  the contract).
- **All user-facing strings go through i18n**; **Bangla is primary**, English
  is secondary, and no string is hardcoded in either language.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass, plus the migration
  dry-run against Supabase local.

---

## Success Criteria

### Functional

- [ ] The feed lists reports **across divisions, newest first**
      (`captured_at DESC, id DESC`), and a report seeded in a non-Dhaka
      division appears in the All BD view (FR-ALERTS-1)
- [ ] **No public feed response contains `author_id`** for an anonymous
      report — asserted by an **RLS negative test** that reads the raw
      response body and fails on the substring `author_id` (FR-ALERTS-1,
      FR-DATA-3)
- [ ] The **3rd distinct flag** on a report makes it **disappear from the
      public feed** and sets `moderation_status = 'hidden_pending_review'`
      (FR-ALERTS-7)
- [ ] The **11th flag by one user within an hour** is rejected with
      `FLAG_RATE_LIMIT` and `details.retry_after_sec` (FR-ALERTS-10)
- [ ] A user flagging the **same report twice** gets `CONFLICT`, and the
      duplicate does not count toward the threshold (FR-ALERTS-6)
- [ ] When an author's reports reach **5 flags in 24 h**, **all** of that
      author's reports from the last 24 h become `hidden_pending_review`
      (FR-ALERTS-11)
- [ ] With the app **foregrounded and battery ≥ 20%**, the feed **re-queries
      every 60 s** (FR-ALERTS-2)
- [ ] With **battery < 20%**, auto-refresh **stops** and a **quiet indicator**
      shows instead of the pulsing dot (FR-ALERTS-2)
- [ ] **Pull-to-refresh** triggers an **immediate re-query** (FR-ALERTS-3)
- [ ] **Selecting an area chip narrows the results** — the chip selection
      changes the RPC parameters and the returned rows (FR-ALERTS-4)
- [ ] The **default History query uses radius 1 km and a 24 h window**, and
      the default view loads in **< 2 s** on a warm session with a skeleton
      while loading (FR-HIST-1, FR-HIST-4)
- [ ] **A newly submitted report appears in History immediately, with no
      moderation gate** (FR-HIST-3)
- [ ] Each History filter — **radius**, **window**, **category** — is
      selectable and **changes the result set** (FR-HIST-2)
- [ ] The **বিতরণ tab renders counts**, and **no chart / dashboard code path
      exists** — asserted by a source scan for chart libraries and chart
      components (FR-NG-3 / FR-NG-4 / ADR-010)
- [ ] A report with a **null category** renders the neutral "uncategorized"
      placeholder, and a report with a **null description** renders **no empty
      gap** (FR-ALERTS-5)
- [ ] A **restored** report reappears in the public feed and a **removed**
      report never does (FR-ALERTS-8, FR-ALERTS-9)

### Non-Functional

- [ ] The Alerts feed block and the History screen are a **1:1 visual match**
      to the prototype markup (screenshot comparison for the feed block, screen
      21, and screen 22)
- [ ] Every interactive control on the feed, the chip row, the flag sheet, the
      History screen, the Distribution tab, and the History map is
      **≥ 48 × 48 dp** and carries an accessibility label
- [ ] Every new i18n key resolves in `bn` (primary, native-speaker reviewed)
      and `en`
- [ ] The History map shows the required **OSM attribution** and degrades to
      the list when tiles are unreachable
- [ ] The `reports (captured_at DESC)` index and the geography GiST index are
      used by the feed and radius queries (no sequential scan)
- [ ] **No service-role key** appears in the mobile bundle, and the public
      read model returns **0** occurrences of `author_id`
- [ ] The feed renders from the **last cached page** when the network is down,
      with an offline indication instead of an empty screen
- [ ] The pulse animation is disable-able under `reduceMotion`

### Quality

- [ ] Jest unit tests cover the area-filter → RPC-parameter mapping (All BD /
      My division / My city / thana), the relative-time formatter, the
      uncategorized placeholder, the empty-description gap, and the
      auto-refresh pause conditions (background, battery < 20%, offline)
- [ ] Supabase-local integration tests cover the `alerts_feed` projection
      (author_id absent, moderation filter, ordering, cursor pagination), the
      `history_nearby` radius / window / category filters, the `flags` CHECK and
      `UNIQUE (report_id, flagger_id)` constraints, the 3-flag threshold
      transition, the 10/hour rate limit, and the 5-flag author auto-hide
- [ ] A **negative RLS test** asserts that a public read of an anonymous
      report exposes **no** `author_id` and that a citizen cannot read
      `flags` for another user
- [ ] A Maestro E2E flow covers open Home → the feed renders → pull-to-refresh
      → select an area chip → the results narrow → flag an alert → the toast
      appears
- [ ] A Maestro E2E flow covers the History screen: the default query is
      1 km / 24 h, a filter change alters the result set, and the map opens
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass, and the migration
      dry-run against Supabase local passes

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-006-alerts-1 | ddd | US-ALERTS-01, US-ALERTS-03 | `0005_alerts.sql` — the `flags` table (CHECK on the 5-value reason, `UNIQUE (report_id, flagger_id)`, cascade FKs), the `flags (report_id)` and `flags (flagger_id, created_at)` indexes, the RLS policies, and the `alerts_feed` public-projection RPC with its cursor pagination |
| bolt-006-alerts-2 | ddd | US-ALERTS-04, US-ALERTS-05 | The `flag_report` Edge Function — rate limit → insert → 3-flag threshold → 5-flag author auto-hide, in one transaction, with the `FLAG_RATE_LIMIT` / `CONFLICT` error envelope |
| bolt-006-alerts-3 | ddd | US-HIST-01, US-HIST-02 | The `history_nearby` RPC — PostGIS `ST_DWithin` over the geography GiST index, the 1 km / 24 h defaults, the category filter, the author's own reports, and the cursor pagination |
| bolt-006-alerts-4 | simple | US-ALERTS-01, US-ALERTS-02, US-ALERTS-03 | The Home Alerts feed block 1:1 — the auto-refresh header, the area chip row, the alert card (category accent, 40 dp icon tile, the area / category / description / time lines, the 48 dp flag button), plus `useAlertsFeed()`, `useAutoRefresh(60_000)`, `useBatteryGuard()`, and the pull-to-refresh gesture |
| bolt-006-alerts-5 | simple | US-ALERTS-04, US-ALERTS-06 | The flag bottom sheet (the 5 reason radios + the optional note + the submit / cancel + the success toast), the error mapping for `FLAG_RATE_LIMIT` / `CONFLICT`, and the **alert-detail surface** built from the card plus unit 004's report-detail pattern |
| bolt-006-alerts-6 | simple | US-HIST-01, US-HIST-02, US-HIST-03 | The History screen (21) 1:1 — the location pill, the segmented tabs, the map link, the body copy, the list and its skeleton; the filter sheet (radius / window / category); the Distribution tab (22) as **counts in a list**; and the History map on unit 003's shared MapLibre wrapper |

---

## Notes

- **The prototype's Home source contains the area chip row twice.** The same
  five-chip markup (All BD / My division / My city / Mirpur / Dhanmondi) appears
  **twice** in `prototype ui.html` — the extractor collapsed it into a single
  row in `docs/design/screen-spec.md`, but the raw prototype duplicates it.
  **Port exactly one row.** A duplicated chip row is a visible 1:1 port defect
  and is rejected in review.
- **The `data-nav="21a"` target has no prototype screen for a *public alert*.**
  The prototype links **✎ বিস্তারিত দেখুন** to screen `21a`, and that screen
  exists in the prototype only as the **author's own report-detail /
  category-refinement** surface — which `docs/design/screen-spec.md` does not
  list as a screen and which is owned by unit 004. There is **no** prototype
  screen for the *public* alert detail. This unit therefore **builds the
  alert-detail surface** (US-ALERTS-06) from the alert card plus unit 004's
  report-detail pattern: **image + description + category + area + time**,
  with the flag action available from the detail surface as well. It shows the
  report's media through a short-lived signed URL and **never** exposes the
  author. The build therefore has **two** distinct surfaces behind `21a`: the
  author's own report detail (unit 004, reached from History) and the public
  alert detail (this unit, reached from a feed card) — they are not the same
  screen.
- **The History map and the Find-a-station map share one MapLibre wrapper**
  owned by unit `003` (`shared/ui/StationMap` + the OSM raster style). This
  unit **reuses** it for the History map and **must not fork** a second
  component — a fork is how the two surfaces silently drift apart and how the
  OSM attribution gets dropped from one of them.
- **The বিতরণ tab must never become a dashboard.** FR-NG-3 / FR-NG-4 / ADR-010
  exclude the crime-statistics concept, and the prototype's screen 23 (Charts)
  has **no owning unit**. The বিতরণ tab keeps its name and its place in the
  segmented control, but it renders a **count per category** for the current
  History filter set — a list, not a graph. The prototype's own screen-22 copy
  already states the product rule ("We don't show crime statistics, heatmaps,
  or hotspot rankings — Nagar Shield is for live reports, not aggregator
  data."). **No chart library is added to the dependency set**, and a source
  scan for chart code is part of the acceptance run.
- **The prototype's screen-23 link target changes.** The **ম্যাপ ভিউ** link on
  screen 21 points at `data-nav="23"` (Charts) in the prototype; in the build it
  points at the **History map**, because the map is built in Phase 1 and the
  Charts screen is excluded. The link's label, icon, and placement are
  unchanged.
- **The prototype's screen-21 body copy is corrected.** The prototype reads
  *"Reports you file and recent reports within 1 km in the last 24 hours.
  Detailed map + filters coming soon."* The second sentence is **removed** —
  the map and the filters ship in Phase 1, so "coming soon" would be a false
  claim in the shipped UI. The first sentence states the real defaults
  (1 km / 24 h) and is kept, localised in `bn` and `en`.
- **The prototype's History location pill address is a placeholder.**
  **বসুন্ধরা R/A, ঢাকা** is replaced by the **live** address for the current
  fix, using unit 004's shared reverse-geocode helper (the same substitution
  unit 004 makes on the Capture screen). With location denied, the pill falls
  back to a manual / Dhaka-default origin and the History list stays usable.
- **The area chip row is a filter, not a search box.** **All BD** is the
  default and clears every filter. **My division** and **My city** resolve from
  the current fix's `area_hierarchy`; **Mirpur** and **Dhanmondi** filter by
  `thana`. The chip list is the prototype's five chips for the 1:1 port; the
  Home search bar (**এলাকা খুঁজুন...**, also in the feed slot) may narrow to a
  `neighborhood` as well, and both feed the same `alerts_feed` parameters.
- **The category accent map is one shared constant.** The five accents above
  are read **1:1** from the prototype (`#7B1FA2` theft, `#DC2626` assault,
  `#D97706` fire, `#C2185B` medical, **`#5D4037` accident**), each with its
  15% tint and its Material Symbol. A card must never hardcode a hex — it
  reads the map by category, so a new category is one line of change.
- **The alert card's `position: relative`** exists in the prototype to anchor
  the detail link; in RN the flex column is the anchor and no absolute
  positioning is needed. The **box model** (margin / padding / border / radius
  / shadow) is the contract, not the positioning technique.
- **`useAutoRefresh` is foreground-only by construction.** It hooks the app's
  foreground state rather than scheduling a timer that survives backgrounding,
  so a backgrounded app performs **no** feed requests. `expo-network` adds a
  second guard: an offline device does not fire a doomed request every 60 s.
- **The battery guard has an "unknown" state.** `expo-battery` can report no
  level on some devices and emulators. The guard treats **unknown as "not
  low"** (the refresh continues) and never blocks the feed on a missing
  reading — a missing reading must not silently kill auto-refresh.
- **The rate limit is enforced server-side only.** The client may *show* the
  remaining budget, but the authoritative count is
  `flags (flagger_id, created_at)` inside the Edge Function. A client-side
  counter is a UX affordance, never the enforcement point.
- **The flag threshold transition and the author auto-hide happen in one
  transaction** inside `flag_report`, so a partially-applied hide is impossible.
  The function returns `report_hidden` / `author_hidden` so the client can
  invalidate the feed query immediately.
- **`author_id` is omitted, never nulled.** The projection removes the column
  from the result set entirely for anonymous reports — a `null` value would
  still be a column named `author_id` in the response and would fail the
  negative test. Identified reports may expose a display alias; the raw
  `author_id` is still never returned.
- **`history_nearby` includes the caller's own reports regardless of the
  filters.** This is what makes FR-HIST-3 ("a submitted report appears
  immediately") true even when the user's fix is more than 1 km away or the
  report is older than the window.
- **The History screen owns no write path.** The report-detail entry point
  (including the author-only category edit) is unit 004's; this unit links to
  it and renders the read model.
- **The feed is a civic-information surface.** No copy may claim the app
  notified, dispatched, or escalated anything to any authority (C-6), and no
  feed row may present a report as a verified incident — it is a citizen
  report, and the flag sheet says so in its helper line.
- **Cross-unit boundaries at a glance.** Unit 003 owns the Home composition,
  the Help Alert block, and the MapLibre wrapper. Unit 004 owns `reports`,
  `report_media`, the area hierarchy, and the report-detail layout. Unit 007
  owns the queue and the restore / remove decision. This unit owns `flags`,
  the two read-model RPCs, `flag_report`, the feed, and History.

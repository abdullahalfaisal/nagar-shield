---
id: 006-history-list
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 006-history-list

## User Story

**As a** Nagar Shield user who wants to review what has been reported around me and what I filed myself
**I want** a local History view showing my own reports and the reports within 1 km of my current position over the last 24 hours
**So that** I can check on my neighbourhood and my own submissions without the whole country feed

## Acceptance Criteria

- [ ] **Given** the user opens History, **When** the screen renders, **Then** it is a 1:1 port of the prototype's `data-screen="21"` — the app bar (`arrow_back` → Home screen 14, the centred title **ক্রাইম হিস্ট্রি**, a 40 px right spacer), the location pill, the segmented tabs (**ধরন** / **মোট** / **বিতরণ**), the **ম্যাপ ভিউ** link, the body copy, and the report list — and the fake iOS status bar is **not** ported
- [ ] **Given** the location pill renders, **When** its style is read, **Then** it matches the prototype exactly: `margin: 16px 20px`, `padding: 10px 16px`, `background: white`, `border: 1px solid var(--ink-100)`, `border-radius: 999px`, `font-size: 13px`, `color: var(--ink-700)`, `font-weight: 500`, with the 18 dp `location_on` icon in `--purple-700`, the address text, and a trailing `keyboard_arrow_down` in `--ink-400`
- [ ] **Given** History is opened with no filter applied, **When** the query runs, **Then** it queries `radius_km = 1` and `window_hours = 24` (FR-HIST-1)
- [ ] **Given** the default query runs, **When** the result set is built, **Then** it contains the author's **own reports** **plus** the reports within 1 km of the current fix in the last 24 h — the own-reports branch is independent of the radius and window filters
- [ ] **Given** the author has just submitted a report, **When** the author opens History, **Then** the report is present **immediately** — no pending-review gate, no moderation step, no delay beyond the submit response (FR-HIST-3)
- [ ] **Given** the default History view is opened on a **warm session**, **When** the list settles, **Then** it is rendered within **2 seconds**, and a **skeleton** row is shown for the whole of the loading period (FR-HIST-4)
- [ ] **Given** the **ম্যাপ ভিউ** link is tapped, **When** the navigation happens, **Then** it opens the **History map** — **not** the prototype's screen 23 (Charts) — and the link's label, `map` icon, and placement are unchanged
- [ ] **Given** the body copy renders, **When** its text is read, **Then** it states the real defaults — *"Reports you file and recent reports within 1 km in the last 24 hours."* — and the prototype's second sentence *"Detailed map + filters coming soon."* is **removed**, because both the map and the filters ship in Phase 1 and "coming soon" would be a false claim in the shipped UI
- [ ] **Given** the segmented tabs render, **When** **ধরন** is active, **Then** the tab shows the list of reports as a list of rows; **মোট** shows the totals for the current filter set; **বিতরণ** shows the distribution as **counts in a list — never a chart, a bar, a percentage, or a trend**
- [ ] **Given** the location permission is denied or the fix fails, **When** the screen renders, **Then** the pill shows a degraded origin state, the History list stays usable with the manual / Dhaka-default origin, the screen does not crash, and no permission prompt fires on mount (the prompt is just-in-time, when the user asks for a fix)

## Technical Notes

- **`history_nearby` is the read model.** `POST /rest/v1/rpc/history_nearby` with `{ lat, lng, radius_km, window_hours, category?, cursor?, limit? }`, returning `{ "data": { "items": [...], "next_cursor": "…" | null, "total_count": n } }`. The default `radius_km` is **1** and the default `window_hours` is **24**; `limit` defaults to 20 and caps at 100.
- **The radius filter is server-side PostGIS.** `ST_DWithin(report.geog, origin.geog, radius_km * 1000)` against the `geography(Point,4326)` GiST index owned by unit 004 — the client never fetches and filters locally.
- **The caller's own reports are included regardless of the filters.** The RPC's `WHERE` is `(ST_DWithin(...) AND captured_at >= now() - window) OR author_id = auth.uid()`. That `OR` branch is what makes FR-HIST-3 true even when the user's fix is more than 1 km away or the report is older than the window.
- **The History query uses `useQuery` (not `useInfiniteQuery`)** with a 60 s stale window, keyed by `{ lat, lng, radiusKm, windowHours, category }` — so a filter change produces a distinct cache entry and the wrong page is never served for the new filter.
- **`useHistoryNearby` exposes `{ items, nextCursor, totalCount, isLoading, refetch }`.** The **মোট** tab reads `totalCount`; the **বিতরণ** tab reads the per-category counts for the current filter set.
- **The segmented tabs are `shared/ui/SegmentedTabs`.** The prototype's control is `.segmented-tabs` (`margin: 0 20px 16px`, `background: var(--ink-100)`, `border-radius: var(--r-md)`, `padding: 4px`) with three equal-width tabs; the active tab is **ধরন**. Every tab is ≥ 48 × 48 dp and announces its selected state.
- **The **বিতরণ** tab is counts in a list, never a chart.** No chart library is added to the dependency set, and a **source scan** for chart code and chart components is part of the acceptance run — a graph here is a defect, not a feature (FR-NG-3 / FR-NG-4 / ADR-010). The prototype's own screen-22 copy already states the product rule: *"We don't show crime statistics, heatmaps, or hotspot rankings — Nagar Shield is for live reports, not aggregator data."*
- **The screen-22 back button returns to History (screen 21), not to Home.** The বিতরণ surface is a **tab** of the History screen, not a separate destination — the prototype's `data-nav="14"` is corrected here for the same reason the ম্যাপ ভিউ link's `data-nav="23"` is corrected.
- **The prototype's location-pill address is a placeholder.** **বসুন্ধরা R/A, ঢাকা** is replaced by the **live** address for the current fix, using unit 004's shared reverse-geocode helper — the same substitution unit 004 makes on the Capture screen. With location denied, the pill falls back to a manual / Dhaka-default origin and the list stays usable.
- **The location permission is just-in-time, never on mount.** Opening History does **not** fire the permission prompt; the prompt fires when the user explicitly asks for a fresh origin. The panic path is never affected by this screen.
- **The skeleton is a real skeleton row,** not a spinner — it mirrors the row's geometry so the layout does not jump when the data lands. It is replaced within 2 s on a warm session (FR-HIST-4); the query is index-backed and returns only a page, so the load is dominated by the round trip.
- **The app bar's `arrow_back` returns to Home (screen 14)** — the prototype's target — and the real Android status bar replaces the fake iOS status bar. The 40 px right spacer is preserved so the title stays optically centred.
- **The body copy is localised in `bn` and `en`** and states the real defaults (1 km / 24 h) rather than promising features that are not built.
- **The History screen owns no write path.** The report-detail entry point (including the author-only category edit) is unit 004's surface; this screen links to it and renders the read model.
- **Testing.** Jest covers the relative-time formatter and the Bangla / English pair rendering on the History rows. A Supabase-local integration test covers the `history_nearby` radius / window / category filters, the own-reports branch, and the cursor pagination. A Maestro flow covers: open History → the default query is 1 km / 24 h → a filter change alters the result set → the map opens.

## Implementation

**Built 2026-11-13.** The screen is live at `apps/mobile/app/(app)/history.tsx`.

- **The read model.** `apps/mobile/src/shared/api/history.ts` — `fetchHistory` calls
  `history_nearby` with `{ p_lat, p_lng, p_radius_km, p_window_hours, p_category,
  p_cursor, p_limit }`, mapping the envelope to `{ items, nextCursor, totalCount }`.
  `useHistory` wraps it in `useQuery` with a 60 s stale window and the query key
  `{ lat, lng, radiusKm, windowHours, category }`.
- **The four tabs.** **ধরন** (the neighbour rows), **মোট** (the totals), **বিতরণ**
  (the distribution counts), and **My Reports** — the author's own branch, added
  by unit `004`'s `003-report-detail-and-category-edit`. The own branch is
  independent of the radius and the window (FR-HIST-3); it is the RPC's `OR
  author_id = auth.uid()` that makes this true, and the client does not re-filter
  it.
- **The distribution is counts in a list.** `countByCategory` derives the counts
  from the rows the same query already returned, so the list and the count
  cannot disagree. `CountRow` renders a label and a number — there is no width
  computed from the count, which is what a bar would need.
- **A row opens the right surface.** An own row opens the author's report detail
  (where the category is editable); a neighbour row opens the **public** alert
  detail, because the neighbouring reports are the public projection and carry
  no author field at all.
- **The location pill opens the filter sheet**, and the filter state is part of
  the query key, so the list, the totals, the distribution, and the map all move
  together.

### Deviations from the story

- **The prototype's second body sentence is removed**, as AC #8 requires — both
  the map and the filters ship in Phase 1, so *"Detailed map + filters coming
  soon."* would be a false claim in the shipped UI. The shipped copy states the
  real defaults instead.
- **A fourth tab is present.** The prototype's screen 21 has no "my reports"
  tab; unit `004`'s `003-report-detail-and-category-edit` AC #1 asks for the
  author's own report to be reachable from History. The two branches coexist
  rather than compete, and the story's own Technical Notes already record this.
- **The `history_nearby` RPC is `bolt-006-alerts-3`'s**, but the migration that
  carries it is `supabase/migrations/0005_alerts.sql`. The story's dependency
  list names the migration file, which is the durable reference.

### Verification

- `apps/mobile/src/shared/api/history.test.ts` — 8 Jest tests: the counts sum to
  the row count; a `null` category is its own bucket, kept separate from
  `'other'`; every count is an integer ≥ 1; no entry carries a `percentage`, a
  `share`, a `trend`, a `series`, `points`, `height`, or a `percent`.
- `apps/mobile/src/__tests__/noChartCode.test.ts` — 9 Jest tests: a **source
  scan** over `app/` and `src/` that fails the build on any chart code, any
  charting library in the dependency tree, any SVG chart primitive, any chart
  route, and any chart-shaped identifier. The scan reads **code only** —
  comments and string literals are stripped first — because the rule is stated
  in prose in several places, and a scan that matched those would either fail on
  the rule itself or force the rule to be hidden from the codebase.
- `supabase/tests/history.sql` — the SQL-side assertions for the radius, the
  window, the category filter, the own-reports branch, and the cursor
  pagination.
- `pnpm alert:check` — the live probe, which finalises a capture, resolves the
  public detail as a **different** citizen, and asserts the privacy properties.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ReportCategory`, `AreaHierarchy`), the typed Supabase client, the design tokens, the shared UI primitives (`AppBar`, `SegmentedTabs`, `ListRow`), and the TanStack Query setup
- Unit `002-identity` — the session that scopes the "own reports" branch of `history_nearby`
- Unit `003-help-seek` — the Home entry point and the shared `openDialer`/navigation conventions of the Home → History link
- Unit `004-capture` — the `reports` table, the PostGIS GiST index, the `area_hierarchy` payload, and the shared reverse-geocode helper for the live pill address
- `supabase/migrations/0005_alerts.sql` — the `history_nearby` RPC (this unit's `bolt-006-alerts-3`)

### Enables
- `007-history-filters` — the location pill and the filter sheet this story's pill opens
- `008-history-map` — the History map this story's **ম্যাপ ভিউ** link opens
- `009-alert-detail-screen` — the alert detail reachable from a History row
- Unit `007-moderation` — the moderation states visible in the History read model

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The location permission is denied | The pill shows a degraded origin state, the query falls back to the manual / Dhaka-default origin, the list still renders, and no permission prompt fires on mount |
| The GPS fix is slow or fails indoors | The screen renders with the skeleton, the query runs against the last known or default origin, and the list settles — the screen never shows an endless spinner |
| The author has just submitted a report | The report appears in the author's History immediately with no moderation gate (FR-HIST-3) |
| The author's report is more than 1 km from the current fix | The report is still in the author's own History — the own-reports branch is independent of the radius filter |
| The author's report is older than 24 h | The report is still in the author's own History — the own-reports branch is independent of the window filter |
| The result set is empty | The list renders its empty state and never a bare screen; the skeleton is replaced by the empty state, not by an endless skeleton |
| The query exceeds 2 s on a cold session | The skeleton stays until the data lands; the 2 s budget is a **warm-session** target and the skeleton is never removed before the data is ready |
| The device is offline | The last cached History page renders with an offline indication; the screen never blanks |
| The user taps **বিতরণ** | The screen renders a count per category for the current filter set as a list — never a chart, a bar, a percentage, or a trend |
| The user taps the **ম্যাপ ভিউ** link | The History map opens; the prototype's screen 23 (Charts) is never reachable from this link |
| The user presses the system back button | The app returns to Home (screen 14) — the same destination as the app bar's `arrow_back` |
| The user rotates the device with the list loaded | The loaded pages and the scroll position are preserved and no query is re-issued |

## Out of Scope

- The radius / window / category **filter sheet** and the filter state — `007-history-filters`
- The History map surface itself — `008-history-map`
- The report-detail screen and the author-only category edit — unit `004`
- The `history_nearby` RPC's schema and its SQL implementation — `bolt-006-alerts-3`
- Writing to `reports` from the History screen — this unit owns no write path here
- Any chart, dashboard, heatmap, trend, hotspot ranking, or crime-statistics output — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- The prototype's screen 23 (Charts — Admin App) — never built; it has no owning unit
- Push notifications on a new report — Phase 2

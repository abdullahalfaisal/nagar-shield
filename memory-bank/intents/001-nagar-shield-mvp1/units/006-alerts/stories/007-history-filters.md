---
id: 007-history-filters
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 007-history-filters

## User Story

**As a** Nagar Shield user who wants to look at more than the default neighbourhood window
**I want** to change the radius, the time window, and the incident category of my History view
**So that** I can ask a different question of the same local reports without waiting for a filter feature that does not exist

## Acceptance Criteria

- [ ] **Given** the user taps the trailing `keyboard_arrow_down` on the History location pill, **When** the sheet opens, **Then** the filter sheet renders the three filter groups — **radius**, **time window**, and **category** — with the current values pre-selected
- [ ] **Given** the radius filter is offered, **When** the options are listed, **Then** they are **500 m**, **1 km**, **2 km**, and **5 km**, and selecting one applies it as the `radius_km` query parameter (FR-HIST-2)
- [ ] **Given** the time-window filter is offered, **When** the options are listed, **Then** they are **1 h**, **24 h**, **7 d**, and **30 d**, and selecting one applies it as the `window_hours` query parameter (FR-HIST-2)
- [ ] **Given** the category filter is offered, **When** the options are listed, **Then** they are the fixed **11-value** enum — `theft`, `assault`, `harassment`, `robbery`, `accident`, `fire`, `medical`, `fraud`, `vandalism`, `suspicious`, `other` — plus an explicit **no category** option, and selecting one applies it as the `category` query parameter (FR-HIST-2)
- [ ] **Given** any one of the three filters is changed, **When** the query re-runs, **Then** the returned result set **changes** — the filtered set is a strict subset of the unfiltered set and is not the same page served from a stale cache
- [ ] **Given** the user opens the sheet with no filter applied before, **When** it renders, **Then** the pre-selected values are the defaults — **radius 1 km**, **window 24 h**, and **no category**
- [ ] **Given** the user invokes the **reset** action in the sheet, **When** it completes, **Then** the radius is restored to **1 km**, the window to **24 h**, and the category to **no category**, and the result set returns to the default view
- [ ] **Given** the filter state changes, **When** the query key is inspected, **Then** the radius, the window, and the category are all part of the **query key**, so a different filter combination produces a different cache entry and the cache never serves the wrong page
- [ ] **Given** the sheet is open and the user changes one filter, **When** they confirm, **Then** the sheet closes, the new values are applied, and the list re-queries exactly once — the filter is not applied twice or applied on every intermediate change
- [ ] **Given** the sheet is open, **When** the user dismisses it without confirming (cancel, scrim tap, or back), **Then** the active filters, the applied query, and the rendered list are all unchanged

## Technical Notes

- **The sheet is the location pill's affordance.** The prototype's `.location-pill` carries a trailing `keyboard_arrow_down`; that chevron opens this filter sheet. The pill's style contract is unchanged by this story (`006-history-list`).
- **The sheet is built from `shared/ui/BottomSheet`** in the prototype's visual language — the same primitive the flag sheet uses. It is **not** a native Android picker.
- **The filter state lives in one place.** A single `HistoryFilters` object `{ radiusKm: number; windowHours: number; category: ReportCategory | null }` is the source of truth for the sheet, the query key, and the RPC arguments. The sheet edits a draft copy and commits it on confirm, so a cancelled sheet changes nothing.
- **The filter state is part of the query key.** `useHistoryNearby` is keyed by `{ lat, lng, radiusKm, windowHours, category }`. Changing any one of them produces a distinct cache entry; the previous filter's cached page is never served for the new filter, and the previous entry is still cached for a back-navigation.
- **The values are sent as query parameters to the RPC, never applied client-side.** `radius_km`, `window_hours`, and `category` go to `history_nearby`; the PostGIS `ST_DWithin` and the window predicate run server-side against the GiST index. Filtering locally would require fetching the unfiltered set and would break the 2 s budget.
- **The radius options map to metres.** 500 m → `0.5`, 1 km → `1`, 2 km → `2`, 5 km → `5` (the RPC takes `radius_km` as a numeric kilometres value).
- **The window options map to hours.** 1 h → `1`, 24 h → `24`, 7 d → `168`, 30 d → `720`. The unit is hours on the wire; the label is the human one.
- **The category list is the shared 11-value enum.** It renders from the shared `ReportCategory` parser and the shared Bangla labels, and it is exactly the list the author can set from the report detail — one vocabulary, no second list.
- **A null category is a first-class filter value.** "No category" is not the same as "the category named `other`"; the RPC treats a null `category` as "do not filter by category", while `other` filters to reports explicitly categorised as `other`.
- **The author's own reports are still included regardless of the filters.** The RPC's own-reports branch is independent of radius, window, and category — the filters narrow the nearby set, not the author's own submissions.
- **The reset action restores the defaults, not an empty state.** An empty filter set is not a legal configuration: the sheet always has a radius, a window, and a category-or-none. The reset action sets exactly the defaults (1 km / 24 h / no category) — the same values the screen opens with on a cold launch.
- **The filter summary is visible outside the sheet.** The pill (or a summary line under it) reflects the active filters so the user can see what the list is showing without reopening the sheet.
- **The 2 s budget survives a filter change.** The filtered query is the same index-backed query with a narrower predicate, so it is no slower than the default view; the skeleton is shown for the filtered load as well.
- **Testing.** Jest covers the option → parameter mapping (all four radii, all four windows, the 11 categories plus none), the draft / commit / cancel semantics of the sheet, and the reset action. A Supabase-local integration test covers `history_nearby` with each radius, each window, and a category filter, and asserts the result set changes. A Maestro flow covers: open History → open the filter sheet → change the radius → the result set changes → reset → the default result set returns.

## Dependencies

### Requires
- `006-history-list` — the History screen, the location pill and its `keyboard_arrow_down`, and the `useHistoryNearby` hook this story's filters drive
- Unit `001-foundation` — `packages/shared` (`ReportCategory` parser and the 11-value enum), the `BottomSheet` and `SegmentedTabs` primitives, the design tokens, and the `bn` / `en` i18n bundles
- Unit `002-identity` — the session that scopes the "own reports" branch of the filtered query
- Unit `004-capture` — the `reports` table and the PostGIS GiST index the filtered query runs against
- `supabase/migrations/0005_alerts.sql` — the `history_nearby` RPC's `radius_km` / `window_hours` / `category` parameters (this unit's `bolt-006-alerts-3`)

### Enables
- `008-history-map` — the History map renders the reports within the **current filter set**, which this story defines
- Unit `007-moderation` — the moderator console's filtered view of the same read model

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The sheet is opened with no filter ever applied | The pre-selected values are 1 km / 24 h / no category — the same defaults the cold launch uses |
| The user changes the radius and then cancels | The active radius, the query key, and the rendered list are all unchanged; the sheet's draft is discarded |
| The user selects the same radius that is already active | The applied filter is unchanged; the sheet may close without re-querying, and the result set is identical |
| The user chooses a category and then switches to "no category" | The `category` parameter is removed from the request (a null, not the string `"null"`), and the full unfiltered-category set returns |
| The filter yields zero reports | The list renders its empty state with the active filter summary visible; the screen is never blank |
| The author has reports outside the filtered radius / window / category | The author's own reports remain in the list — the filters narrow the nearby set only |
| The filter change happens while a previous query is still in flight | The in-flight query for the old key is abandoned; only the new key's result renders, and the stale response is never painted |
| The device is offline when a filter is applied | The selection is applied to the query key and the cached page for that key (if any) renders with the offline indication; no doomed request is issued |
| The user rotates the device with the sheet open | The sheet, the draft values, and the active filters are preserved |
| The filter values are persisted across an app restart | The History screen reopens with the **default** 1 km / 24 h / no category — the filter state is session-local and is not persisted at MVP |

## Out of Scope

- The History screen's own layout, the app bar, the segmented tabs, and the list rows — `006-history-list`
- The History map surface and its marker rendering — `008-history-map`
- The `history_nearby` RPC's SQL implementation and its index usage — `bolt-006-alerts-3`
- The area chip row and the BD-wide feed's area filter — `003-area-filter-chips`
- The Home search bar's neighbourhood search — unit `003`
- A custom radius slider, a date-range picker, or a free-text category field — the options are the fixed sets above
- Persisting the last-used filter across launches, sharing a filtered view, or saving a named filter — Phase 1 keeps the defaults on every cold launch
- The **মোট** and **বিতরণ** tabs' own contents — they read the current filter set but are part of `006-history-list`

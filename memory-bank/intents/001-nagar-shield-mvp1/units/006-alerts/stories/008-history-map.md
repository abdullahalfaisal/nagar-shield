---
id: 008-history-map
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 008-history-map

## User Story

**As a** Nagar Shield user who wants to see where the recent reports around me actually happened
**I want** a map of the reports within my current History filter
**So that** I can judge the geography of what I am reading instead of guessing from the area names

## Acceptance Criteria

- [ ] **Given** the user opens the History map from the **ম্যাপ ভিউ** link, **When** the surface renders, **Then** it is a **MapLibre** map with **OSM** raster tiles showing the reports within the **current History filter set** (radius, window, and category) — the prototype's screen 23 (Charts) is never the target
- [ ] **Given** the History map renders, **When** its implementation is inspected, **Then** it is built on unit `003`'s **shared `shared/ui/StationMap` wrapper** and the **same OSM raster style**, and the source tree contains **no** second, forked map component or style — a fork is rejected at review
- [ ] **Given** the map is on screen, **When** the user looks at the bottom of the surface, **Then** the required OSM attribution (`© OpenStreetMap contributors`) is visible — it is rendered by the shared wrapper itself, so it cannot be omitted by a consumer that forgets it
- [ ] **Given** many reports fall inside the current filter, **When** the markers are drawn, **Then** they are **clustered or capped** so the map stays responsive — the marker count is bounded by a documented cap and the map never freezes or drops frames on a dense result set
- [ ] **Given** the current filter yields **no** reports, **When** the map renders, **Then** it renders an **empty state** — the map surface still loads with the origin centred, with a clear "no reports in this area" message, and no crash and no blank screen
- [ ] **Given** a report marker is tapped, **When** the selection is handled, **Then** the **alert detail** opens for that report (`009-alert-detail-screen`)
- [ ] **Given** the user's location permission is granted and a fix is available, **When** the map opens, **Then** the user's own position is shown as a distinct "you are here" marker and the camera is centred on it
- [ ] **Given** the location permission is denied or the fix fails, **When** the map opens, **Then** the map still renders every report marker centred on the default Dhaka-metro centre with no position marker, no crash, and no permission prompt fired from the map
- [ ] **Given** the device is offline or the OSM tile servers are unreachable, **When** the map opens, **Then** the report markers still render over a plain background with an offline notice — it never shows an empty or crashed map
- [ ] **Given** the map's controls and markers, **When** accessibility is checked, **Then** every control is ≥ 48 × 48 dp with an accessibility label in `bn` and `en`, and each marker announces the report's area and category to a screen reader

## Technical Notes

- **One wrapper, two surfaces.** FR-SEEK-4 says the Find-a-station map reuses the History map component, but unit `006` owns the History map — the literal reading is circular. **Resolution:** unit `003` builds the shared wrapper (`shared/ui/StationMap` + the OSM raster style) and unit `006` consumes it here. The two surfaces stay visually identical because they share one component, not two copies — forking is how the surfaces drift apart and how the attribution gets silently dropped from one of them.
- **The wrapper owns the attribution, not this surface.** `© OpenStreetMap contributors` is rendered by `shared/ui/StationMap` itself. Attribution is a condition of using the OSM public tile servers.
- **The marker set comes from the current filter.** The map reuses the **same** `useHistoryNearby` query and the **same** query key as the list — `{ lat, lng, radiusKm, windowHours, category }`. There is no second map-specific fetch, and a filter change on the list is reflected on the map without a parallel query.
- **The markers are clustered or capped.** A documented marker cap (and clustering above it) keeps the render responsive on a dense filter set such as 5 km / 30 d. A cluster expands into its members on tap; the cap never silently drops a report from the **list** — the list remains the complete view and the map is the spatial overview.
- **The report's own coordinates come from the read model.** The `history_nearby` items carry `lat` / `lng` for the caller's own nearby set; no additional geometry query is issued.
- **Location is just-in-time.** The GPS fix is requested when the map opens — never at app open and never on the panic path — through the same `expo-location` helper the History screen uses. With permission denied the map renders on the default centre and never prompts from the map itself.
- **The map is not the panic path.** It is allowed to make tile requests, but it is never reachable from the Help Alert cards and never blocks a dial.
- **Tile requests are bounded by the shared wrapper's policy.** Only the visible viewport plus a one-tile margin is requested, the on-device tile cache is bounded and age-limited, and there is no prefetch of the whole city and no retry loop against the public OSM servers.
- **The empty state is a first-class state.** No reports inside the current filter is a normal outcome (the author may simply have no recent reports nearby); the map still loads, centres on the origin, and shows a clear localised message.
- **Tapping a marker opens the alert detail.** The marker carries the report's `id`, and the tap routes to `009-alert-detail-screen` — the same surface the feed card's **✎ বিস্তারিত দেখুন** link opens. The two entry points do not fork the detail surface.
- **No analytics layer, ever.** No heatmap, no trend line, no hotspot ranking, no density colouring, no crime-statistics overlay (FR-NG-3 / FR-NG-4 / ADR-010). The markers are report points, and nothing else.
- **C-6 — no dispatch claim.** The surface states what the app knows — where a citizen report was filed — and never claims anyone was notified, dispatched, or routed.
- **Testing.** A Jest test asserts the attribution is present in the rendered tree, that the marker cap is respected for a synthetic dense result set, and that the map surface imports the shared wrapper rather than a local map component. A source scan asserts that no second MapLibre style or map wrapper exists in the mobile app. A Maestro flow covers: open History → tap **ম্যাপ ভিউ** → the map renders → tap a marker → the alert detail opens.

## Dependencies

### Requires
- `006-history-list` — the History screen, the **ম্যাপ ভিউ** link that opens this surface, and the `useHistoryNearby` query this map renders
- `007-history-filters` — the current filter set (radius, window, category) that determines which reports the map shows
- Unit `001-foundation` — the Expo Router route for the map, the design tokens, and the `bn` / `en` i18n bundles
- Unit `003-help-seek` — the shared `shared/ui/StationMap` wrapper and the OSM raster style (**consume, never fork**)
- Unit `004-capture` — the `reports` coordinates and the PostGIS GiST index behind the radius query
- `expo-location` — the origin point and the "you are here" marker (external; may be denied)
- `@maplibre/maplibre-react-native` + the OSM public raster tile servers — external; attribution and cache behaviour are contractual

### Enables
- `009-alert-detail-screen` — the map marker tap is one of this surface's entry points
- Unit `007-moderation` — the staff view's spatial read of the same report set

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The current filter yields zero reports | The map renders an empty state with the origin centred and a localised "no reports" message; no crash, no blank map |
| The filter yields hundreds of reports | The markers are clustered or capped at the documented limit, the map stays responsive, and the list still shows the complete set |
| A cluster is tapped | The cluster expands into its member markers; tapping an individual marker then opens the alert detail |
| The location permission is denied | The map renders every report marker centred on the default Dhaka-metro centre with no position marker, and no permission prompt is fired from the map |
| The GPS fix is slow or fails indoors | The map renders immediately on the default centre and re-centres when the fix arrives; no endless spinner |
| The device is offline or the OSM tile server times out | The markers render over a plain background with an offline notice; the wrapper retries at most once and never enters a request loop |
| The OSM tile server returns `429` | The wrapper serves the cached or plain background with the offline notice; it never hammers the public tile server |
| A report's coordinates are null or malformed | The marker is skipped and the remaining markers still render; a malformed point never crashes the map |
| Two reports share the same coordinates | Both markers render at the same point and are disambiguated by the detail they open, never by renaming the report |
| The user leaves the map and re-enters it | No stale callout is open, the previously selected marker is not auto-reopened, and the camera returns to the user's fix (or the default centre) |
| The filter is changed while the map is open | The map re-renders against the new filter set using the same query key as the list; the old filter's markers are removed |
| The user rotates the device | The map re-mounts on the new orientation, the camera is restored to the origin, and no duplicate marker layer is rendered |
| The device is in dark theme | The markers, the empty state, and the attribution keep AA contrast in both modes |

## Out of Scope

- The History screen, the **ম্যাপ ভিউ** link, and the list — `006-history-list`
- The filter sheet and the filter state — `007-history-filters`
- The alert detail surface — `009-alert-detail-screen`
- The shared `shared/ui/StationMap` wrapper and the OSM raster style — unit `003` owns them; this story consumes them
- A second map implementation, a custom style, or a different tile provider — a fork is rejected at review
- Directions, turn-by-turn navigation, route drawing, travel time, and traffic layers
- Live or third-party POI data, place search, and geocoding autocomplete
- Heatmaps, density colouring, trend lines, hotspot rankings, and any crime-statistics or analytics overlay — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- Offline tile packs and a self-hosted tile server — Phase 2
- Drawing a radius circle on the map, a place picker, or a map-based filter editor
- Any copy claiming the app notified, dispatched, or escalated anything to an authority — forbidden by C-6

---
id: 007-find-a-station-map
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: should
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 007-find-a-station-map

## User Story

**As a** Nagar Shield user who needs a hospital, a fire station, or a police thana near me
**I want** a map of the nearby stations with their phone numbers, so I can pick one and call it
**So that** I reach the right service without searching the web for a number I cannot trust

## Acceptance Criteria

- [ ] **Given** the user taps the ম্যাপে স্টেশন খুঁজুন row (sub-line হাসপাতাল · ফায়ার · থানা) in the More Help sheet, **When** the map surface opens, **Then** the More Help sheet is dismissed and the map renders one marker per **active** curated station (police, hospital, fire) from the bundled dataset
- [ ] **Given** the map is rendered, **When** the markers are drawn, **Then** each marker's colour encodes its station type — police, hospital, and fire each use a distinct colour drawn from the design tokens — and the surface carries a legend naming the three types in `bn` and `en`
- [ ] **Given** location permission has been granted and a fix is available, **When** the map opens, **Then** the user's own position is shown as a visually distinct "you are here" marker and the camera is centred on it; **Given** permission is denied or the fix fails, **When** the map opens, **Then** the map still renders every station marker centred on the default Dhaka-metro centre with no position marker and no crash
- [ ] **Given** a station marker is selected, **When** its callout card opens, **Then** the card shows the station's name and its phone number with a call action, and tapping the call action opens the OS dialer pre-filled with that station's number via `ACTION_DIAL` — the app places no call itself
- [ ] **Given** the map is on screen, **When** the user looks at the bottom of the surface, **Then** the required OSM attribution (`© OpenStreetMap contributors`) is visible and is not covered by the callout card
- [ ] **Given** a tile is already held in the on-device tile cache, **When** the map requests that tile, **Then** the cached copy is served and **no** network request is made for it; the map requests only tiles for the visible viewport plus a one-tile margin, never prefetches the whole city, and never issues a repeated request for the same tile
- [ ] **Given** the device is offline or the OSM tile servers are unreachable, **When** the map opens, **Then** the station markers and their callout cards still render from the bundled dataset over a plain background and the surface shows an offline notice — it never shows an empty or crashed map
- [ ] **Given** this surface and unit `006`'s History map, **When** the two are compared, **Then** both are built from the **same** shared MapLibre wrapper (`shared/ui/StationMap` + the OSM raster style) and this surface contains **no** second, forked map component or style
- [ ] **Given** the map's controls, **When** accessibility is checked, **Then** the zoom / locate / recentre controls and every callout action are ≥ 48 × 48 dp with accessibility labels in `bn` and `en`, and each marker announces its station name and type to a screen reader
- [ ] **Given** the user leaves the map surface and re-enters it, **When** the map renders again, **Then** no stale callout is open, the previously selected marker is not auto-reopened, and the camera returns to the user's fix (or the default centre when there is no fix)

## Technical Notes

- **One wrapper, two surfaces.** FR-SEEK-4 says "reusing the History map component", but unit 006 owns the History map — so the literal reading creates a circular dependency. **Resolution:** unit `003` builds the shared MapLibre wrapper (`shared/ui/StationMap` + the OSM raster style) and unit `006` consumes it for the History map. This surface is the wrapper's first consumer. A fork is how the two surfaces drift apart and how the OSM attribution gets silently dropped from one of them, so forking is rejected at review.
- **The wrapper owns the attribution, not the surface.** The `© OpenStreetMap contributors` attribution is rendered by `shared/ui/StationMap` itself, so it cannot be omitted by a consumer that forgets it. Attribution is a condition of using the OSM public tile servers.
- **Tiles are cached aggressively and fetched sparingly.** The wrapper configures a bounded on-device tile cache with a max age, serves a cached tile without touching the network, and issues no request for a tile it already holds. Only the visible viewport plus a one-tile margin is requested — no city-wide prefetch, no retry loop. Unit `008`'s release verification checks that the cache policy is active in the shipped build and that no request loop hammers the public OSM servers; self-hosting tiles is Phase 2 if the usage policy ever demands it.
- **Markers come from the bundled dataset, not the network.** The map's station set is the bundled curated JSON (~60 rows), so the marker layer renders with no server round-trip and the surface works offline. The Postgres mirror is a separate read path, not a map dependency. A station row with `is_active = false` is excluded from the marker set.
- **Marker colours come from the tokens, not from literals.** The three type colours are defined once in the wrapper's token map and keep AA contrast in both light and dark themes. The prototype's Help-card palette (police purple, medical red, fire amber) is the starting point so the map and the Help Alert block read as one system — but the station type is `hospital`, distinct from the Help card's "মেডিকেল / Medical" label.
- **A legend is not optional.** Three colours with no key are a colour-blind trap: the surface ships a legend naming each type in `bn` and `en`, and each marker announces its type to a screen reader.
- **Location is just-in-time.** The GPS fix is requested when the map opens — never at app open and never on the panic path. With permission denied the map renders on the default Dhaka-metro centre; the dial path never waits on a fix (FR-PERMS-2). The fix is requested through the same `expo-location` helper unit 006 uses.
- **The dial path is unchanged.** Every call action routes through the single `openDialer(number)` helper (`Linking.openURL('tel:<number>')` → `ACTION_DIAL`); `ACTION_CALL` is never used and no call state is observed (C-1). The number is sanitised to digits plus an optional leading `+` before it reaches the intent.
- **The map is not the panic path.** The map surface is allowed to make network requests (tiles), but it is never reachable from the Help Alert cards and never blocks a dial.
- **No clustering, no analytics layer.** At ~60 rows every marker is individually tappable; marker clustering, heatmaps, and any crime-statistics overlay are excluded by FR-NG-3 / FR-NG-4 / ADR-010.
- **C-6 — no dispatch claim.** The surface states what the app knows — a station's name, number, and type — and never claims anyone was notified, contacted, or routed.
- **i18n is a hard requirement.** Every string ships in `bn` (primary, native-speaker reviewed) and `en`; no user-facing string is hardcoded in either language.
- **Testing.** A Jest unit test covers the station-type → marker-colour mapping, the presence of the attribution in the rendered tree, and the tile-cache rule (a cached tile produces zero network requests). A Maestro flow covers: open the More Help sheet → ম্যাপে স্টেশন খুঁজুন → select a marker → the callout shows the name + number → the call action fires `ACTION_DIAL` with that number.

## Dependencies

### Requires
- Unit `001-foundation` — `shared/ui` primitives, the light/dark design tokens, the Expo Router route for the map, and the `bn`/`en` i18n bundles
- `001-home-and-help-alert-grid` — the shared `openDialer` helper (and `confirmDial`, if the map's call action is confirmed before the intent fires)
- `003-bundled-station-hotline-dataset` — the bundled station rows (`id`, `station_type`, `name`, `name_bn`, `phone`, `lat`, `lng`) the markers render from
- `004-graceful-degradation` — the location-denied path and the manual-dial guidance shown alongside it
- `005-more-help-and-hotlines` — the ম্যাপে স্টেশন খুঁজুন row that opens this surface
- `@maplibre/maplibre-react-native` + the OSM public raster tile servers — external; attribution and cache behaviour are contractual

### Enables
- Unit `006-alerts` — the History map consumes this unit's `shared/ui/StationMap` wrapper instead of building a second one
- Unit `008-jobs-operations` — the release verification that the tile cache policy is active in the shipped build

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The device is offline when the map opens | Markers and callout cards render from the bundled dataset over a plain background with an offline notice; no crash and no empty map |
| The OSM tile server returns `429` or times out | The wrapper retries at most once, then renders the cached or plain background with the offline notice; it never enters a request loop |
| Location permission is denied | The map renders every station marker centred on the default Dhaka-metro centre, with no position marker; no permission prompt is fired from the map |
| The GPS fix is slow or fails indoors | The map renders immediately on the default centre and re-centres when the fix arrives; the surface never shows an endless spinner |
| A station's coordinates are null or outside Bangladesh | The build-time dataset validation rejects the entry so it never reaches the map; at runtime a malformed coordinate is skipped and the remaining markers still render |
| A station row is inactive (`is_active = false`) | It is excluded from the marker set; inactive stations are never shown on the map |
| Two stations share the same coordinates | Both markers render at the same point and are disambiguated by the callout's name and address, never by renaming the row |
| The user selects the same marker twice | The callout stays bound to that station and no duplicate dial intent is fired |
| The user taps the call action twice quickly | Only one `ACTION_DIAL` intent fires for that station's number |
| The selected marker is panned off-screen | The callout stays bound to its station for the duration of the interaction and is cleared when the map surface closes |
| The station's stored phone number contains spaces or dashes | It is sanitised to digits plus an optional leading `+` before it reaches the dialer intent |
| The device is in dark theme | Marker colours, the legend, the callout card, and the attribution all keep AA contrast in both modes |
| The user opens the map from two different entry points | Both routes render the identical surface with the identical wrapper and style |

## Out of Scope

- The History map surface — unit `006-alerts`; it **consumes** this unit's wrapper and is not built here
- The Thana line, its nearest-station lookup, and the 10 km → `999` fallback — `006-thana-line-fallback`
- The wrong-number report sheet and its write path — `008-wrong-number-report`
- Directions, turn-by-turn navigation, route drawing, travel time, and traffic layers
- Live or third-party POI data, place search, and geocoding autocomplete
- Marker clustering, heatmaps, and any crime-statistics or analytics overlay — excluded by FR-NG-3 / FR-NG-4 / ADR-010
- Offline tile packs and a self-hosted tile server — Phase 2; unit 008 verifies the cache policy at release
- Placing a call, observing call state, or any call-outcome branch — forbidden by C-1
- Any dispatch, routing, or "officer notified" claim — forbidden by C-6

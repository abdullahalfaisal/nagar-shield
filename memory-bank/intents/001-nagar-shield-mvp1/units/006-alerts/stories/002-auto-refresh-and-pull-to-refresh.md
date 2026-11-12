---
id: 002-auto-refresh-and-pull-to-refresh
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 002-auto-refresh-and-pull-to-refresh

## User Story

**As a** Nagar Shield user who keeps Nagar Shield open to watch the Alerts feed
**I want** the feed to refresh itself while I am looking at it, and to refresh immediately when I pull down
**So that** I see new reports without hunting for a button, and my battery is not drained by a feed I am not even watching

## Acceptance Criteria

- [ ] **Given** the app is **foregrounded** and the battery level is **≥ 20 %**, **When** 60 seconds elapse, **Then** the feed re-queries exactly once per interval and the refreshed rows render without a user action (FR-ALERTS-2)
- [ ] **Given** the app is **backgrounded**, **When** 60 seconds and any number of intervals elapse, **Then** **zero** feed requests are made and no background task, headless job, or timer survives the backgrounding — the poll is foreground-only by construction
- [ ] **Given** the app is foregrounded and the battery level is **< 20 %**, **When** the next interval would fire, **Then** the auto-refresh is paused, no feed request is made, and the feed header replaces the pulsing red dot and the **Auto-refreshes every 60s** label with a **quiet indicator** (a static dot and a quiet "paused" label) (FR-ALERTS-2)
- [ ] **Given** `expo-battery` reports **no level** (an UNKNOWN reading, common on some devices and emulators), **When** the guard evaluates, **Then** the reading is treated as **"not low"** — the auto-refresh continues and the header keeps the pulsing dot; a missing reading never silently kills polling
- [ ] **Given** the user pulls the feed down, **When** the pull-to-refresh gesture completes, **Then** an **immediate** re-query is issued and the new rows render (FR-ALERTS-3)
- [ ] **Given** a feed query is in flight, **When** the user looks at the feed, **Then** a refresh indicator is visible for the duration of the query and is hidden when the query settles — for a poll and for a manual pull alike
- [ ] **Given** a manual pull-to-refresh is in flight and a scheduled poll lands during it, **When** both settle, **Then** the rendered list contains **no duplicate rows** — each report `id` appears exactly once, and the two in-flight requests are coalesced into a single fetch rather than two racing ones
- [ ] **Given** the app is foregrounded, the battery is ≥ 20 %, and the device is **offline**, **When** an interval fires, **Then** no doomed request is issued, the feed keeps rendering the last cached page, and the header states that the app is offline instead of silently failing
- [ ] **Given** the app returns to the foreground after being backgrounded, **When** the foreground state flips, **Then** the poll timer is re-armed and the next interval is measured from the moment the app became foregrounded — the backgrounded interval does not fire a catch-up burst
- [ ] **Given** the feed header renders, **When** the reduce-motion accessibility setting is on, **Then** the pulsing red dot is rendered static (no pulse animation) while the **Auto-refreshes every 60s** label and the 11 px `var(--ink-500)` weight 600 styling remain unchanged

## Technical Notes

- **`useAutoRefresh(60_000)` is foreground-only by construction.** It subscribes to the app's foreground state (e.g. `expo-background-task`/`AppState`) rather than scheduling a timer that survives backgrounding. A backgrounded app performs **no** feed requests — asserted by a test that backgrounds the app and asserts the request count is zero.
- **The pause conditions are three, and they are OR-ed.** `pausedReason` is `'battery' | 'background' | 'offline' | null`. The header's quiet indicator is shown whenever `pausedReason !== null`; the pulsing dot is shown only when `pausedReason === null`.
- **`useBatteryGuard` exposes `{ level: number | null, isLow: boolean, isUnknown: boolean }`.** `isLow` is `level !== null && level < 20`. An UNKNOWN reading is `isUnknown = true` and `isLow = false` — **unknown is treated as "not low"** so a missing reading can never silently stop the polling.
- **The pause condition is the battery *level*, not power-save mode.** Android battery saver / Doze detection is unit `003`'s concern; this story's gate is strictly `level < 20`.
- **Polling is implemented as a query invalidation, not as a bespoke fetch.** The 60 s interval calls `queryClient.invalidateQueries({ queryKey: feedKey })`, so the poll reuses the same `useInfiniteQuery` path, the same 60 s stale window, and the same cache — no parallel request machinery.
- **A poll and a manual refresh are coalesced.** TanStack Query dedupes concurrent fetches for the same query key, so a poll landing during a manual pull resolves to one network request and one rendered list. A unit test fires a poll and a manual refresh concurrently and asserts exactly one request and no duplicated `id` in the rendered output.
- **The refresh indicator is visible while a query is in flight.** The header's own state (`isFetching` / `isRefetching`) drives it; the indicator never blocks the list and never replaces the last cached page.
- **The timer is re-armed on foregrounding, not back-dated.** The interval clock starts when the app becomes foregrounded, so returning to the app after an hour does not fire seven catch-up requests.
- **`expo-network` is the connectivity guard.** An offline device does not fire a doomed request every 60 s, and the UI says it is offline instead of silently failing.
- **The battery and network readings are in-memory only.** No battery level, no network state, and no location is ever persisted or sent to the server; the feed request carries no device telemetry.
- **The quiet indicator keeps the header's layout.** The header stays at `margin: 0 20px 8px`, 11 px, `var(--ink-500)`, weight 600 — the label text changes, the box does not.
- **Testing.** Jest covers the pause conditions in isolation: background → paused, battery < 20 % → paused, offline → paused, UNKNOWN battery → **not** paused. A Maestro flow covers: open Home → pull-to-refresh → the refresh indicator appears → the rows settle → select an area chip → the results narrow.

## Dependencies

### Requires
- `001-alerts-feed-list` — the feed query, the `useAlertsFeed` hook, and the auto-refresh header this story's quiet indicator replaces
- Unit `001-foundation` — the TanStack Query setup (`queryClient`), the `PulseDot` primitive, and the `bn` / `en` i18n bundles
- `expo-battery` — the battery level behind the `< 20 %` pause (external; the level can be UNKNOWN)
- `expo-network` — the connectivity state that stops a doomed request (external)

### Enables
- `003-area-filter-chips` — the polling re-queries the feed under the active area filter
- `004-flag-an-alert` — the post-flag feed invalidation lands on the same query key this story invalidates
- `007-history-filters` — the same foreground / battery guard pattern applies to the History query's 60 s stale window

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The app is backgrounded for 10 minutes and then returns to the foreground | No requests were made while backgrounded; on foregrounding the timer is re-armed and the next poll is one full interval away — no catch-up burst |
| The poll and a manual pull-to-refresh overlap | Exactly one network request is issued, the rendered list has no duplicate `id`, and the refresh indicator stays visible until the single query settles |
| The battery drops from 25 % to 15 % while the app is open | The next interval does not fire a request, the header switches to the quiet indicator immediately, and the last cached page stays rendered |
| The battery level is UNKNOWN (no reading on the device or emulator) | The reading is treated as "not low"; polling continues and the pulsing dot stays |
| The battery reading arrives late (the first call resolves after the app has opened) | The guard starts in the "not low" state, polling runs, and the state updates when the reading arrives — the feed is never left paused because a reading has not arrived yet |
| The device goes offline while the poll timer is armed | The interval fires but issues no request; the header states that the app is offline and the cached page stays on screen |
| The device comes back online | The poll resumes on the next interval and the header returns to the pulsing dot; the offline indication disappears |
| The user scrolls to the bottom and has loaded 3 pages when a poll lands | The loaded pages are preserved and refreshed by the same query key; no page is dropped and no row is duplicated |
| A poll lands exactly while the feed screen is unmounting | The in-flight request is abandoned cleanly — no state update on an unmounted component and no warning in the console |
| The OS kills the app while it is backgrounded | On next launch the feed renders from the cache and the timer is armed fresh; no stale interval is resumed |
| The screen reader is active | The refresh indicator is announced as a polite live-region update, never as an assertive interruption |

## Out of Scope

- The feed card layout, the accent map, and the public projection — `001-alerts-feed-list`
- The area chip row and the area-filter state — `003-area-filter-chips`
- The flag sheet and the post-flag invalidation payload — `004-flag-an-alert`
- Push notifications / FCM fanout on a new report — **Phase 2**; Phase 1 refreshes by polling and pull-to-refresh only
- Any background task, headless job, scheduled notification, or OS-level background sync — the poll is foreground-only
- Android battery saver / Doze detection and the power-save warning — unit `003`
- Persisting the battery level, the network state, or the last poll timestamp
- The History screen's own refresh strategy — the History query uses the same 60 s stale window but is owned by `006-history-list` and `007-history-filters`

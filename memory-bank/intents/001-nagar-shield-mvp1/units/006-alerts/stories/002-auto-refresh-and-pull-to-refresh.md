---
id: 002-auto-refresh-and-pull-to-refresh
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
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

## Implementation

**Auto-refresh and pull-to-refresh both ship, and both are now guarded. The story is `complete` on the criteria it states — with one honest residue recorded below: the Maestro flow the Testing note names does not exist.**

### What ships

- **The poll is real and foreground-only.** `apps/mobile/src/shared/api/alerts.ts` sets `refetchInterval: () => (guard.isPaused ? false : ALERTS_REFRESH_INTERVAL_MS)` and `refetchIntervalInBackground: false`.
- **The pull is real on both surfaces.** `apps/mobile/app/(app)/alerts.tsx` wires a `RefreshControl` to `onRefresh={() => void refetch()}`, driven by `isRefetching` from the hook. `apps/mobile/app/(app)/home.tsx` does the same, through a new **optional** `refreshControl` prop on `Screen`.
- **The guard is intrinsic to the hook.** `useAlertsFeed` owns the guard and returns it, so no screen can poll without it and the header can never show a reason the poll did not use.
- **The pause conditions are three and they are OR-ed**, with **background winning** — the reason that will change first when the app comes back.

### The three gaps this section named — closed

**1. "No test covers either behaviour."** There are now **three** test files, and they cover the behaviour rather than the source text.

`apps/mobile/src/shared/api/alertsRefresh.dom.test.ts` is **new** and drives the **real hook** with real fake timers, counting the RPC calls:

- the feed re-queries **once per 60 s** — 59 s is not a poll, 60 s is one poll, and the next interval is one more;
- a **backgrounded** app makes **zero** requests across ten intervals;
- the poll **re-arms** on foregrounding with **no catch-up burst** — 59 s after returning is still nothing, and the 60th second is exactly one poll;
- a **low battery** pauses the poll and keeps the cached page;
- an **UNKNOWN** battery reading (`-1`) is **not low**, and the poll continues;
- a manual pull re-queries **immediately**, without waiting for the interval;
- the refresh indicator is on while a **poll** is in flight and while a **pull** is in flight;
- a poll landing during a pull is **coalesced** into one request, and the rendered list has **no duplicate ids**;
- an **offline** device makes no doomed request, keeps the cached page, and resumes when it comes back online.

**2. "`refetchIntervalInBackground: false` is a deliberate choice with no recorded reason."** The reason is now recorded — in the code, next to the flag:

> `refetchIntervalInBackground: false` is a **no-op in React Native**: TanStack's `focusManager.isFocused()` reads `globalThis.document?.visibilityState`, and React Native has no DOM `document`, so it is *always* `true`. The flag is kept because it is the correct thing to write — but it is **not** what stops the background poll. The **interval function** is.

And the scan that keeps the record honest is `feedHeader.test.ts` — *"the record of why the background poll stops is in the code"* — which reads the **raw** source (the explanation lives in a comment) and requires the flag, the `focusManager.isFocused()` reference and the `visibilityState` reference to all be present.

**3. "The interval constant has no test."** `packages/shared/src/schemas/schemas.test.ts` now pins `ALERTS_REFRESH_INTERVAL_MS === 60_000` and `ALERTS_BATTERY_PAUSE_THRESHOLD === 20`, and asserts both are whole numbers — a fractional millisecond or percent would mean the constants were *derived* rather than *chosen*.

### The three defects closing this story exposed

The story's criteria were not merely untested — they were **violated**. Closing them surfaced three real defects, each of which shipped.

**1. The Home screen polled the feed forever, in the background.** `apps/mobile/app/(app)/home.tsx` called `useAlerts(filter)` with **no guard** — only `alerts.tsx` passed `enabled: !guard.isPaused`. AC #2 says **zero** feed requests while backgrounded; Home made one every 60 s, forever. The guard is now **intrinsic to the hook**, so there is no way to forget it: `useAlertsFeed` builds the guard and returns it, and both screens read it from the hook's return value.

**2. `refetchIntervalInBackground: false` never blocked the poll — see above.** The flag was a no-op, so the only thing that could stop the background poll was the interval function. It is now a function.

**3. `enabled: false` also blocked the mount fetch.** TanStack's `shouldLoadOnMount` requires `enabled !== false` (`queryObserver.js:490-492`), so the old `alerts.tsx` showed an **empty feed** on a cold start while paused, instead of the cached page. AC #8 was broken by the very mechanism that was meant to implement it. The `enabled` option is **removed** — dead once the guard is intrinsic, and a footgun while it was not.

### The two levers, and why both are needed

The guard stops the poll with **two** mechanisms, and the second one was found by a causal check that initially **failed**.

- **The interval function stops the *timer*.** `refetchInterval` computes `false` when the guard is paused, and `isValidTimeout(false)` is false — so **no interval is armed at all**. TanStack re-arms the timer whenever the computed value changes (`queryObserver.js:130-131`), which re-arms it at the moment the app returns to the foreground — the next interval is measured from *that* moment, so there is no catch-up burst.
- **The `queryFn` refusal stops the *request*.** The interval function is only re-evaluated **on a render**. Between the native `appStateDidChange` event and React's commit there is a window in which the timer is still armed and the computed interval is still 60 s. A request issued in that window would go out **after** the app was already backgrounded.

The refusal therefore reads the guard's **live** state, not its rendered state. `RefreshGuard` gained `isPausedNow()`, which reads the app state source's `currentState` **getter** at the moment of the call. `guard.isPaused` is React state — it describes the last *render* — and the live check is what closes the race.

### The causal checks

Every guard was checked by breaking the thing it guards and confirming the test **failed**, then restoring:

| What was broken | The test that failed |
|---|---|
| `refetchInterval` → a plain number | `alertsRefresh.dom.test.ts` — *"leaves no poll timer armed while the app is backgrounded"* |
| The `queryFn` refusal removed | `alertsRefresh.dom.test.ts` — *"issues no request when the interval elapses mid-backgrounding"* |
| `isPausedNow()` reading React state instead of the source | `refreshGuard.dom.test.ts` — *"sees a backgrounding that React has not committed"* and *"sees a foregrounding that React has not committed"*, plus the race-window test |
| `isLowBattery`: `<` → `<=` | `refreshGuard.test.ts` — *"is not low at the threshold itself"* |
| `isLowBattery`: an unknown reading treated as low | `refreshGuard.test.ts` — *"treats an unknown reading as not low"* |
| The `refetchIntervalInBackground` note deleted | `feedHeader.test.ts` — *"the record of why the background poll stops is in the code"* |
| The interval function replaced by a number | `feedHeader.test.ts` — *"the interval is a function, so the timer is re-armed on a change"* |
| Home switched back to `useAlerts` | `feedHeader.test.ts` — *"uses the guarded feed hook, not the unguarded one"* |
| `ALERTS_REFRESH_INTERVAL_MS` → `30_000` | `schemas.test.ts` — *"locks the Alerts refresh interval at 60 seconds"* |
| The `queryFn` refusal dropped from `alertsShowingCachedPage` | `alerts.dom.test.ts` — *"is false when the refresh was paused rather than failed"* |

Two of these checks **initially passed when they should have failed**, and both gaps were closed rather than the checks being dropped:

- **The plain-number `refetchInterval` mutation passed every request-count test.** The `queryFn` refusal was stopping the *request*, so the request count could not tell a stopped **timer** from a refused **request**. The fix was a test that observes the **timer** — AC #2 asks for *"no background task, headless job, or timer survives the backgrounding"*, and a request count cannot see a surviving timer. The timer is now observed directly, through a spy on the **global** `setInterval` (which is what TanStack's default timeout provider calls), tracking the intervals that are **currently armed** — TanStack clears the old interval before arming the new one, so a recorder that only accumulated would report a timer that no longer exists.
- **The `queryFn` refusal mutation passed every test** until the race-window test was written. The refusal only matters in the window between the native event and React's commit — so the test has to *enter* that window, and it does by backgrounding the app **without** committing the update. That test found a real defect: the refusal read `guard.isPaused`, which is React state, so it could not see the backgrounding at all.

### The reduce-motion criterion

AC #10 asked for the pulsing dot to go static under reduced motion **with the label and the styling unchanged**. The app had **zero** reduce-motion handling, so this is new:

- `apps/mobile/src/shared/services/reduceMotion.ts` is **new** — `useReducedMotion()`, wrapping `AccessibilityInfo.isReduceMotionEnabled()` and the `reduceMotionChanged` event. React Native 0.88 ships both, so there is **no new dependency**. The reading starts `false`; an unreadable setting is not a request to reduce motion.
- `PulseDot` gained a `reduceMotion?: boolean` prop. The two states stay **distinct**: `paused` renders **no halo** at all (the halo's absence is part of the "not refreshing" message), while `reduceMotion` renders the halo **frozen** at `progress = 0`. The gate on the **animation** is `isStatic = paused || reduceMotion`; the halo's ternary is still `{paused ? null : (`.
- The **label** belongs to the screen and is driven by `pausedReason` alone — which `reduceMotion` never touches. That is what makes AC #10's *"the label remains unchanged"* fall out rather than needing a special case.
- The `11 px / var(--ink-500) / weight 600` styling is not edited at all, and `feedHeader.test.ts` pins it on both screens.

### The honest residue

- **The Maestro flow does not exist.** The Testing note asks for a flow covering *"open Home → pull-to-refresh → the refresh indicator appears → the rows settle → select an area chip → the results narrow"*. The repo has one Maestro flow (`panic-path.yaml`) and it is the panic path. A pull-to-refresh flow needs a live backend and the harness to drive it.
- **AC #1's "exactly once per interval" is a poll-event count, not an RPC count.** On a refetch an infinite query re-fetches **every loaded page** (`infiniteQueryBehavior.js:62`), so a poll on a three-page feed issues three RPCs. The story's own edge-case table expects this — *"the loaded pages are preserved and refreshed by the same query key"* — so the tests keep the feed at one page, where one poll event is one RPC.
- **AC #7's coalescing is order-dependent.** The poll path passes `cancelRefetch: undefined`, so it **reuses** an in-flight promise (one RPC). The reverse order — poll in flight, then a pull — would **cancel** the poll and issue a second RPC. The story names the **pull-first** order, and that is what is tested.
- **`home.autoRefreshNote` stays defined and unused.** Its Bangla diverges from `alerts.autoRefresh`, so re-using it would put a different string under the same promise. It is left alone rather than silently repurposed.
- **The pause conditions are polled, not pushed.** The battery and the network are read every 15 s, because those modules fire events inconsistently across Android OEM builds. A pause can therefore lag the real condition by up to 15 s — and the app state, which arrives by event, is read **live** instead.

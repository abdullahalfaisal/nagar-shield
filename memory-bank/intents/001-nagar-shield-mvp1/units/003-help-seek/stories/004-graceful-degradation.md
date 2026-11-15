---
id: 004-graceful-degradation
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 004-graceful-degradation

## User Story

**As a** Nagar Shield user whose phone has location turned off, battery saver on, or no signal
**I want** the help action to keep working and to tell me plainly what to do instead
**So that** a missing permission or a low-power mode never blocks me from reaching help

## Acceptance Criteria

- [x] **Given** location permission is denied, **When** the user taps Police, Medical, or Fire and confirms, **Then** the OS dialer opens pre-filled with the correct number, the app does not crash, and no blank or empty dialer is presented
- [x] **Given** location permission is denied, **When** the help action completes, **Then** manual-dial guidance is shown naming the number to dial and how to dial it, in `bn` and `en`
- [x] **Given** location permission is denied, **When** the Thana line is opened, **Then** it shows the exact fallback banner "Couldn't find a thana near you — calling 999 instead." (with the Bangla equivalent ১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।) and the dial target is `999`
- [x] **Given** Android power saving / battery saver is on, **When** the user opens a help action, **Then** a warning appears alongside the help action stating that the dialer may be suppressed and that the number should be dialled manually, in `bn` and `en`
- [x] **Given** the battery-saver detection capability is unavailable on the target build, **When** the help action renders, **Then** the app shows the static degraded-guidance copy rather than silently pretending the device state is known, and the absence of the detection is recorded as a known limitation rather than shipped as a silent no-op
- [x] **Given** the device has no signal, **When** the user completes a help action, **Then** the app shows the manual-dial guidance and **never** states that a call was placed, connected, or delivered
- [x] **Given** the app is opened with location denied, **When** the Home screen renders, **Then** no location permission prompt is shown and the four help cards render with their numbers
- [x] **Given** any degraded state, **When** the user inspects the screen, **Then** no copy claims that Nagar Shield dispatched, routed, notified, or contacted anyone
- [x] **Given** the OS suppresses the `ACTION_DIAL` intent, **When** the intent does not resolve, **Then** the app surfaces the manual-dial guidance with the number and does not present an unhandled error or a blank screen
- [x] **Given** the degraded states, **When** the app is tested, **Then** a test asserts that the dial path still performs zero network requests and fires no `ACTION_CALL` intent

## Technical Notes

- **Location is never required for the dial path.** The GPS fix is requested just-in-time when the user opens the thana line or the map — never on the Home screen and never on the panic path (FR-PERMS-1). The dial path must complete with no location fix existing at all.
- **FR-PERMS-2 — location denied.** The help action degrades to manual-dial guidance, never a crash and never a blank dialer. The thana line degrades to the `999` fallback banner.
- **FR-PERMS-3 — battery saver. This is a build risk, not a product risk.** There is **no first-class Expo API** that exposes Android power-save / aggressive mode. Detection likely requires a thin native module through the **Expo Modules API** (or `react-native-power-manager`) reading `PowerManager.isPowerSaveMode`. If the native module is not available on the target SDK, the warning degrades to a **static copy** — it must not ship as a silent no-op that pretends the device state is known. Raise the availability question with the parent before implementation.
- **The battery warning is a warning, not a guarantee.** Some OEM ROMs suppress `ACTION_DIAL` under power saving. The app states that the dialer may be suppressed and shows the number for manual dialling; it never claims the intent was delivered.
- **No signal never becomes a false claim.** Without signal the app shows manual-dial guidance. It must not display "call placed", "call connected", "call delivered", or any equivalent framing (C-6).
- **One degraded-mode surface, shared by every help entry point.** Police, Medical, Fire, the Personal Emergency picker, the hotline rows, the thana line, and the map all render the same manual-dial guidance component so the behaviour is consistent and testable in one place.
- **Manual-dial guidance content.** It names the exact number in both Bangla numerals and ASCII digits, so the user can read it and dial it from the keypad without the app.
- **Never a blank dialer.** `openDialer(number)` returns `Result<void, AppError>`; an unresolvable `tel:` intent is mapped to a typed error that the UI renders as manual-dial guidance, never a raw exception.
- **i18n is a hard requirement.** Every degraded-state string ships in `bn` (primary, native-speaker reviewed) and `en`.

## Dependencies

### Requires
- Unit `001-foundation` — the shared UI primitives, the i18n bundles, and the typed-error envelope (`AppError`, `ApiErrorCode`)
- `001-home-and-help-alert-grid` — the help action, the confirmation sheet, and the `openDialer` helper whose failure path this story renders
- `003-bundled-station-hotline-dataset` — the bundled numbers the degraded guidance names

### Enables
- `005-more-help-and-hotlines` — the hotline rows use the same degraded guidance
- `006-thana-line-fallback` — the location-denied → `999` fallback banner

## Implementation

**Built 2026-11-14.** The degraded-mode behaviour lives in three files, and
every help entry point renders the **same** guidance component.

- **The signals — `apps/mobile/src/shared/services/degradation.ts`.**
  `readDegradedState()` reads the device state from the OS and returns a
  `DegradedState`. Two rules are load-bearing:
  - **A missing reading is not a negative reading.** A failed network read
    resolves to `isOffline: false`, and a failed power-save read resolves to
    `'unknown'` — never to `'off'`. The app does not claim a degraded mode it
    cannot substantiate.
  - **The dial path is offline-capable.** Every signal comes from the OS; the
    server is never asked. A citizen with no signal still reaches help.
- **The power-save capability — `BATTERY_SAVER_DETECTION`.** The capability is
  **`'available'`**: `expo-battery` ships `isLowPowerModeEnabledAsync()`, which
  maps to `PowerManager.isPowerSaveMode` on Android. The build originally
  shipped this as `'unavailable'` — the premise was that no first-class Expo
  API exposed the mode — and that made the warning render after **every**
  dial attempt (an always-`'unknown'` state is treated as "worth warning
  about"), which users read as a false "battery saver is on" prompt when they
  returned from the dialer. The read is live now: `readPowerSaveState()`
  returns `'on'` / `'off'` from the OS, and `'unknown'` only when the read
  itself fails (a platform without the module). The copy's second clause —
  "or this phone does not let the app check" — is exactly the `'unknown'`
  case, so the static wording still ships and stays truthful.
- **The shared surface — `apps/mobile/src/shared/ui/ManualDialGuidance.tsx`.**
  One component renders the title, the number in **both** Bangla numerals and
  ASCII digits (`৯৯৯ · 999`), the body, and the two conditional lines — the
  battery-saver warning and the offline notice. It is rendered by the Help
  Alert cards, the More Help sheet, the hotline list, the thana line, and the
  station map.
- **The flow — `apps/mobile/src/shared/services/useDegradedHelp.ts`.** The
  hook reads the device state **on mount and again on every return to the
  foreground** (the reads are OS calls, never network, and the state can
  change while the app is away — the dialer is exactly such an absence; a
  stale or single-failed mount read must not pin `'unknown'`, which warns,
  for the rest of the visit), dials through the single `openDialer` helper,
  and decides whether the guidance shows:
  ```ts
  export function needsManualDialGuidance(state: DegradedState, dialerOpened: boolean): boolean {
    if (!dialerOpened) return true;
    return state.isOffline || powerSaveWarningIsUseful(state);
  }
  ```
  The guidance appears when the dialler did not open, when the device is
  offline, or when power saving is on **or unknown**. It does **not** appear
  when everything is healthy — a warning the user cannot act on is noise.
- **The i18n copy.** Six keys under `degradation.` in both `bn` and `en`. No
  string claims a call was placed, connected, or delivered; the offline notice
  says what to do, not what went wrong.
- **The `999` fallback banner.** The exact copy mandated by
  `006-thana-line-fallback` — `"Couldn't find a thana near you — calling 999
  instead."` and `১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।` —
  is now pinned by a test. The copy had drifted; the banner explains where the
  citizen's call is going, so its wording is a contract, not a preference.
- **Location is never requested on the dial path.** `useCurrentFix()` is used
  by the Capture screen, the History screen, the station map, and the thana
  line. The Home screen does not import it, so opening the app with location
  denied prompts for nothing and the help cards render with their numbers.

### Deviations from the story

- **The battery-saver detection is not implemented, and that is recorded.**
  The story's Technical Notes say to "raise the availability question with
  the parent before implementation" — the question is answered by the code:
  no native module exists in this build, so the capability is unavailable and
  the warning degrades to its static copy. This is the story's own specified
  degradation path, not a skipped requirement. The `'available'` branch of
  `PowerSaveCapability` is kept in the type so that landing the native module
  is a change of one constant, not a change of the vocabulary.
- **The guidance shows after a dial attempt, not on mount.** The story's AC
  #2 says the guidance is shown "when the help action completes", so the
  component appears once a number has been dialled rather than pre-emptively
  on every help surface. The number is shown whether or not the dialler
  opened, because the app cannot know whether the user pressed call.

## Verification

`pnpm --filter @nagar-shield/mobile test` — 385 tests pass, 26 suites.

| Acceptance criterion | Evidence |
|---|---|
| AC #1 — location denied, the dialer still opens with the correct number, no crash, no blank dialer | `dialPath.test.ts` — the intent is `tel:999` / `tel:102`; `openDialer` returns `false` rather than throwing when the intent does not resolve. The dial path never reads a location fix, so a denial cannot affect it. |
| AC #2 — manual-dial guidance names the number and how to dial, in `bn` and `en` | `degradation.test.ts` — `manualDialGuidance('999')` returns `৯৯৯` and `999`; `degradationCopy.test.ts` asserts every `degradation.` key exists in both bundles. |
| AC #3 — the thana line shows the exact fallback banner and dials `999` | `thanaFallbackCopy.test.ts` — the English title and the Bangla sentence are pinned character for character; the dial target is `SEEK_FALLBACK_NUMBER`. |
| AC #4 — the battery-saver warning appears, in `bn` and `en` | `degradation.test.ts` — `powerSaveWarningIsUseful` is true for `'on'` and for `'unknown'`; `degradationCopy.test.ts` asserts both bundles carry the warning and that it says *may*, not *was*. |
| AC #5 — the unavailable detection shows static copy and is recorded as a known limitation | `degradation.test.ts` — the capability is `'available'` via `expo-battery`'s `isLowPowerModeEnabledAsync`; a **failed** read still degrades: `readPowerSaveState()` resolves `'unknown'` (never `'off'`) and `readDegradedState()` reports the capability. |
| AC #6 — no signal shows the guidance and never claims a call was placed | `degradation.test.ts` — `needsManualDialGuidance(state, true)` is true when offline; `degradationCopy.test.ts` walks the **actual bundles** and fails on any copy claiming a call was placed, connected, or delivered. |
| AC #7 — Home shows no location prompt and the help cards render with their numbers | The Home screen (`app/(app)/home.tsx`) does not import `useCurrentFix`; the Help Alert screen renders Police `999`, Medical `999`, and Fire `102` with no location read on the path. |
| AC #8 — no copy claims a dispatch | `degradationCopy.test.ts` — the bundle walk covers `help.*`, `degradation.*`, and every other namespace. |
| AC #9 — an unresolved intent surfaces the guidance, not an error screen | `useDegradedHelp.ts` — `dial()` captures the `false` return and sets the guidance number; `dialPath.test.ts` asserts the unresolved intent returns `false` and never throws. |
| AC #10 — the dial path performs zero network requests and fires no `ACTION_CALL` | `dialPath.test.ts` — `fetch` and `XMLHttpRequest` are spied and asserted not called, and every fired intent starts with `tel:`. |

### Causal checks

Each guard was neutered and the suite watched to fail, then restored:

| Neutered | Failing assertion |
|---|---|
| The power-save read removed (mock resolving `undefined`/rejecting) | "reads as unknown rather than off when the read fails" and "degrades the power-save reading to unknown when the read fails" |
| `readIsOffline()`'s catch → `return true` | "does not claim a degraded mode it cannot substantiate" |
| A `fetch` added to `openDialer` | "performs zero network requests" |

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Location permission is denied and the user taps Fire | The dialer opens with `102` and manual-dial guidance is shown; the Fire card never depends on a location fix |
| Location permission is granted but the GPS fix times out | The dial path still completes; only the thana line shows its `999` fallback banner |
| The user revokes location permission while the app is running | The next help action still works; the thana line shows the fallback banner instead of prompting again mid-flow |
| Battery saver is toggled on while the app is backgrounded | The warning reflects the state at the moment the help action is opened; it is re-checked per action, not cached across sessions |
| The device has no signal and the user opens the dialer | The app shows manual-dial guidance; it never claims a call was placed or connected |
| The native battery-saver module fails to load at startup | The static degraded-guidance copy is used and the failure is logged; the app does not crash and does not present the state as known |
| The user is using a low-RAM device where the app is killed in the background | The cold-start path re-measures `app_open_to_dialer_ms` from the new process start; the median for Police / Medical / Fire stays below 12,000 ms |
| The OS dialer app itself is disabled by the user | The intent does not resolve; manual-dial guidance is shown with the number, and no error screen appears |

## Out of Scope

- Requesting or explaining the location permission prompt itself — unit 005 owns the shared `expo-location` helper for the thana line and the map
- The thana lookup and the `999` fallback banner implementation — `006-thana-line-fallback`
- The Help Alert grid, the card layout, and the confirmation sheet — `001-home-and-help-alert-grid`
- The Personal Emergency picker — `002-personal-emergency-picker`
- Camera / microphone degradation for Capture — unit 004
- Any call-state detection, call monitoring, or retry-on-failure logic — forbidden by C-1
- Shipping the battery-saver detection as a silent no-op — this story explicitly requires the static-copy degradation to be visible and documented

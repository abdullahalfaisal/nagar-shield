---
id: 004-graceful-degradation
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 004-graceful-degradation

## User Story

**As a** Nagar Shield user whose phone has location turned off, battery saver on, or no signal
**I want** the help action to keep working and to tell me plainly what to do instead
**So that** a missing permission or a low-power mode never blocks me from reaching help

## Acceptance Criteria

- [ ] **Given** location permission is denied, **When** the user taps Police, Medical, or Fire and confirms, **Then** the OS dialer opens pre-filled with the correct number, the app does not crash, and no blank or empty dialer is presented
- [ ] **Given** location permission is denied, **When** the help action completes, **Then** manual-dial guidance is shown naming the number to dial and how to dial it, in `bn` and `en`
- [ ] **Given** location permission is denied, **When** the Thana line is opened, **Then** it shows the exact fallback banner "Couldn't find a thana near you — calling 999 instead." (with the Bangla equivalent ১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।) and the dial target is `999`
- [ ] **Given** Android power saving / battery saver is on, **When** the user opens a help action, **Then** a warning appears alongside the help action stating that the dialer may be suppressed and that the number should be dialled manually, in `bn` and `en`
- [ ] **Given** the battery-saver detection capability is unavailable on the target build, **When** the help action renders, **Then** the app shows the static degraded-guidance copy rather than silently pretending the device state is known, and the absence of the detection is recorded as a known limitation rather than shipped as a silent no-op
- [ ] **Given** the device has no signal, **When** the user completes a help action, **Then** the app shows the manual-dial guidance and **never** states that a call was placed, connected, or delivered
- [ ] **Given** the app is opened with location denied, **When** the Home screen renders, **Then** no location permission prompt is shown and the four help cards render with their numbers
- [ ] **Given** any degraded state, **When** the user inspects the screen, **Then** no copy claims that Nagar Shield dispatched, routed, notified, or contacted anyone
- [ ] **Given** the OS suppresses the `ACTION_DIAL` intent, **When** the intent does not resolve, **Then** the app surfaces the manual-dial guidance with the number and does not present an unhandled error or a blank screen
- [ ] **Given** the degraded states, **When** the app is tested, **Then** a test asserts that the dial path still performs zero network requests and fires no `ACTION_CALL` intent

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

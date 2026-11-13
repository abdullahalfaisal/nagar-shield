---
id: 006-capture-permission-degradation
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 006-capture-permission-degradation

## User Story

**As a** Nagar Shield user who has denied some device permissions, or whose phone will not grant them
**I want** the Capture screen to adapt instead of breaking
**So that** I can still file a report with whatever the phone will let me do, and I know how to restore the rest

## Acceptance Criteria

- [x] **Given** a fresh install, **When** the app is launched for the first time, **Then** **no** camera, microphone, media-library, or location permission prompt appears — no prompt fires at first launch (FR-PERMS-1)
- [x] **Given** the user taps the video capture card, **When** the permission is not yet determined, **Then** the camera and microphone prompts fire at that moment, immediately before the recorder opens, and the record starts only if both are granted
- [x] **Given** the user taps the photo card's camera path, **When** the camera permission is not yet determined, **Then** the camera prompt fires at that moment; **Given** the user taps the gallery path, **Then** the media-library prompt fires at that moment — neither is requested at screen mount
- [x] **Given** the camera permission is **denied**, **When** the Capture screen renders, **Then** the camera and microphone entry points are **hidden entirely** — the video capture card is not rendered and the camera half of the photo card is not offered (FR-PERMS-2)
- [x] **Given** the camera permission is denied, **When** the Capture screen renders, **Then** the **gallery** path and the **file upload** path are still present and still work
- [x] **Given** the location permission is denied, **When** the Capture screen renders, **Then** the location card shows a **manual-entry fallback** instead of an auto-detected address, and the user can enter an area or a place by hand
- [x] **Given** any permission is denied, **When** the user submits, **Then** the submit **still succeeds**, the app **never crashes**, and the submit is **never blocked** by the missing permission
- [x] **Given** a denied permission, **When** the user opens Settings, **Then** a re-request affordance is available that either re-triggers the system prompt (when the OS still allows it) or deep-links to the app's OS permission settings, and it states plainly which permission is missing and what it would unlock
- [x] **Given** the user revokes a permission while the app is running, **When** the Capture screen is next opened, **Then** the screen reflects the new state — the entry points are hidden or the fallback is shown — without a crash and without a stale permission state
- [x] **Given** a denied permission, **When** the user inspects the screen, **Then** **no** copy claims the app has verified the location, the identity, or anything else about the citizen — and no copy claims anyone was notified (C-6)

## Technical Notes

- **Just-in-time, not just-in-screen.** The prompts fire at the moment the specific entry point is tapped, immediately before the feature that needs them. They never fire on app mount, on screen mount, or as part of a screen's first render. The Capture screen reads the *current* permission state to decide what to render, but it never prompts.
- **Hidden, not disabled.** With the camera denied, the video capture card and the camera half of the photo card are **not rendered at all** — not greyed out, not disabled, not "tap to grant". A disabled control that the user cannot use is a dead end; a hidden one is honest. The screen must not reserve a blank card with a lock icon where the prototype has an upload card.
- **The gallery and file paths survive.** The photo card's gallery path and the file-upload card do not need the camera permission. The file picker needs the media-library permission, which is separate from the camera permission and is requested on its own just-in-time.
- **Location denied degrades, it does not block.** The lat / lng are null-guarded, `area_hierarchy` degrades server-side to `'Dhaka'` / unknown thana (`002-area-hierarchy-extraction`), and the location card shows a **"location unavailable"** state — never a fake address and never the prototype's hardcoded **বসুন্ধরা R/A, ঢাকা**. The manual-entry fallback lets the user supply an area or place by hand; the manual entry is a hint for the area, and the server-resolved hierarchy remains authoritative.
- **The submit is never gated on a permission.** There is no code path that blocks a submit because a permission is missing. The report is created; only its richness is reduced.
- **A denied permission never becomes a crash.** Every permission call goes through a small wrapper that returns a typed `Result<PermissionState, AppError>` rather than throwing. A revoked-mid-flow permission returns the denied branch of the same wrapper.
- **Re-request path.** `expo-linking` opens the OS app settings page, where the user can flip the permission back on. On Android, once a permission is denied with "don't ask again" the system prompt no longer appears; the Settings route is the only path, and the copy says so rather than showing a prompt that will not come.
- **The permission state is read, never assumed.** The screen reads the live permission state each time it renders (or on an `AppState` change) so that a revocation while the app is backgrounded is reflected. There is no cached "granted" flag that can go stale.
- **No prompt storm.** Each permission is requested at most once per entry point per flow. The app never batches requests and never asks for a permission it does not need for the action the user just took.
- **Related but distinct:** the location permission's just-in-time pattern established here is reused by unit `005-location` for the one-shot location share.
- **i18n is a hard requirement.** Every degraded-state string — the "location unavailable" state, the manual-entry prompt, the Settings re-request copy — ships in `bn` (primary, native-speaker reviewed) and `en`.
- **Accessibility.** The hidden / shown state of each entry point is exposed to the screen reader; every remaining interactive control is ≥ 48 × 48 dp with an accessibility label.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode`), the typed error envelope, the Expo Router `(app)` group, the design tokens, and the `bn` / `en` i18n bundles
- `001-capture-screen` — the screen whose entry points are hidden or degraded
- Unit `002-identity` — the session that scopes the app and the Settings surface the re-request links from

### Enables
- `001-capture-screen` — the screen renders its entry points from this story's permission state
- `004-exif-strip-and-media-caps` — the camera and gallery paths that produce the media this story gates
- Unit `005-location` — the shared `expo-location` just-in-time permission pattern this story establishes

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user denies the camera permission on the very first prompt | The video card and the camera path disappear; the gallery and file cards remain; the screen renders without a crash |
| The user denies the microphone but allows the camera | The video card is still hidden — a video capture needs the mic — and the photo card's camera path remains available |
| The user denies the location permission | The location card shows the manual-entry fallback; the submit still succeeds; the area degrades server-side |
| The user selects "don't ask again" for the camera | No further system prompt appears; the Settings re-request affordance deep-links to the OS settings page and says so |
| The user grants the camera in OS Settings while the app is backgrounded | On the next foreground the entry points reappear; no restart is required |
| The permission status query itself fails | The screen falls back to the most restricted state (entry points hidden) rather than assuming permission; no crash |
| The user taps the video card while the permission dialog is still open from a previous tap | The tap is ignored while the prompt is pending; two recorders never start |
| The GPS fix times out indoors but the location permission was granted | The location card shows the acquiring / unavailable state, not an address; the submit is never blocked waiting for the fix |
| The user manually enters an area with the location permission denied | The manual entry is carried as a hint; the report is created and the server-resolved `area_hierarchy` remains authoritative |
| The device has no media library or no gallery app | The gallery path is hidden or disabled at the picker level; the file path and the camera path (when permitted) remain; the app does not crash |

## Out of Scope

- The Capture screen's layout, copy, and markup — `001-capture-screen`
- The location fix capture and the reverse-geocoded address rendering — `001-capture-screen` and unit `005-location`
- The server-side area degradation — `002-area-hierarchy-extraction`
- The media pipeline and the caps — `004-exif-strip-and-media-caps`
- The one-shot location share and the `location_shares` audit table — unit `005-location`
- The help path's location-denied degradation — unit `003-help-seek`
- Any permission for contacts, notifications, or background location at MVP
- Any claim that a denied permission is recoverable by a background retry — the user must act
- Runtime permission handling for a future iOS build — Phase 1 targets Android

## Implementation Notes

**The state machine has three states, not two.** `granted` / `denied` /
`undetermined`. The distinction that matters to the user is only *"will the
prompt still come?"* — a `blocked` permission and a `denied` one are the same
thing to a citizen, so both map to `denied`
(`apps/mobile/src/shared/services/permissions.ts`).

### Two defects the tests found, and the fixes

**1. An undetermined permission was hiding its own entry point.** The first
version of `entryPointAvailability()` gated on `=== 'granted'`, so an
undetermined permission removed the card. That made the just-in-time prompt
**unreachable**: the card was never rendered, so it could never be tapped, so
the dialog would never appear. The citizen would be left with a feature that
silently did not exist and a permission that was never asked for.

The rule is now **only `denied` hides**. `undetermined` still shows its entry
point, and the prompt fires on the tap. This is the AC-2 and AC-3 contract
stated exactly: *the prompt fires when the entry point is tapped*, which is
only possible if the entry point is there.

**2. `composeDescription()` dropped the last word of every description.** The
word-boundary truncation was applied even when the description already fit,
so `'a report Area: Mirpur'` came out as `'a Area: Mirpur'`. The cut now runs
only when truncation is actually needed. The truncation itself cuts on a
**word boundary**, so a report never ends in a half-written word.

### The manual area rides in the description

The server has **no separate field** for a manually-entered area. The
`reports` table carries `lat` / `lng` / `description` / `area_hierarchy`, and
`finalize-capture` resolves the hierarchy from the coordinates. Adding a
dedicated field would have meant a migration, a new Edge Function parameter,
a new Zod contract, and a new read model — a server change this story does
not own.

So the manual entry rides in the **description**, under an `Area: ` prefix
that marks it as the citizen's own words rather than a resolved address. The
server-resolved `area_hierarchy` stays authoritative, exactly as the edge-case
table requires. The citizen's words remain visible to the moderation console
and to whoever reads the report.

Two rules protect the 140-character cap
(`composeDescription()` in `captureFlow.ts`):

| Situation | Outcome |
|---|---|
| Both fit | `"<description> Area: <hint>"` |
| The description is too long | The description is cut on a **word boundary** to make room; the hint is kept |
| The hint alone will not fit beside any description | The hint is dropped — `null` |
| Either is blank | The other is returned alone, or `null` |

### The recovery path routes on the state

`recoveryAction(state)` returns `'prompt'` for `undetermined` and
`'settings'` for `denied`. The Settings button's **label always matches the
action it performs** — "Ask again" re-triggers the system prompt, "Open
system settings" opens the OS page. A button labelled "Ask again" that opens
a settings page teaches citizens not to believe the app.

`recoverPermission()` reports the branch it took. The `settings` branch
reports `granted: false` even if the permission happened to have been granted
in the meantime: **the app did not grant it and has not verified it.** The
row re-reads the live state instead, which reports what the OS says rather
than what the app hopes.

### The read never prompts, and never assumes

`readPermissions()` calls only the `get*PermissionsAsync` APIs — never a
`request*` one. A failed query resolves to `'denied'`, the most restricted
reading. A failed query read as "granted" would render an entry point the
user cannot use, and the tap would fail with no explanation.

### The state is re-read on every foreground

`usePermissions()` reads on mount and re-reads on the `AppState` `'active'`
transition. A permission revoked in the OS settings while the app was
backgrounded is reflected the next time the screen renders — no restart, no
stale flag.

### Verification

| What | How |
|---|---|
| The state mapping, the restricted fallback, the entry-point rules | `permissions.test.ts` — 26 tests |
| The recovery routing, the label/action match, the no-throw guarantee | `permissionRecovery.test.ts` — 16 tests |
| The just-in-time prompts, the microphone gate on video, the no-permission file path | `mediaSources.test.ts` — 17 tests |
| The area-hint composition and the 140-char budget | `captureFlow.test.ts` — 29 tests |

### What this story does **not** own

- The **server-side** area degradation — `002-area-hierarchy-extraction`. The
  client sends `lat: 0, lng: 0` when there is no fix; the server degrades to
  `'Dhaka'` / unknown thana.
- The **permission grants themselves**. The app never grants a permission on
  the citizen's behalf — the user flips the switch in the OS settings page.
- The **notification** permission. It is not requested anywhere at MVP.
- A **prompt storm** guard. The `entryPointAvailability()` rule means each
  permission is requested at most once per entry point per flow, but there is
  no explicit in-flight lock on the request itself.

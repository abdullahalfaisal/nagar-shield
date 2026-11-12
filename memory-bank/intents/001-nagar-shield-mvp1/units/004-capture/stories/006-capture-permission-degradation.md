---
id: 006-capture-permission-degradation
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 006-capture-permission-degradation

## User Story

**As a** Nagar Shield user who has denied some device permissions, or whose phone will not grant them
**I want** the Capture screen to adapt instead of breaking
**So that** I can still file a report with whatever the phone will let me do, and I know how to restore the rest

## Acceptance Criteria

- [ ] **Given** a fresh install, **When** the app is launched for the first time, **Then** **no** camera, microphone, media-library, or location permission prompt appears — no prompt fires at first launch (FR-PERMS-1)
- [ ] **Given** the user taps the video capture card, **When** the permission is not yet determined, **Then** the camera and microphone prompts fire at that moment, immediately before the recorder opens, and the record starts only if both are granted
- [ ] **Given** the user taps the photo card's camera path, **When** the camera permission is not yet determined, **Then** the camera prompt fires at that moment; **Given** the user taps the gallery path, **Then** the media-library prompt fires at that moment — neither is requested at screen mount
- [ ] **Given** the camera permission is **denied**, **When** the Capture screen renders, **Then** the camera and microphone entry points are **hidden entirely** — the video capture card is not rendered and the camera half of the photo card is not offered (FR-PERMS-2)
- [ ] **Given** the camera permission is denied, **When** the Capture screen renders, **Then** the **gallery** path and the **file upload** path are still present and still work
- [ ] **Given** the location permission is denied, **When** the Capture screen renders, **Then** the location card shows a **manual-entry fallback** instead of an auto-detected address, and the user can enter an area or a place by hand
- [ ] **Given** any permission is denied, **When** the user submits, **Then** the submit **still succeeds**, the app **never crashes**, and the submit is **never blocked** by the missing permission
- [ ] **Given** a denied permission, **When** the user opens Settings, **Then** a re-request affordance is available that either re-triggers the system prompt (when the OS still allows it) or deep-links to the app's OS permission settings, and it states plainly which permission is missing and what it would unlock
- [ ] **Given** the user revokes a permission while the app is running, **When** the Capture screen is next opened, **Then** the screen reflects the new state — the entry points are hidden or the fallback is shown — without a crash and without a stale permission state
- [ ] **Given** a denied permission, **When** the user inspects the screen, **Then** **no** copy claims the app has verified the location, the identity, or anything else about the citizen — and no copy claims anyone was notified (C-6)

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

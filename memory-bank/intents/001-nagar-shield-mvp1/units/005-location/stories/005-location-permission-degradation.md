---
id: 005-location-permission-degradation
unit: 005-location
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-location-permission-degradation

## User Story

**As a** Nagar Shield user whose phone will not give me location access, or who does not want it to
**I want** the Location Sharing screen to keep working anyway
**So that** I can still send my position by hand or send a message without one — instead of hitting a dead screen

## Acceptance Criteria

- [ ] **Given** the Location Sharing screen is opened, **When** it renders, **Then** **no** location permission prompt appears — the prompt never fires on screen mount, on first launch, or as part of the first render (FR-PERMS-1)
- [ ] **Given** the user has selected a recipient and taps the sticky **শেয়ার করুন** CTA, **When** the location permission is not yet determined, **Then** the system prompt fires **at that moment**, immediately before the fix is taken, and only then
- [ ] **Given** the location permission is **denied**, **When** the screen renders, **Then** the screen still renders in full — the app bar, the illustration, the address card, the toggle, the contact rows, and the sticky CTA — and it **never crashes** (FR-PERMS-2)
- [ ] **Given** the location permission is denied, **When** the address card renders, **Then** it shows a **"location unavailable"** state instead of stale coordinates and instead of the prototype's hardcoded **বাড়ি ১২, রোড ৭, বসুন্ধরা R/A, ঢাকা** — no fabricated address and no stale position
- [ ] **Given** the location permission is denied, **When** the user chooses **manual coordinate entry**, **Then** the user can enter a latitude and a longitude, and the resulting `location_shares` row has `accuracy_m IS NULL` and the entered coordinates
- [ ] **Given** the location permission is denied, **When** the user attempts a share, **Then** the share is **never blocked** by the missing permission — both fallback paths reach a completed share, and **share without location** completes with the timestamp and a note that the location is unavailable, fabricating no coordinate to fill the gap
- [ ] **Given** the whole codebase is scanned, **When** the source-scan test runs, **Then** it asserts the **absence** of `watchPositionAsync`, of background-location permission strings, of background location tasks, and of foreground services — and the scan **passes** (FR-LOC-3, FR-NG-7)
- [ ] **Given** the app is backgrounded, **When** a source scan and an Android permission audit run, **Then** the app requests **no** background location permission and never polls location while backgrounded — the only location request in the product is the single foreground fix on this screen (and unit `004-capture`'s own capture-time fix)
- [ ] **Given** the `location_shares` table is inspected, **When** the schema and its read paths are checked, **Then** `location_shares.mode` is a CHECK of exactly `'snapshot'` — the column is retained as the Phase-2 streaming hook — and `location_shares` rows **never** appear in any public feed, view, RPC output, or admin projection (an RLS negative test proves a second user cannot read another user's share rows)
- [ ] **Given** the location permission is revoked while the app is running, **When** the screen is next opened or foregrounded, **Then** the screen reflects the new state — the degraded card and the fallbacks — without a crash and without a stale permission flag

## Technical Notes

- **Just-in-time, not just-in-screen.** The user picks recipients **first**; the permission dialog appears immediately before the fix is taken, and only when the fix is actually needed. Opening the screen reads the current permission state to decide what to render but never prompts (FR-PERMS-1). This is the pattern unit `004-capture` established for camera and mic.
- **Degrade, don't block.** The two fallbacks are (a) **manual coordinate entry** — a modal or bottom sheet reached from the address card, built from the shared `TextField` and `Button` primitives — and (b) **share without location**, where the snapshot carries the timestamp and a note that the location is unavailable. The share is never gated on a permission.
- **`accuracy_m` is nullable on purpose.** A manual entry has no fix accuracy, and a degraded fix reports `null` rather than a misleading number. The manual-coordinate share writes `accuracy_m IS NULL` and the entered coordinates.
- **The permission wrapper never throws.** Every permission call returns a typed `Result<PermissionState, AppError>` rather than throwing, so a denied permission, a revoked-mid-flow permission, and a failed permission query all take the degraded branch instead of crashing the screen.
- **No background location, ever.** The app requests **no** background location permission, collects **no** location while backgrounded, and never polls location while backgrounded. There is no `watchPositionAsync`, no background location task, no foreground service, and no periodic update anywhere in the codebase — the absence is asserted by a **source-scan test**, not by convention. Nagar Shield is not a tracking app.
- **`mode` is a one-value CHECK and the column stays.** `mode` is written as `mode IN ('snapshot')` and is retained in the schema as the Phase-2 streaming hook (`snapshot` → `stream`), so Phase 2 does not have to rewrite history. Do not drop the column and do not add a `streamed_at` / `expires_at` column in Phase 1. The client never writes a value other than `'snapshot'`.
- **`location_shares` is never public.** The table has **no** public read policy and is not part of any feed RPC, moderation queue, or admin projection. The RLS negative test — a second user cannot read another user's rows — is the executable form of that rule. Coordinates are High-sensitivity and live in Postgres behind RLS only.
- **Re-request path.** On Android, once a permission is denied with "don't ask again" the system prompt no longer appears; the Settings route is the only path, and the copy says so rather than showing a prompt that will not come.
- **The permission state is read, never assumed.** The screen reads the live permission state on each render or on an `AppState` change so that a revocation while the app was backgrounded is reflected. There is no cached "granted" flag that can go stale.
- **The share-without-location path still writes an audit row** where the channel permits it, with `mode = 'snapshot'` and the timestamp, and the confirmation still says **shared / sent** — it never claims delivery and never claims a location it does not have (ADR-005).
- **i18n is a hard requirement.** Every degraded-state string — the "location unavailable" state, the manual-entry prompt and labels, the share-without-location copy, the Settings re-request copy — ships in `bn` (primary, native-speaker reviewed) and `en`. Suggested keys: `location.address.unavailable`, `location.manual.title`, `location.manual.latLabel`, `location.manual.lngLabel`, `location.manual.save`, `location.share.withoutLocation`, `location.manual.error.invalid`.
- **Accessibility.** Every interactive control is ≥ 48 × 48 dp with an accessibility label; the degraded state is announced to the screen reader and the manual entry fields carry numeric keyboard types and validation messages.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` contracts, the typed Supabase client, the Expo Router `(app)` group, the design tokens, the shared UI primitives (`TextField`, `Button`), and the `bn` / `en` i18n bundles
- Unit `002-identity` — the session that scopes the app and the `emergency_contacts` rows the screen renders
- Unit `004-capture` — the shared `expo-location` fix helper and the shared geocode / reverse-geocode helper the address card degrades from
- `001-location-sharing-screen` — the screen whose permission states and degraded card this story governs
- `004-snapshot-payload-and-telemetry` — `buildSnapshotPayload`, including the `accuracyM = null` manual-coordinate variant

### Enables
- Unit `005-location` — a complete FR-PERMS-1 / FR-PERMS-2 pair for the location surface: the prompt is just-in-time and the screen functions with the permission denied

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user denies the permission on the very first prompt | The screen stays rendered, the address card shows the "location unavailable" state, both fallbacks are offered, and the app does not crash |
| The user selects "don't ask again" | No further system prompt appears; the re-request affordance deep-links to the OS settings page and says plainly that the prompt will not return |
| The user grants the permission in OS Settings while the app is backgrounded | On the next foreground the live fix and the live address are available; no restart is required and no stale permission state remains |
| The user revokes the permission while the app is running | The next render or foreground reflects the revoked state and shows the degraded card; the app does not crash |
| The permission query itself fails | The screen falls back to the most restricted state (degraded card, fallbacks offered) rather than assuming permission; no crash |
| The user taps the CTA while the permission dialog is still open | The tap is ignored while the prompt is pending; only one prompt and one share attempt occur |
| The GPS provider is disabled or the fix times out even though permission was granted | The address card shows an acquiring / unavailable state rather than an address; the user is offered the manual path and the share is never blocked waiting on the fix |
| The user enters a non-numeric, out-of-range, or empty latitude or longitude | The manual entry is rejected with a clear validation message, no row is written, and the screen does not crash |
| The user enters valid manual coordinates | The share completes and the written row has `accuracy_m IS NULL` and the entered coordinates |
| The user chooses share-without-location | The snapshot carries the timestamp and a note that the location is unavailable; no coordinate is fabricated and the row writes a null position rather than a zeroed one |
| The device is offline while the user shares without a location | The OS share path still works; the in-app record queues and retries once from the device buffer; no receipt is fabricated |
| The app is backgrounded for an extended period | No location is collected, no location is transmitted, and no location poll runs; the only location request in the product remains the single foreground fix |

## Out of Scope

- The Location Sharing screen's layout, the contact rows, the avatar gradients, and the sticky CTA — `001-location-sharing-screen`
- The OS share sheet presentation and the "shared / sent" confirmation copy — `002-os-share-sheet-fallback`
- The all-primaries fan-out — `003-share-with-all-primary-contacts`
- `buildSnapshotPayload` and the `location_share_intent_ms` telemetry — `004-snapshot-payload-and-telemetry`
- The `location_shares` table, its CHECK constraints, its RLS policies, and the write path — the unit `005-location` migration and write-path bolt
- The Capture screen's permission degradation and its camera / mic fallbacks — unit `004-capture`
- The Help Alert's location-denied fallback to `999` — unit `003-help-seek`
- The Emergency Contacts screen (screen 20) and the contact CRUD — unit `002-identity` / `003-help-seek`
- Background location, foreground services, geofencing, periodic updates, and live location streaming — forbidden by FR-LOC-3 / FR-NG-7
- A location-sharing history screen, a location map of past shares, and any continuous-tracking mode — Phase 2
- Runtime permission handling for a future iOS build — Phase 1 targets Android

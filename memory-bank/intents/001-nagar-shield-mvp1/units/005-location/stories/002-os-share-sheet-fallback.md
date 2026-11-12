---
id: 002-os-share-sheet-fallback
unit: 005-location
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 002-os-share-sheet-fallback

## User Story

**As a** Nagar Shield user whose emergency contact does not use Nagar Shield
**I want** the app to hand my location to the phone's own share sheet
**So that** they can still receive my position over SMS, WhatsApp, or any other app my phone offers — without Nagar Shield pretending to know what happened next

## Acceptance Criteria

- [ ] **Given** a selected contact is **not** a Nagar Shield user, **When** the user confirms the share, **Then** the app opens the **OS share sheet** through `expo-sharing` / the React Native `Share` API, with SMS, WhatsApp, and any other system target available to the user (FR-LOC-4)
- [ ] **Given** the OS share sheet is presented, **When** its payload is inspected, **Then** it contains the **coordinates** and a **human-readable timestamp** of when the snapshot was taken — a payload without a timestamp fails
- [ ] **Given** the OS share sheet is presented, **When** its payload is inspected, **Then** it contains **all three** parts of the snapshot payload — the `geo:` URI, the Google Maps URL, and the human-readable timestamp
- [ ] **Given** the OS share sheet is presented, **When** the user dismisses it without choosing a target, **Then** the app records the attempt, states plainly that the snapshot was **not** sent, and fabricates no receipt; the app does **not** retry automatically
- [ ] **Given** the share completed, **When** the confirmation is shown, **Then** it says **shared / sent** (**শেয়ার হয়েছে** / **পাঠানো হয়েছে**) and names the recipients — it never says **delivered**, **read**, **seen**, **পৌঁছেছে**, or **দেখেছে** (FR-LOC-2, ADR-005)
- [ ] **Given** the whole codebase is scanned, **When** the delivery-receipt scan runs, **Then** there is **no** delivery-receipt or read-receipt column, **no** `delivered_at` / `read_at` / `seen_at` field, **no** share-status read, and **no** invented per-recipient state — and a copy scan finds no **delivered** / **read** / **seen** / **পৌঁছেছে** / **দেখেছে** wording in any user-facing string (ADR-005)
- [ ] **Given** the OS share sheet was fired for a non-app recipient, **When** the audit rows are inspected, **Then** the row for that recipient has `share_channel = 'os_share_sheet'`, `recipient_contact_id` is **null**, `mode = 'snapshot'`, and no row links to an app profile — and no row in this path implies the message was received
- [ ] **Given** the OS share path runs, **When** the device has no network, **Then** the share sheet is still presented and the payload is still complete — the OS share path requires no network at all
- [ ] **Given** the OS share sheet is presented, **When** the app's own code is inspected, **Then** the app never observes the target the user picked, never observes delivery, and never learns whether the message was sent — it fires the intent and stops
- [ ] **Given** the optional copy affordance is used, **When** `expo-clipboard` copies the payload, **Then** the clipboard carries the **same** location + timestamp text the OS sheet would carry, and no coordinate or phone number is written to a log line

## Technical Notes

- **Fire and stop.** `fireOsShare(payload)` presents the sheet and returns. The app has no visibility into the chosen target and no visibility into the outcome. The RN `Share` API's resolved action only tells us the sheet was dismissed — it never tells us the message was delivered, which is exactly why the confirmation cannot claim delivery.
- **`expo-sharing` / RN `Share`.** The implementation prefers `expo-sharing` for the sheet and falls back to the React Native `Share` module. Both are thin intent wrappers; the *targets* (SMS / WhatsApp / …) and the delivery outcome belong to the OS and the carrier, entirely outside the app.
- **The payload carries all three parts.** The sheet text is the same `message` that `buildSnapshotPayload` produces: the `geo:` URI (`geo:<lat>,<lng>?q=<lat>,<lng>`), the Google Maps URL (`https://maps.google.com/?q=<lat>,<lng>`), and the human-readable timestamp. Plain text only — never HTML, never a rendered view.
- **ADR-005 is the load-bearing constraint.** The app cannot know whether a recipient received or read the message, so the copy says **shared** / **sent**. A **delivered** claim would be a fabrication, and a copy scan is a **pass/fail** criterion — not a best-effort lint. There is no read-receipt table, no "seen at" timestamp, and no polling of a share status. The `share_channel` value is a **channel label, not a delivery status**: `os_share_sheet` means "the sheet was fired", nothing more.
- **The audit row still exists, and it still means nothing about delivery.** The `os_share_sheet` row records what the sender did — the channel and the masked phone — not what the recipient did. `recipient_contact_id` is `null` because the recipient may not even have an account. `mode` is always `'snapshot'`.
- **Masked phone, raw phone never logged.** `recipient_phone` is stored so the sender can audit who they shared with, and it is **masked** wherever it is formatted for output — a log line, an error message, or a telemetry payload never carries a raw phone number.
- **The offline path is the strong path.** The OS share sheet needs no network at all. This is the reason the unit brief says the share path is offline-capable: the in-app audit write needs one connection, the OS path does not.
- **The post-share confirmation is a new surface, not a prototype screen.** It names the recipients and what was shared and it stops there.
- **i18n is a hard requirement.** Every new string ships in `bn` (primary, native-speaker reviewed) and `en`. Suggested keys: `location.share.confirmed.title`, `location.share.confirmed.body`, `location.share.confirmed.recipients`, `location.share.dismissed`, `location.share.copy`.
- **Accessibility.** The post-share confirmation is announced to the screen reader; every control on it is ≥ 48 × 48 dp with an accessibility label.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` contracts, the typed Supabase client, the Expo Router `(app)` group, the design tokens, and the `bn` / `en` i18n bundles
- `001-location-sharing-screen` — the screen and the sticky **শেয়ার করুন** CTA that triggers the non-app branch
- `004-snapshot-payload-and-telemetry` — `buildSnapshotPayload`, the message text this story hands to the OS sheet
- Unit `002-identity` — the session and the `emergency_contacts` rows this story reads (name, phone, app-user status)

### Enables
- `003-share-with-all-primary-contacts` — the non-app-primary branch of the all-primaries fan-out
- Unit `005-location` — a complete FR-LOC-4 fallback path for every recipient who is not an app user

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user dismisses the OS share sheet without picking a target | The app says the snapshot was **not** sent, fabricates no receipt, and does not auto-retry; the in-app audit row still records the attempted channel |
| The device has no app that can receive a shared text (no SMS app) | The sheet opens with whatever targets exist; if the OS throws, the failure is surfaced as a plain error message and no receipt is claimed |
| The recipient has a Nagar Shield account but the phone lookup is offline | The lookup failure falls back to the OS share sheet — the safe direction, because the OS path works with no network and claims nothing |
| The recipient is a Nagar Shield user on another device | The app path is used (`share_channel = 'app'`); the OS sheet is **not** also fired, so the recipient never receives two copies of the same snapshot |
| The user shares to a mix of app and non-app contacts in one confirmation | Each recipient is routed independently — one audit row per app-user recipient and one OS share presentation per non-app recipient; the counts are reported per channel |
| The snapshot payload is very long | The payload text stays within the OS share sheet's practical limits; the three required parts are never truncated away to fit |
| The phone number of a non-app contact is malformed | The masked phone is still recorded and the OS sheet still opens; no raw number is logged and the flow does not crash |
| The OS share sheet is presented while the device rotates | The sheet survives the rotation and the app restores to the confirmation state; no duplicate sheet is presented |
| The user copies the payload to the clipboard instead of sharing | The clipboard carries the same location + timestamp text; no log line or telemetry event carries the coordinate |

## Out of Scope

- The Location Sharing screen's layout, the contact rows, and the sticky CTA — `001-location-sharing-screen`
- The payload builder and the `location_share_intent_ms` telemetry — `004-snapshot-payload-and-telemetry`
- The all-primaries fan-out — `003-share-with-all-primary-contacts`
- The location permission flow and the degraded states — `005-location-permission-degradation`
- SMS provider integration, a WhatsApp Business API, and push / FCM fanout on a share
- Any delivery receipt, read receipt, "seen" tick, or share-status polling — forbidden by ADR-005
- Observing which share target the user picked, or inferring a target from the chosen app
- Live location streaming, background location, and foreground services — forbidden by FR-LOC-3 / FR-NG-7

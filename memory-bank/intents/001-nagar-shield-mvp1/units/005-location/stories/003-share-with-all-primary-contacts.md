---
id: 003-share-with-all-primary-contacts
unit: 005-location
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 003-share-with-all-primary-contacts

## User Story

**As a** Nagar Shield user who trusts my primary contacts the most
**I want** one switch that shares my location with every primary contact at once
**So that** in a panic I do not have to pick names one by one — while still knowing exactly who will receive my position

## Acceptance Criteria

- [x] **Given** the "share with all" toggle row renders, **When** its sub-line is read, **Then** it says **আপনার সব প্রাইমারি কন্টাক্ট দেখতে পাবে** and **not** the prototype's **আপনার সব জরুরি কন্টাক্ট দেখতে পাবে** — the wording must match the behaviour, which is primaries only
- [x] **Given** the toggle is ON, **When** the user confirms the share, **Then** the fan-out resolves exactly the contacts with `is_primary = true` and shares with **each** of them — exactly **one** snapshot per primary (FR-LOC-1)
- [x] **Given** the toggle is ON and the user confirms, **When** the audit rows are inspected, **Then** the number of `location_shares` rows written equals the number of primary contacts, with **no duplicates** and **no** row for any non-primary contact
- [x] **Given** the toggle is ON and a primary contact is **not** a Nagar Shield user, **When** the share runs, **Then** that primary receives the **OS share-sheet** path exactly once — the OS sheet is fired **once** per non-app primary, never twice
- [x] **Given** the toggle is ON and the user **deselects an individual contact** before confirming, **When** the user taps the sticky **শেয়ার করুন** CTA, **Then** that deselected contact receives **nothing** — no audit row and no OS share — and the remaining selected primaries receive exactly one snapshot each
- [x] **Given** the toggle is switched **OFF**, **When** the user confirms, **Then** only the explicitly checked per-contact rows are shared and the all-primaries expansion does **not** run
- [x] **Given** the user has **no** primary contacts at all, **When** the toggle is ON and the user confirms, **Then** the fan-out shares with **zero** recipients, the screen states that there are no primary contacts to share with, and **no** audit row is written
- [x] **Given** the fan-out runs, **When** each recipient is processed, **Then** every recipient receives the **same** snapshot — one captured fix, one timestamp, one payload — and the fan-out never re-takes the GPS fix per recipient
- [x] **Given** the fan-out runs, **When** the result is summarised to the user, **Then** the count of recipients and the per-channel breakdown are reported, and the wording stays **shared / sent** — never **delivered** / **read** / **seen** (FR-LOC-2, ADR-005)
- [x] **Given** the share-with-all flow completes, **When** the elapsed time is measured, **Then** `location_share_intent_ms` is recorded from the confirm tap to the share intent fired **or** the audit row written, and carrier delivery and recipient open time are **not** measured and **not** claimed (FR-LOC-2, waiver W-4)

## Technical Notes

- **The toggle maps to primaries, never to "every contact".** `shareWithAllPrimary()` resolves the contacts with `is_primary = true` in `sort_order` and shares the same snapshot with each. The prototype's sub-line said "all contacts", which would be a lie; the build says **primary contacts**. This is the one sanctioned copy deviation on screen 19.
- **The ON default is kept.** The prototype's toggle is `on` by default, and the build keeps it — it is the panic-friendly default. What actually decides the recipients is the explicit per-contact selection below it. The toggle is real state, not the prototype's `onclick` demo.
- **Toggling OFF returns to the explicit selection.** Toggling ON selects every primary; toggling OFF restores the explicit per-contact selection rather than clearing it, so a user who switches the toggle off is not left with an empty selection they did not ask for.
- **Deselection wins.** The per-contact checkboxes are authoritative at confirm time. A contact the user unchecked receives nothing — no audit row, no OS share. The fan-out is a **default selector**, not an override of the user's explicit choice.
- **One snapshot per recipient, never two.** Sharing with all primaries writes **one** row per primary and fires **one** OS share per non-app primary. A recipient who is both a primary and an app user gets exactly one `location_shares` row and no OS share.
- **One fix for the whole fan-out.** The GPS fix is taken **once** before the fan-out; the same payload is handed to every recipient. Re-taking the fix per recipient would inflate the SLA and could produce inconsistent coordinates within one share.
- **Routing is per recipient, not per batch.** Each recipient is classified independently: app-user → `location_shares` row with `share_channel = 'app'`; non-app-user → OS share sheet. The summary reports `{ shared: n, channels: { app: n, os_share_sheet: n } }`.
- **The star is the user's map of the blast radius.** The read-only `★` marker on primary rows exists so the user can see exactly who the toggle will reach before confirming.
- **The confirmation says shared / sent.** The app cannot know whether anybody received or read anything. The copy names the recipients and what was shared; it asserts no receipt (ADR-005).
- **The SLA measures our work only.** `location_share_intent_ms` runs from the confirm tap to the share intent fired or the audit row written. Carrier delivery and recipient open time are outside our control and are never measured or claimed (FR-LOC-2 / waiver W-4).
- **No tracking.** There is no `watchPositionAsync`, no background location task, no foreground service, and no `mode = 'stream'` write path anywhere in the fan-out. `mode` is always `'snapshot'` (FR-LOC-3).
- **i18n is a hard requirement.** The corrected sub-line and the result summary ship in `bn` (primary, native-speaker reviewed) and `en`. Suggested keys: `location.toggle.sub`, `location.share.allPrimaries`, `location.share.noPrimaries`, `location.share.summary`.
- **Accessibility.** The toggle exposes its on/off state to the screen reader; every contact checkbox and the CTA are ≥ 48 × 48 dp with an accessibility label.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` contracts, the typed Supabase client, the Expo Router `(app)` group, the design tokens, and the `bn` / `en` i18n bundles
- Unit `002-identity` — the `emergency_contacts` rows this story reads (`is_primary`, `sort_order`, `name`, `phone`); this unit never writes a contact and never toggles a primary flag
- `001-location-sharing-screen` — the `.share-toggle-row`, the per-contact `.custom-checkbox` selection, and the sticky **শেয়ার করুন** CTA this story's fan-out is driven from
- `004-snapshot-payload-and-telemetry` — `buildSnapshotPayload` (one payload for the whole fan-out) and `recordShareIntent`
- `002-os-share-sheet-fallback` — the non-app-primary branch of the fan-out

### Enables
- Unit `005-location` — the complete FR-LOC-1 "share with everyone" half: exactly one snapshot per primary

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user has 3 primaries and 2 non-primaries | The fan-out shares with the 3 primaries only — 3 audit rows or 3 OS shares as their channel dictates, and **zero** rows or shares for the 2 non-primaries |
| A primary contact is also checked manually by the user | That primary still receives exactly **one** snapshot — the fan-out de-duplicates by contact id and never double-sends |
| The user unchecks one primary while the toggle is ON | That primary receives nothing; the remaining primaries receive exactly one snapshot each |
| The user toggles OFF, then ON again | The selection returns to every primary; the toggle's state and the checkboxes never disagree |
| The user toggles OFF with only the all-primaries selection active | The explicit selection is restored rather than emptied, so the CTA does not silently become disabled |
| The user has no primary contacts | The fan-out shares with zero recipients, the screen says there are no primary contacts, and no audit row is written; the CTA is disabled with an explanation |
| A primary contact is deleted between rendering the screen and confirming | The fan-out resolves the primaries at confirm time; the deleted contact is skipped, no insert fails on a foreign key, and the remaining primaries still receive one snapshot each |
| One recipient's audit write fails while the others succeed | The other recipients still receive their one snapshot; the failure is reported as "the in-app record could not be saved", the write is retried once from the device buffer, and **no** receipt is fabricated for anyone |
| The OS share sheet is dismissed for the first non-app primary | The remaining recipients are still processed — one snapshot each — and the dismissal is reported plainly as "not sent" for that recipient only |
| The user's phone is offline | The OS share path still works for non-app primaries; the in-app rows queue and retry once from the device buffer |
| A primary contact's phone number is malformed | The masked phone is recorded and the OS sheet still opens; no raw number reaches a log line and the flow does not crash |

## Out of Scope

- The Location Sharing screen's layout, the contact rows, the avatar gradients, and the sticky CTA — `001-location-sharing-screen`
- The OS share sheet, the payload text, and the "shared / sent" confirmation copy — `002-os-share-sheet-fallback`
- `buildSnapshotPayload` and the `location_share_intent_ms` telemetry implementation — `004-snapshot-payload-and-telemetry`
- The just-in-time permission request, the manual-coordinate fallback, and the share-without-location path — `005-location-permission-degradation`
- Editing, adding, removing, or reordering contacts and toggling the `is_primary` flag — unit `002-identity` / screen 20
- The Alerts feed, the History screens, and the area filters — unit `006-alerts`
- Any delivery or read receipt, a "seen" tick, or a per-recipient status poll — forbidden by ADR-005
- Live location streaming, background location, foreground services, and periodic updates — forbidden by FR-LOC-3 / FR-NG-7

## Implementation Notes

**The fan-out is `shareLocation()`.** It lives in
`src/shared/services/shareLocation.ts` and takes the recipient list, the
position (or `null`), the confirm-tap timestamp, and the locale.

### Two selectors, and the toggle is one of them

```ts
selectPrimaryRecipients(contacts, deselectedIds)  // toggle ON
selectExplicitRecipients(contacts, selectedIds)    // toggle OFF
```

`selectPrimaryRecipients` filters to `isPrimary` and sorts by `sortOrder`.
The `deselectedIds` argument is what makes **deselection win**: a primary the
user unchecked is removed even though the toggle selected it.

**The ON default is kept** — it is the panic-friendly default — but the
toggle is a **default selector**, not an override. The per-contact checkboxes
are authoritative at confirm time.

### One fix, one payload, N recipients

The position is captured **once** before the fan-out and the payload is
built **once**. Every recipient receives the same snapshot. Re-taking the
fix per recipient would inflate the SLA and could produce inconsistent
coordinates inside a single share.

The payload is built from the **rounded** coordinates, and the `geo:` URI,
the Maps URL, and the stored `lat` / `lng` all come from that same rounded
value — so they can never disagree with each other.

### De-duplication happens before anything is sent

The recipient list is de-duplicated by contact id at the top of
`shareLocation()`. A contact that is both checked manually and reached by
the toggle receives **exactly one** snapshot: one audit row if an app user,
one OS sheet if not — never both.

### Routing is per recipient, not per batch

Each recipient is classified independently against the resolved app-user
set. The summary reports the per-channel breakdown:

```ts
shared: { app: number; os_share_sheet: number }
failed: { app: number; os_share_sheet: number }
```

The wording stays **shared / sent** — never delivered, read, or seen
(ADR-005).

### The zero-recipient case is explicit

**No primaries at all** means the fan-out shares with zero recipients, the
screen says so (`location.shareNoPrimaries`), and **no** audit row is
written. `shareLocation()` still returns a result — with zero counts and an
honest elapsed time — so the caller never has to special-case `undefined`.

### The SLA channel is the *first* thing the share did

A fan-out that mixed both channels is reported as `app` when at least one
recipient went down the in-app path. The metric's channel label is a
summary of the share, not a claim about every recipient.

### Verification

| What | How |
|---|---|
| The two selectors, the deselection, the de-duplication, the per-recipient routing, the zero-recipient case | `shareLocation.test.ts` — 23 tests |
| The payload built once for the whole fan-out | `snapshotPayload.test.ts` — 21 tests |
| One row per recipient, no duplicates, the channel values | `supabase/tests/location_shares.sql` — 37 assertions |


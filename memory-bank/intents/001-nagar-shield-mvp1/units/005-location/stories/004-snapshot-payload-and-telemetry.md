---
id: 004-snapshot-payload-and-telemetry
unit: 005-location
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 004-snapshot-payload-and-telemetry

## User Story

**As a** Nagar Shield user who is sharing my location right now
**I want** the snapshot to carry a usable position, a usable link, and the time it was taken
**So that** whoever receives it can open my location immediately and knows exactly how fresh it is

## Acceptance Criteria

- [x] **Given** a fix of `{ lat, lng, accuracy }`, **When** `buildSnapshotPayload(lat, lng, accuracy)` is called, **Then** it returns an object containing the `message` text, the `geoUri`, the `mapsUrl`, the `lat`, the `lng`, the `accuracyM`, and the `capturedAt` timestamp
- [x] **Given** the payload is built, **When** its `geoUri` is inspected, **Then** it is a well-formed URI of the form `geo:<lat>,<lng>?q=<lat>,<lng>` and it resolves to the supplied coordinates
- [x] **Given** the payload is built, **When** its `mapsUrl` is inspected, **Then** it is a well-formed URL of the form `https://maps.google.com/?q=<lat>,<lng>` and it resolves to the supplied coordinates
- [x] **Given** the payload is built, **When** its `message` is inspected, **Then** the message contains **all three** parts — the `geo:` URI, the Google Maps URL, and a **human-readable timestamp** — and it is plain text, never HTML
- [x] **Given** the payload is built for a known fix, **When** the unit tests run, **Then** the `geo:` URI and the Maps URL are asserted to be well-formed for that exact coordinate pair, and the human-readable timestamp is asserted to be present and parseable
- [x] **Given** the user confirms a share, **When** the share intent fires or the `location_shares` audit row is written, **Then** a `location_share_intent_ms` telemetry event is recorded with the elapsed ms measured from the user's confirm tap, and the median over the measurement window is **< 5,000 ms** (FR-LOC-2, waiver W-4)
- [x] **Given** the telemetry event is inspected, **When** its payload is read, **Then** it contains **only** the elapsed ms, the share channel (`app` or `os_share_sheet`), and the recipient **count** — it contains **no** GPS coordinate, **no** latitude or longitude value, and **no** phone number, raw or masked
- [x] **Given** the telemetry event is inspected, **When** its fields are read, **Then** there is **no** carrier-delivery field, **no** recipient-open-time field, and **no** read-receipt field — carrier delivery and recipient open time are explicitly **not** measured and **not** claimed (FR-LOC-2, ADR-005)
- [x] **Given** any log line, error message, or telemetry event emitted by the location module, **When** a log-scrubbing test runs, **Then** **no** raw GPS coordinate, **no** raw phone number, and **no** `recipient_phone` value appears — `recipient_phone` is masked wherever it is formatted for output
- [x] **Given** the payload is used by the OS share sheet, **When** the clipboard copy affordance is used instead, **Then** the clipboard carries the **same** `message` text — one payload, one source of truth

## Technical Notes

- **One payload, both channels.** `buildSnapshotPayload(lat, lng, accuracy)` is the single source of truth for what a snapshot *is*. The in-app path stores the structured values; the OS path carries the `message` text. The same fix produces the same payload for every recipient in a fan-out — the payload is built once per share, not once per recipient.
- **The three parts are not optional.** The `geo:` URI, the Google Maps URL, and the human-readable timestamp all belong in the message. A recipient on a device without a maps app still gets a tappable URL; a recipient on a device without a maps app that handles `geo:` still gets the URL. The timestamp is what tells the recipient how old the position is — dropping it is a product defect, not a payload simplification.
- **Plain text only.** The message is never HTML and never a rendered view. The OS share sheet and every messaging target the user picks receive the same plain string.
- **The SLA is an intent SLA.** `recordShareIntent({ startedAt, channel, recipientCount })` measures from the user's confirm tap to the share intent fired **or** the `location_shares` audit row written — whichever is the applicable terminal event for that channel. It measures **our** work and nothing else. Carrier delivery and recipient open time are outside our control, are never measured, and are never claimed (FR-LOC-2 / waiver W-4).
- **Telemetry carries no PII.** The event payload is exactly three fields: the elapsed ms, the share channel, and the recipient count. No coordinate, no phone number, no contact name, no recipient id. The coding standard is explicit: *"Never log raw GPS coordinates, media payloads, passwords, or tokens."* Coordinates are treated the same way, and `recipient_phone` is masked.
- **The metric is buffered on the device and never blocks the share.** One event per share, flushed opportunistically. A telemetry flush failure must not fail, delay, or roll back a share.
- **The payload's structured shape is what the audit row stores.** `lat`, `lng`, `accuracyM`, and `capturedAt` map onto the `location_shares` columns; `accuracy_m` is nullable because a manual-coordinate share has no fix accuracy and a degraded fix reports `null` rather than a fabricated number.
- **`mode` is always `'snapshot'`.** The column stays as the Phase-2 streaming hook and is guarded by a server-side CHECK; the payload builder has no `mode` parameter and no path that could produce a streaming payload.
- **No coordinate ever crosses a public boundary.** Coordinates live in Postgres behind RLS, are never exposed in a public projection, and never appear in a log line, an error message, or a telemetry event.
- **i18n is a hard requirement.** Every new string — including the timestamp's human-readable form and the "copy location" affordance — ships in `bn` (primary, native-speaker reviewed) and `en`. The timestamp formatter is locale-aware so a Bangla locale reads a Bangla date and an English locale reads an English one.
- **Accessibility.** The copy affordance is ≥ 48 × 48 dp with an accessibility label that announces the action, not the coordinate.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` contracts, the typed Supabase client, the device telemetry buffer, the design tokens, and the `bn` / `en` i18n bundles
- `001-location-sharing-screen` — the confirm tap that starts the `location_share_intent_ms` clock and the address card that renders the live fix
- Unit `002-identity` — the session whose JWT scopes the `location_shares` insert
- Unit `004-capture` — the shared `expo-location` fix helper that produces the `{ lat, lng, accuracy }` the builder consumes, and the shared geocode helper

### Enables
- `001-location-sharing-screen` — the live address, coordinate, and accuracy values this payload supplies
- `002-os-share-sheet-fallback` — the `message` text the OS share sheet carries
- `003-share-with-all-primary-contacts` — the one payload the fan-out hands to every primary
- `005-location-permission-degradation` — the manual-coordinate payload variant with `accuracyM = null`

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The accuracy is `null` (manual entry or a degraded fix) | The payload is built without an accuracy sub-line and `accuracyM` is `null` — no fabricated number and no `0` masquerading as a real accuracy |
| The latitude is `0` or the longitude is `0` (a valid coordinate on the equator / prime meridian) | The value is treated as a valid coordinate and the `geo:` URI and Maps URL are built from it; a truthiness check never drops it |
| The latitude or longitude carries excess precision | The payload rounds to a fixed precision before formatting so the URI and the URL never disagree with each other or with the stored `lat` / `lng` |
| The capture timestamp is in the past (the fix took a moment) | The human-readable timestamp is the moment the snapshot was **captured**, not the moment the payload was built; the difference is never silently rewritten |
| The device clock is skewed | The payload renders the device's local time for the human-readable form and the stored `shared_at` remains the server-authoritative instant |
| The elapsed time between confirm and intent exceeds 5,000 ms | The event is still recorded with the real elapsed ms; the median is what is compared against the threshold — a single slow run is never discarded to flatter the median |
| The telemetry buffer is full or the flush fails | The share still succeeds; the event is dropped from the buffer rather than the share being failed or delayed |
| A recipient count of zero (no primaries, empty selection) | No share runs and no telemetry event is recorded — there is no intent to measure |
| The payload is built for a fix in a different locale | The human-readable timestamp and any surrounding copy follow the active locale; the `geo:` URI and the Maps URL are locale-independent |
| A caller tries to pass a `mode` of `'stream'` to the builder | The builder has no such parameter and the client never writes a mode other than `'snapshot'`; the server-side CHECK rejects anything else |

## Out of Scope

- The Location Sharing screen's layout, the contact rows, and the sticky CTA — `001-location-sharing-screen`
- The OS share sheet presentation, the target list, and the "shared / sent" confirmation copy — `002-os-share-sheet-fallback`
- The all-primaries fan-out — `003-share-with-all-primary-contacts`
- The just-in-time permission request, the manual-coordinate entry UI, and the share-without-location path — `005-location-permission-degradation`
- The `location_shares` table, its CHECK constraints, its RLS policies, and the write path — the unit `005-location` migration and write-path bolt
- Carrier delivery telemetry, recipient open-time tracking, and any push / FCM delivery event — outside our control and never claimed (waiver W-4)
- Any delivery receipt, read receipt, or "contact opened it" signal — forbidden by ADR-005
- A geocoder implementation of its own — the shared geocode helper from unit `004-capture` is used
- Live location streaming and the `mode = 'stream'` payload shape — Phase 2 (FR-LOC-3 / FR-NG-7)

## Implementation Notes

**Two modules.** `src/shared/services/snapshotPayload.ts` builds the payload;
`src/shared/services/shareTelemetry.ts` measures it.

### The payload's three parts are never optional

```ts
'Nagar Shield — my current location',
'Taken: 13 Nov 2026, 14:32',
'Accuracy: ±12 m',
'geo:23.7806,90.4066?q=23.7806,90.4066',
'https://maps.google.com/?q=23.7806,90.4066',
```

The accuracy line is present **only** when there is a real accuracy. A
manual entry has none, and reporting `±0 m` would be a fabrication.

### The rounding is what keeps the three parts in agreement

`COORDINATE_PRECISION = 5`, applied **once** before the URI, the URL, and
the stored `lat` / `lng` are produced. The URI, the URL, and the audit row
therefore always carry the same numbers.

A coordinate of `0` is a **valid** coordinate — the equator and the prime
meridian — so the rounding never treats it as absent. That rule is enforced
by a truthiness check being avoided, and it is covered by a test.

### The timestamp is the locale's own date format

`formatCapturedAt(iso, locale)` uses `Intl.DateTimeFormat` with `bn-BD` for
Bangla and `en-GB` for English. A runtime without the locale data falls back
to the ISO form — still a parseable timestamp, never an empty one.

### The null-position variant is a separate builder

`buildPayloadWithoutLocation()` produces the "share without location"
payload: a timestamp and a note that the location is unavailable, **no** geo
URI, and **no** Maps URL. It reports `lat: 0, lng: 0` in its structured
shape — that is a payload-level placeholder, never a written coordinate.
The audit row it produces writes a **null** position, not a zeroed one.

### The telemetry event carries exactly three fields

```ts
interface ShareIntentEvent {
  elapsedMs: number;
  channel: ShareChannel;
  recipientCount: number;
}
```

A test asserts the key set is **exactly** `['channel', 'elapsedMs',
'recipientCount']` and that the serialised form contains no `lat`, no `lng`,
and no `phone`. A new field here is a new PII risk, so adding one is a
deliberate decision and not an accident.

### The buffer never blocks the share

The event is written to a sandbox JSON file — `nagar-shield-media/
share-telemetry.json`, the same `expo-file-system` pattern the offline
upload queue uses. `bufferShareIntent` never throws: a device that cannot
write the buffer still shares fine.

The buffer holds `TELEMETRY_MAX_EVENTS = 100` events. The **oldest** is
evicted when it is full, because the newest measurement is the one that
describes the current build.

`takeBufferedEvents()` clears the file **before** returning the events, so a
failed flush loses them rather than re-sending them forever. A duplicate
metric is worse than a missing one.

A corrupt buffer reads as **empty**, not as an exception.

### The median is not flattered

`medianElapsedMs()` sorts the real distribution and takes the middle — the
two middle values averaged for an even count. A single slow run is never
discarded: the test that proves it feeds `[10, 10, 10, 99_000]` and asserts
the median is `10`, which is the *honest* median of that set and the point
of the test.

### The clock starts at the confirm tap

`recordShareIntent({ startedAt, finishedAt, channel, recipientCount })` is
called once per share, after the fan-out. The elapsed time is clamped at
`0` — a device whose clock steps backwards must not produce a negative
measurement.

### Verification

| What | How |
|---|---|
| The three parts, the rounding, the `0` coordinate, the null-position variant, the locale formats | `snapshotPayload.test.ts` — 21 tests |
| The three-field payload, the buffer, the eviction, the corrupt read, the median | `shareTelemetry.test.ts` — 13 tests |
| The absence of every receipt surface and every PII field | `noBackgroundLocation.test.ts` — 10 tests |


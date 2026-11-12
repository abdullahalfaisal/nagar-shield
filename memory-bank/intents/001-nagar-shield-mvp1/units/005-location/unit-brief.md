---
unit: 005-location
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Location Sharing

## Purpose

Own the `location` domain module end to end: the **Location Sharing screen**
(screen 19) where a user sends their **current position as a single snapshot**
to one emergency contact or to all primary emergency contacts, the **snapshot
payload builder** that turns a GPS fix into shareable text, the **OS share-sheet
fallback** for recipients who are not Nagar Shield users, and the
`location_shares` **audit rows** that record what was shared.

This unit is deliberately small, and it is small because the product must be
small here. Nagar Shield is **not a tracking app**. The location is requested
**once**, at the moment the user taps share, and it is transmitted **once**. Four
rules define the whole surface:

1. **One shot, never a stream** (FR-LOC-3 / FR-NG-7). There is no
   `watchPositionAsync`, no background location task, no foreground service, and
   no `location_shares.mode = 'stream'` write path in Phase 1. The `mode` column
   is kept in the schema as the Phase-2 hook and is always written as
   `'snapshot'`.
2. **The 5-second SLA is an *intent* SLA, not a delivery SLA** (FR-LOC-2 /
   waiver W-4). `location_share_intent_ms` measures user confirm → (OS share
   sheet presented / share intent fired **or** `location_shares` audit row
   written). Carrier delivery and recipient open time are outside our control
   and are **never** claimed.
3. **No delivery receipts, ever** (ADR-005). The app cannot know whether a
   recipient received or read a message. The copy says "shared" / "sent", never
   "delivered" / "read" / "seen". There is no read-receipt table and no code
   path that fabricates one.
4. **The location is only requested at the moment of the share** (FR-PERMS-1).
   Opening the screen does not prompt for location; the user picks recipients
   first and the permission dialog appears immediately before the fix is taken.
   With location denied the screen **degrades gracefully** (FR-PERMS-2) — the
   user can enter coordinates manually or share without a location at all.

Recipients split into two paths (DF-3): a recipient who **is** a Nagar Shield
user gets an in-app snapshot (an audit row in `location_shares`, visible to
that user in their own app); a recipient who is **not** an app user gets the
**OS share sheet** with the location + timestamp text, so they can receive it
over SMS, WhatsApp, or any other system target the phone offers.

## Scope

### In Scope

- `supabase/migrations/0004_location.sql` — the `location_shares` table, the
  `mode` CHECK constraint (`'snapshot'`), the `share_channel` enum
  (`app` | `os_share_sheet`), the coordinate columns, the RLS policies
  (sender inserts own row; sender reads own rows; **recipient** may read the
  shares addressed to their own profile), the `shared_at` index, and the
  `updated_at`-style conventions used by the other modules
- The `location_shares` **write path** — a PostgREST insert (`POST
  /rest/v1/location_shares`) with the user's JWT, owner-scoped by RLS. No Edge
  Function and no service-role key are needed: the write is a single-table CRUD
  with owner RLS (`memory-bank/standards/system-architecture.md` §"API Design"
  → *Location audit | POST `/rest/v1/location_shares`*)
- The **snapshot payload builder** (`buildSnapshotPayload`) — assembles the
  location + timestamp text: a `geo:` URI, a Google Maps URL, and a
  human-readable timestamp, plus the in-app payload shape
- `shareWithContacts(contactIds[])` — iterates the selected contacts and routes
  each one to the in-app path or the OS share path
- `shareWithAllPrimary()` — resolves the primary contacts and shares with each
  of them
- `fireOsShare(payload)` — the `expo-sharing` / React Native `Share` API
  invocation that presents the OS share sheet
- `recordShareIntent()` + the `location_share_intent_ms` telemetry event
  (the FR-LOC-2 median)
- The **just-in-time location permission** flow: the permission prompt fires at
  the moment the user confirms the share, not on screen mount (FR-PERMS-1)
- The **manual-coordinate fallback**: with location denied, the screen offers
  manual lat/lng entry and a "share without location" path (FR-PERMS-2)
- Mobile: the **Location Sharing screen** (screen 19) 1:1 from the prototype,
  the contact list with avatars, the "share with all" toggle, the per-contact
  selection checkboxes, and the sticky CTA
- Optional **copy-location** affordance via `expo-clipboard` (the same payload
  text the OS sheet would carry)
- i18n keys for every new string in `bn` (primary) and `en`

### Out of Scope

- **The Emergency Contacts screen (screen 20)** and the emergency-contact CRUD
  — unit `002-identity` owns the `emergency_contacts` table, its RLS, and its
  API; unit `003-help-seek` renders screen 20. This unit **consumes** the
  contacts read-only; it never writes a contact, never edits a primary flag,
  and never re-owns the contact picker
- The **Help Alert dial path**, the Personal Emergency picker, the thana line,
  and the find-a-station map — unit `003-help-seek`
- **Capture**, the `reports` table, the EXIF strip, the media pipeline, and the
  offline upload queue — unit `004-capture`. This unit consumes the shared
  `expo-location` fix helper and the shared geocode helper; it writes no
  `reports` row
- The **Alerts feed**, History, the area filters, and the flagging workflow —
  unit `006-alerts`. `location_shares` rows are **never** part of any public
  feed, view, or RPC output
- The **moderator console**, `moderation_actions`, and the `disable_user`
  Edge Function — unit `007-moderation`
- The **account-deletion PII purge** — unit `002-identity` owns the deletion
  window; unit `008-jobs-operations` owns the purge leg
- **Live location streaming** (FR-NG-7 / Phase 2). The `mode` column is the
  hook; nothing in this unit writes a value other than `'snapshot'`
- **Background location**, foreground services, geofencing, and periodic
  updates — not requested, not implemented
- **Any delivery-receipt, read-receipt, or "contact opened it" feature** —
  forbidden (ADR-005)
- SMS provider integration, push notifications / FCM fanout on a share
- Charts / crime-statistics dashboards (excluded by FR-NG-3 / FR-NG-4 /
  ADR-010)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-LOC-1 | One-shot snapshot — share with (a) one selected EmergencyContact or (b) all primary EmergencyContacts; exactly one snapshot per recipient | Must |
| FR-LOC-2 | 5-second SLA measured as **share intent fired / audit row written** from user confirm — never carrier delivery, never recipient open time; `location_share_intent_ms` median < 5,000 ms; no UI states that a message was delivered or read | Must |
| FR-LOC-3 | Snapshot, not stream — the location is sent once; no continuous location transmission code path exists; `location_shares.mode` is `snapshot` | Must |
| FR-LOC-4 | OS share-sheet fallback — a share to a non-app contact opens the system share sheet with the location + timestamp text | Must |
| FR-PERMS-1 | Just-in-time permission — location is requested at the moment the user taps share, never at first launch and never on screen mount | Must |
| FR-PERMS-2 | Function with permissions denied — with location denied the screen still renders and offers a manual-coordinate / share-without-location fallback | Should |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `location_shares` | The **audit row** for one one-shot location snapshot. One row per in-app recipient. It is a record of *what the sender shared*, not a delivery record — there is no delivered/read column and there never will be one | `id` uuid PK default `gen_random_uuid()`, `sender_id` uuid not null FK → `profiles.id`, `recipient_contact_id` uuid **nullable** FK → `emergency_contacts.id` (null when the recipient was reached through the OS share sheet), `recipient_phone` text nullable (masked in logs; retained so the sender can see who the snapshot went to), `lat` double precision not null, `lng` double precision not null, `accuracy_m` numeric **nullable**, `mode` text not null default `'snapshot'` CHECK (`mode IN ('snapshot')`), `shared_at` timestamptz not null default now(), `share_channel` text not null CHECK (`share_channel IN ('app','os_share_sheet')`), `created_at` timestamptz not null default now() |
| `emergency_contacts` | The citizen's trusted contacts — **owned by unit 002**. This unit reads it; it never writes it | `id` uuid PK, `user_id` uuid FK → `profiles.id`, `name` text, `phone` text (E.164 BD), `is_primary` boolean, `sort_order` integer, `group_name` text (পরিবার / বন্ধু / সহকর্মী) |

Notes on the schema:

- **`mode` is a one-value CHECK today and stays in the schema.** The Phase-2
  hook for live streaming lives in this column (`snapshot` → `stream`), per
  `system-context.md` §"Key Architectural Properties" → *Phase-2 extensibility*.
  The CHECK is written as `mode IN ('snapshot')` so that a Phase-2 migration
  widens it; the client never writes anything else. Keeping the column now
  means Phase 2 does not have to rewrite history.
- **`share_channel` records the path, not the outcome.** `app` = the recipient
  is a Nagar Shield user and an audit row was written; `os_share_sheet` = the
  OS share sheet was fired for a non-app recipient. In the `os_share_sheet`
  case there is **no** `recipient_contact_id` link to an app profile — the
  recipient may not even have an account, so the row carries only the masked
  phone and the channel.
- **`recipient_phone` is masked in logs.** It is stored so the sender can audit
  "who did I share with"; it is never written to a log line, never included in
  a telemetry payload, and never included in an error message. The coding
  standard is explicit: *"Never log raw GPS coordinates, media payloads,
  passwords, or tokens."* Coordinates are treated the same way.
- **`accuracy_m` is nullable** — a manual-coordinate entry has no fix accuracy,
  and a degraded fix may report `null` rather than a misleading number.
- **RLS**: insert as own `sender_id`; a sender may select their own rows; a
  recipient may select rows addressed to their own profile (this is how an
  app-user recipient sees the snapshot in their app). There is **no public
  policy** on this table — `location_shares` is never readable through any
  public feed or view.
- **Coordinates are High-sensitivity** (`system-context.md` §"Data Sensitivity
  Classification"). They live in Postgres behind RLS, are never exposed in a
  public projection, and never appear in a log.

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `buildSnapshotPayload` | Assembles the shareable snapshot: a `geo:` URI (`geo:<lat>,<lng>?q=<lat>,<lng>`), a Google Maps URL (`https://maps.google.com/?q=<lat>,<lng>`), and a human-readable timestamp — plus the in-app payload shape. Plain text only; never HTML | `{ lat, lng, accuracy?, capturedAt }` | `{ message, geoUri, mapsUrl, lat, lng, accuracyM, capturedAt }` |
| `shareWithContacts` | Iterates the selected contacts. For an **app-user** recipient it writes the `location_shares` audit row (`share_channel = 'app'`); for a **non-app** recipient it fires the OS share intent (`share_channel = 'os_share_sheet'`). One snapshot per recipient, no more (FR-LOC-1) | `{ contactIds: string[], payload }` | `{ "data": { "shared": n, "channels": { app: n, os_share_sheet: n } } }` |
| `shareWithAllPrimary` | Resolves the contacts with `is_primary = true` in `sort_order` and shares the same snapshot with each of them — exactly one snapshot per primary | `{ payload }` | `{ "data": { "shared": n, "channels": { app: n, os_share_sheet: n } } }` |
| `fireOsShare` | Presents the **OS share sheet** through `expo-sharing` / the React Native `Share` API with the payload text. The app fires the intent and stops — it never observes the target the user picked, never observes delivery, and never learns whether the message was sent (ADR-005) | `{ message }` | OS share sheet presented (or dismissed by the user) |
| `recordShareIntent` | Writes the `location_share_intent_ms` telemetry event — the elapsed ms from the user's confirm tap to the share intent firing or the audit row being written. This is the FR-LOC-2 measurement and it measures **our** work only | `{ startedAt, channel, recipientCount }` | telemetry event (device buffer) |
| `requestLocationFix` | The **just-in-time** location request: prompts for foreground location permission at the moment of the share, then takes **one** fix via `expo-location` (`accuracy: Balanced` / `High`). Never `watchPositionAsync`; never a background task | — | `{ lat, lng, accuracy, timestamp }` or a denied/unavailable result |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 5 |
| Must Have | 5 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-LOC-01 | Location Sharing screen — recipient selection and a single-contact snapshot to an app user | Must | Planned |
| US-LOC-02 | OS share-sheet fallback for a recipient who is not a Nagar Shield user | Must | Planned |
| US-LOC-03 | Share with all primary contacts — one snapshot per primary | Must | Planned |
| US-LOC-04 | Snapshot payload builder + `location_share_intent_ms` telemetry | Must | Planned |
| US-LOC-05 | Permission degradation — the screen still works when location is denied (manual coordinates / share without location) | Must | Planned |

> US-LOC-01 carries the screen half of FR-LOC-1, FR-LOC-2 and FR-LOC-3.
> US-LOC-02 carries FR-LOC-4. US-LOC-03 carries the "share with everyone" half
> of FR-LOC-1. US-LOC-04 carries the telemetry half of FR-LOC-2 and the payload
> contract for both channels. US-LOC-05 carries FR-PERMS-1 and FR-PERMS-2 for
> this surface. FR-LOC-3 (no stream) is a **constraint on every story** rather
> than a story of its own — there is no code path in this unit that could
> stream.

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | `packages/shared` contracts (the shared Zod schemas, `ApiErrorCode` incl. `VALIDATION_FAILED` / `AUTH_DISABLED` / `AUTH_REQUIRED`, the i18n key contract), the typed Supabase client, the Expo Router `(app)` group, the light/dark design tokens, and the shared UI primitives (`AppBar`, `Toggle`, `StickyFooter`, `Button`, `TextField`) |
| `002-identity` | The session and `profiles.id` used as `location_shares.sender_id`; the `emergency_contacts` rows this unit reads (name, phone, `is_primary`, `sort_order`, `group_name`); the `AUTH_DISABLED` gate for a disabled account; the screen-20 contact surface this unit links to |
| `004-capture` | The shared `expo-location` fix helper and the shared geocode / reverse-geocode helper (unit 004's Dhaka-local-first resolution) that turn a fix into the human-readable address rendered on the address card |

### Depended By

None — `005-location` is a leaf unit. Nothing in Phase 1 depends on it
(`units.md` → *Unit 5 → Depended by: None*). `008-jobs-operations` may later
extend the retention story for `location_shares`, but that is not a blocking
dependency.

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Android OS share sheet (`expo-sharing` / RN `Share`) | The fallback channel for recipients who are not app users (FR-LOC-4) | Low — the API is a thin intent wrapper; the *targets* (SMS / WhatsApp / …) and the delivery outcome are entirely outside the app |
| `expo-location` | The single foreground GPS fix | Medium — permission may be denied and the fix can be slow indoors; the share must never block indefinitely on it, and there is a manual fallback |
| Supabase Postgres (PostgREST) | The `location_shares` insert + the sender's own history | Low — a single-row insert behind owner RLS; low volume (a handful of rows per user per week) |
| Android OS location services | The GPS provider | Medium — a disabled or unavailable provider must degrade to the manual path, not crash |

---

## Technical Context

### Suggested Technology

Expo SDK + Expo Router, `expo-location` for the single foreground fix
(`accuracy: Balanced` for the screen preview, `High` for the shared fix),
`expo-sharing` (or the React Native `Share` module) for the OS share sheet,
`expo-clipboard` for the optional copy-location affordance,
`@supabase/supabase-js` (typed, from unit 001) for the `location_shares`
insert, `@tanstack/react-query` for the contacts read and the sender's own
share history, `i18next` + `expo-localization` for `bn` / `en`, Jest +
React Native Testing Library for the unit tests, Maestro for the Android E2E
share flows, and Supabase local for the RLS integration tests.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Mobile → PostgREST `/rest/v1/location_shares` | API | HTTPS — insert own row (`sender_id = auth.uid()`); read own rows and rows addressed to the caller. **No Edge Function, no service-role key** |
| Mobile → PostgREST `/rest/v1/emergency_contacts` | API | HTTPS — **read-only** from this unit (owner-scoped); the rows come from unit 002's schema and RLS |
| Mobile → `expo-location` | Native module | One foreground fix → `lat` / `lng` / `accuracy` / `timestamp`; permission requested just-in-time at the confirm tap |
| Mobile → `expo-sharing` / RN `Share` | Native module | The OS share sheet: the location + timestamp text; the app fires the intent and stops (no target observation, no delivery observation) |
| Mobile → `expo-clipboard` | Native module | Optional "copy location" — copies the same payload text to the clipboard |
| Mobile → shared geocode helper (unit 004) | Package / module | Reverse-geocode of the fix into the human-readable address rendered on the address card; degrades to a coordinate-only display when the geocode is unavailable |
| Mobile → device key-value store | Local | The last shared timestamp (a single key) for the "last shared" line on the screen |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `location_shares` rows | Postgres table | **Low** — roughly one row per in-app recipient per share; a few rows per user per week at MVP scale | Retained with the account; purged by the account-deletion PII leg (unit 002 / unit 008). Coordinates are High-sensitivity and are never exposed publicly |
| Last shared timestamp | Device key-value | 1 key | Until the next share |
| `location_share_intent_ms` | Device telemetry buffer | 1 event per share | Flushed opportunistically; never blocks the share path |

---

## Mobile Screens

Every surface below is a **1:1 port** of `docs/design/screen-spec.md` (screen
19) and the prototype's screen 19 markup; no redesign, no additional chrome.

| Screen | Prototype spec | Story | Notes |
|--------|----------------|-------|-------|
| Location Sharing | screen 19 | US-LOC-01, US-LOC-02, US-LOC-03, US-LOC-04, US-LOC-05 | The full 1:1 port — see the markup contract below |
| Manual coordinate entry | new surface (no prototype screen) | US-LOC-05 | Built from `shared/ui/TextField` + `Button`; a modal or a bottom sheet reached from the address card when the location permission is denied |
| Shared-with sheet | new surface (no prototype screen) | US-LOC-02 | The post-share confirmation that names the recipients and says **shared / sent** — never **delivered** |

#### Screen 19 — Location Sharing (the markup contract)

Ported from the prototype's `data-screen="19"` markup, element by element:

| Element | Markup / copy | Notes |
|---------|---------------|-------|
| App bar | `.app-bar`, `.back-btn` with `arrow_back` (→ Home, screen 14), centred title **লোকেশন শেয়ার**, 40 px spacer on the right | The prototype's fake iOS status bar is **not** ported (real Android status bar replaces it) |
| Location illustration | `.map-preview` — 240 dp block with the `repeating-linear-gradient` road grid, the `.map-pin` at centre, the `.map-pin-label` **আপনি এখানে**, the 24 dp `.map-pin-dot` in `--violet-600`, and the animated `.map-pin-pulse` | The **illustration** is static and stays a prototype-faithful illustration — it is a decorative card, not a live map. The real data lives in the address card below it. The pulse animation is decorative and must be disable-able under `reduceMotion` |
| Address card | `.address-card` — `.address-card-header` with the `location_on` icon and **আপনার বর্তমান লোকেশন**, `.address-card-address` (the live reverse-geocoded address), `.address-card-coords` (the coordinate line, monospace) | The prototype's hardcoded **বাড়ি ১২, রোড ৭, বসুন্ধরা R/A, ঢাকা** and **23.7806° N, 90.4066° E** are placeholders. The build renders the **live** address from the shared geocode helper (unit 004) and the **live** coordinates, plus an accuracy sub-line (**অটো-ডিটেক্টেড · ±N মিটার**) driven by the real `location.coords.accuracy`. See Notes |
| Share-with-all row | `.share-toggle-row` → `.share-toggle-content` (`.share-toggle-title` **সবার সাথে শেয়ার করুন**, `.share-toggle-sub` **আপনার সব জরুরি কন্টাক্ট দেখতে পাবে**) + `.toggle` | The toggle is real state, not the prototype's `onclick` demo. **ON = share with every primary contact.** Toggling it ON selects every primary; toggling it OFF returns to the explicit per-contact selection. It does **not** mean "every contact" — only primaries |
| Divider | Hairline rules with the centred label **অথবা নির্দিষ্ট কাউকে** | Ported unchanged |
| Contact rows | `.contact-row` × N — `.contact-avatar` (44 dp circle), `.contact-info` (`.contact-name`, `.contact-phone`), `.custom-checkbox` (22 dp, `.checked` = violet-600 with the white tick) | The list is rendered from `emergency_contacts`, ordered by `sort_order`. The avatar keeps the prototype's three gradients: **family** `linear-gradient(135deg, #F472B6, #EC4899)`, **friend** `linear-gradient(135deg, var(--purple-500), var(--purple-400))`, **colleague** `linear-gradient(135deg, var(--green-500), var(--green-600))`, with the first letter of the name as the glyph. The `.custom-checkbox` is 22 dp visually but the **hit area is padded to ≥ 48 dp** (FR-UX-4) |
| Primary marking | The `★` primary marker on primary contacts | The prototype shows the primary star on screen 20; screen 19's contract adds it to the row so the user can see which contacts the "share with all" toggle will reach. The star is **read-only** here — toggling a primary is screen 20 / unit 002's business |
| Sticky CTA | `.sticky-cta` → `.btn.btn-primary.btn-lg` with the `ios_share` icon and **শেয়ার করুন** | The primary action. It is disabled only when **no recipient** is selected (and the empty state explains why). It is **never** blocked by a pending permission dialog, a slow fix, or a failed network write |

---

## Constraints

- **One shot only — never a stream** (FR-LOC-3 / FR-NG-7). There must be no
  continuous location transmission code path in this unit. `watchPositionAsync`,
  background location tasks, foreground services, and periodic updates are all
  forbidden. `location_shares.mode` is always `'snapshot'` — the CHECK
  constraint enforces it server-side, and the client never writes another
  value.
- **`mode` is always `'snapshot'`, and the column stays.** The `mode` column
  is the Phase-2 hook for live streaming; keep it in the schema even though
  only `'snapshot'` is used, so Phase 2 does not have to rewrite history.
- **The 5-second SLA is measured as *share intent fired or audit row written***
  (FR-LOC-2 / waiver W-4) — **not** carrier delivery and **not** recipient open
  time. `location_share_intent_ms` measures from the user's confirm tap to the
  share intent firing or the audit row being written. Neither delivery nor
  open-time may enter the metric, and no UI may claim them.
- **The UI must never state that a message was delivered or read.** The
  copy says **shared** / **sent** (শেয়ার হয়েছে / পাঠানো হয়েছে), never
  **delivered** / **read** / **seen**. No delivery receipt may be fabricated
  (ADR-005): no read-receipt column, no "seen at" timestamp, no polling of a
  share status, and no invented tick state.
- **The location is only requested at the moment the user taps share**
  (FR-PERMS-1). Opening the Location Sharing screen must **not** trigger a
  permission prompt. The recipient selection comes first; the permission
  dialog appears immediately before the fix is taken, and only when the fix is
  actually needed.
- **With location denied the screen must degrade gracefully** (FR-PERMS-2) —
  it must render, not crash. The fallbacks are: (a) manual coordinate entry,
  and (b) share-without-location (the snapshot carries the timestamp and a
  note that the location is unavailable). The address card shows a
  "location unavailable" state instead of stale coordinates.
- **The app is not a tracking app.** No background location permission is
  requested, no location is collected while backgrounded, and the app never
  polls location while backgrounded. The only location request in the entire
  product is the single foreground fix on this screen (and unit 004's own
  capture-time fix).
- **`location_shares` coordinates are sensitive and must never be written to
  logs** (the coding standard: *"Never log raw GPS coordinates, media
  payloads, passwords, or tokens"*). `recipient_phone` is **masked in logs**.
  Telemetry events carry the elapsed ms, the channel, and a recipient **count**
  — never a coordinate and never a raw phone number.
- **`location_shares` rows never appear in any public feed or view.** The
  table has no public read policy and is not part of any feed RPC, any
  moderation queue, or any admin projection.
- **RLS is the authorization mechanism.** A user inserts only their own row
  (`sender_id = auth.uid()`); the service-role key stays in the Edge Functions
  and CI and never reaches the mobile bundle. A disabled account is rejected
  with `AUTH_DISABLED`.
- **One snapshot per recipient.** Sharing with all primaries writes **one row
  per primary** and fires **one** OS share per non-app primary — never two
  messages to the same recipient.
- **All user-facing strings go through i18n**; **Bangla is primary**, English
  is secondary, and no string is hardcoded in either language.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` must pass, plus the migration
  dry-run against Supabase local.

---

## Success Criteria

### Functional

- [ ] Sharing to **one app-user contact** writes **exactly one**
      `location_shares` row with `mode = 'snapshot'`,
      `share_channel = 'app'`, the sender's `sender_id`, the recipient's
      `recipient_contact_id`, and the shared coordinates (FR-LOC-1)
- [ ] Sharing with **all primaries** writes **one row per primary** — the row
      count equals the number of primary contacts, with no duplicates and no
      rows for non-primary contacts (FR-LOC-1)
- [ ] Sharing to a **non-app contact** opens the **OS share sheet** with a
      payload that contains the coordinates **and** a timestamp, and no
      `location_shares` row is written for an app-delivered message (FR-LOC-4)
- [ ] The share-sheet payload contains all three parts — the `geo:` URI, the
      Google Maps URL, and the human-readable timestamp
- [ ] Every written row has `mode = 'snapshot'`; a source scan finds no
      `watchPositionAsync`, no background location task, and no foreground
      service in this unit's code (FR-LOC-3)
- [ ] The median `location_share_intent_ms` from user confirm is **< 5,000 ms**
      over the measurement window (FR-LOC-2)
- [ ] **No UI string claims delivery or a read receipt** — a copy scan finds no
      "delivered" / "read" / "seen" / "পৌঁছেছে" / "দেখেছে" wording, and the
      confirmation says "shared" / "sent"
- [ ] No delivery receipt is fabricated — there is no read-receipt column, no
      share-status read, and no invented per-recipient state
- [ ] The app requests **no background location permission** and **never polls
      location while backgrounded** (asserted by a source scan for background /
      foreground-service location APIs and by an Android permission audit)
- [ ] Opening the Location Sharing screen triggers **no permission prompt**;
      the location prompt appears only after the user confirms the share
      (FR-PERMS-1)
- [ ] With **location denied**, the screen still renders and offers the manual
      fallback — manual coordinate entry and share-without-location both
      complete without a crash (FR-PERMS-2)
- [ ] A manual-coordinate share writes a row with `accuracy_m IS NULL` and the
      entered coordinates
- [ ] `location_shares` rows **never appear** in any public feed, view, RPC
      output, or admin projection (asserted by an RLS negative test: a
      second user cannot read another user's share rows)
- [ ] A user can insert only their own row — an insert with a foreign
      `sender_id` is rejected by RLS (`FORBIDDEN`)
- [ ] The location card shows the **live** address and the **live** accuracy
      sub-line — the prototype's hardcoded **বাড়ি ১২, রোড ৭, বসুন্ধরা R/A,
      ঢাকা** does not ship

### Non-Functional

- [ ] The median `location_share_intent_ms` is **< 5,000 ms** (FR-LOC-2), and
      the measurement covers **only** the intent/audit path — never carrier
      delivery or recipient open time
- [ ] Screen 19 is a **1:1 visual match** to the prototype's screen 19
      (screenshot comparison against `prototype ui.html`)
- [ ] Every interactive control on screen 19 is **≥ 48 × 48 dp** — including
      the 22 dp `.custom-checkbox` and the 44 dp contact avatar, whose hit
      areas are padded — and carries an accessibility label
- [ ] Every new i18n key resolves in `bn` (primary, native-speaker reviewed)
      and `en`
- [ ] No GPS coordinate, no raw phone number, and no `recipient_phone` value
      appears in any log line, telemetry event, or error message (asserted by a
      log-scrubbing test)
- [ ] No service-role key appears in the mobile bundle
- [ ] The screen renders with **no network** available — the contact list
      degrades to the last cached contacts, and the OS share path still works
      offline
- [ ] The layout holds from 360 dp to 480 dp width without clipping

### Quality

- [ ] Jest unit tests cover the payload builder (all three parts present, the
      `geo:` URI and the Maps URL are well-formed for a known fix), the
      one-snapshot-per-recipient fan-out, the all-primaries expansion, the
      `mode = 'snapshot'` invariant, and the masked-phone log formatter
- [ ] Supabase-local integration tests cover the `location_shares` insert
      under owner RLS, the `mode` and `share_channel` CHECK constraints, the
      recipient read policy, and the negative test that a non-owner cannot
      read another user's rows
- [ ] A Maestro E2E flow covers open Location Sharing → select one contact →
      share → the share sheet fires and one audit row exists
- [ ] A Maestro E2E flow covers the location-denied state: the screen renders,
      the manual fallback is offered, and a manual share completes
- [ ] A source-scan test asserts the absence of `watchPositionAsync`, of
      background-location permission strings, and of delivery/read-receipt
      vocabulary
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass, and the migration
      dry-run against Supabase local passes

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-005-location-1 | ddd | US-LOC-04 | `0004_location.sql` (`location_shares`, the `mode` / `share_channel` CHECK constraints, the coordinate columns, the RLS policies, the `shared_at` index) + the `location_shares` write path |
| bolt-005-location-2 | simple | US-LOC-01, US-LOC-03 | Mobile Location Sharing screen (19) 1:1 — the `map-preview` illustration block, the live `address-card`, the share-with-all `Toggle`, the contact rows with the avatar gradients and the `.custom-checkbox` selection, the sticky **শেয়ার করুন** CTA, and the recipient fan-out |
| bolt-005-location-3 | simple | US-LOC-02 | The OS share-sheet path (`fireOsShare` via `expo-sharing`), the `share_channel` classification, the optional `expo-clipboard` copy affordance, and the "shared" (never "delivered") confirmation |
| bolt-005-location-4 | simple | US-LOC-04, US-LOC-05 | The snapshot payload builder (`buildSnapshotPayload`), the just-in-time location permission + single fix, the `location_share_intent_ms` telemetry, and the permission-degradation path (manual coordinates / share without location) |

---

## Notes

- **The prototype's screen 19 uses a static location illustration and a
  hardcoded address — the build must not.** The `.map-preview` block stays a
  static illustration (it is decorative; a live MapLibre map is unit 006's
  History component and is out of scope here), but the **address card** must
  render the **live fix**: the real address from the shared geocode helper
  (unit 004's Dhaka-local-first resolution) and a **live accuracy sub-line**
  (**অটো-ডিটেক্টেড · ±N মিটার**) driven by `location.coords.accuracy`. The
  prototype's **বাড়ি ১২, রোড ৭, বসুন্ধরা R/A, ঢাকা** and **23.7806° N,
  90.4066° E** are placeholders and must not ship. When the geocode is
  unavailable the card degrades to the coordinates alone.
- **Because the app cannot know whether a recipient received or read the
  message, the copy must say "shared" / "sent", never "delivered".** This is
  the FR-LOC-2 acceptance criterion and ADR-005's direct consequence. The
  post-share confirmation names **who** the snapshot went to and what was
  shared — it does not assert receipt.
- **The `mode` column is the Phase-2 hook for live streaming — keep it in the
  schema even though only `'snapshot'` is used.** The CHECK is written to
  allow exactly `'snapshot'` today; widening it is a forward-only migration
  when Phase 2 lands. Do not drop the column, and do not add a
  `streamed_at` / `expires_at` column in Phase 1.
- **The prototype's share-with-all toggle is `on` by default**, which reads as
  "share with everyone" before the user has chosen anything. The build keeps
  the prototype's **ON default** (it is the panic-friendly default and the
  prototype's is the contract), but the **explicit per-contact selection below
  it is what actually decides the recipients** — the toggle maps to "every
  primary contact", never to "every contact including non-primaries". The
  sub-line **আপনার সব জরুরি কন্টাক্ট দেখতে পাবে** is therefore replaced by
  **আপনার সব প্রাইমারি কন্টাক্ট দেখতে পাবে** (your primary contacts will
  see it) so the copy matches the behaviour. This is the one copy deviation on
  screen 19.
- **Screen 20 (Emergency Contacts) is owned by unit 002 / `003-help-seek`** —
  this unit **consumes** it. The Location Sharing screen links to it ("add a
  contact" when the list is empty) and reads `is_primary` from it, but this
  unit writes no contact and never toggles a primary flag.
- **An empty contact list is a first-class state.** If the user has no
  emergency contacts, the screen shows an empty state pointing at screen 20 and
  the CTA is disabled — sharing to nobody is not a valid share.
- **The share path is offline-capable.** The OS share path needs no network at
  all; the in-app audit write needs one. A failed audit write must **not**
  fabricate a receipt and must not silently drop the share: the UI reports
  that the snapshot was handed off to the OS and that the in-app record could
  not be saved, and the write is retried once from the device buffer.
- **`share_channel` is a channel label, not a delivery status.** `app` means
  "the snapshot was written for a Nagar Shield user"; `os_share_sheet` means
  "the OS share sheet was fired". Neither value implies that anybody received
  anything.
- **The `accuracy_m` column is nullable on purpose.** Manual entry has no
  accuracy, and a degraded fix reports `null` rather than a fabricated number.

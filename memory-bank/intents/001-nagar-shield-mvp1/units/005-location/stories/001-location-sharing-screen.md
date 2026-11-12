---
id: 001-location-sharing-screen
unit: 005-location
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 001-location-sharing-screen

## User Story

**As a** Nagar Shield user who needs someone to know where I am right now
**I want** one screen where I can see my current position and pick exactly who receives it
**So that** my trusted contacts get a single, current snapshot of my location without my phone turning into a tracking device

## Acceptance Criteria

- [ ] **Given** the Location Sharing screen is opened, **When** it renders, **Then** the app bar shows a `.back-btn` with the `arrow_back` icon (navigating back to Home, prototype screen 14), the centred title **লোকেশন শেয়ার**, and a 40 px right spacer — the prototype's fake iOS status bar is **not** ported
- [ ] **Given** the screen renders, **When** the `.map-preview` block is inspected, **Then** it is a 240 dp **static illustration** with the `repeating-linear-gradient` road grid, the `.map-pin` at centre, the `.map-pin-label` **আপনি এখানে**, the 24 dp `.map-pin-dot` in `--violet-600`, and the animated `.map-pin-pulse` — it renders **no** live map tiles and **no** real GPS marker, and the pulse is disable-able under `reduceMotion`
- [ ] **Given** the screen renders, **When** the `.address-card` is inspected, **Then** the `.address-card-header` shows the `location_on` icon with **আপনার বর্তমান লোকেশন**, and the `.address-card-address` and `.address-card-coords` lines render the **live** reverse-geocoded address and the **live** coordinates from the shared geocode helper, with an accuracy sub-line **অটো-ডিটেক্টেড · ±N মিটার** whose N comes from the real `location.coords.accuracy` — the prototype's placeholder **বাড়ি ১২, রোড ৭, বসুন্ধরা R/A, ঢাকা** and **23.7806° N, 90.4066° E** never appear in a build
- [ ] **Given** the reverse geocode is unavailable or fails, **When** the address card renders, **Then** the card degrades to the coordinate line alone, still renders, and shows **no** placeholder address and **no** fabricated street text
- [ ] **Given** the screen renders, **When** the contact list is inspected, **Then** each `.contact-row` shows a 44 dp `.contact-avatar` circle carrying the first letter of the name as the glyph, the `.contact-info` block with `.contact-name` and `.contact-phone`, and a 22 dp `.custom-checkbox` whose `.checked` state is `--violet-600` with the white tick — and the avatar gradient is **family** `#F472B6 → #EC4899`, **friend** violet, **colleague** green
- [ ] **Given** the user taps a `.custom-checkbox`, **When** the tap registers, **Then** that contact's selection state flips and the CTA's enabled state follows the selection — the 22 dp visual box is padded to a **≥ 48 × 48 dp** hit area, and every interactive control carries an accessibility label
- [ ] **Given** a primary contact is rendered, **When** its row is inspected, **Then** it carries the read-only `★` primary marker so the user can see which contacts the "share with all" toggle will reach — tapping the star does **not** change the primary flag
- [ ] **Given** at least one recipient is selected, **When** the sticky CTA is inspected, **Then** the `.sticky-cta` shows a `.btn.btn-primary.btn-lg` with the `ios_share` icon and **শেয়ার করুন** and is **enabled**; **Given** no recipient is selected, **Then** it is **disabled** and the empty state explains why
- [ ] **Given** the user confirms a share to exactly **one** app-user contact, **When** the write completes, **Then** exactly **one** `location_shares` row exists for that recipient, with `mode = 'snapshot'`, `share_channel = 'app'`, `sender_id` = the signed-in user, `recipient_contact_id` = that contact, and the shared coordinates (FR-LOC-1, FR-LOC-3)
- [ ] **Given** the screen is compared against the prototype's `data-screen="19"` markup, **When** a screenshot diff runs, **Then** the only differences are the live address / coordinate / accuracy values and the toggle sub-line wording — no additional chrome, no redesigned layout, no removed element

## Technical Notes

- **Screen 19 is a 1:1 port.** The markup contract is `docs/design/screen-spec.md` §19 and the prototype's `data-screen="19"` block. Port the class names (`.app-bar`, `.back-btn`, `.app-bar-title`, `.content`, `.map-preview`, `.map-roads`, `.map-pin`, `.map-pin-label`, `.map-pin-dot`, `.map-pin-pulse`, `.address-card`, `.address-card-header`, `.address-card-address`, `.address-card-coords`, `.share-toggle-row`, `.share-toggle-content`, `.share-toggle-title`, `.share-toggle-sub`, `.toggle`, `.contact-row`, `.contact-avatar`, `.contact-info`, `.contact-name`, `.contact-phone`, `.custom-checkbox`, `.sticky-cta`), the icon set (`arrow_back`, `location_on`, `ios_share`), the hierarchy, and the spacing. The prototype's `onclick` demo toggles become **real state**.
- **The `.map-preview` is an illustration, not a map.** It stays a decorative card. The live map is unit `006-alerts`' History component and is out of scope here. Do not swap it for a MapLibre view, do not pan it, and do not tie the pin to a real fix — the real data lives in the address card below it.
- **The prototype's hardcoded address is a placeholder and must not ship.** The address line renders the live reverse-geocode from the shared geocode helper (unit `004-capture`'s Dhaka-local-first resolution) and the coordinate line renders the live fix. This is the one *data* deviation from the prototype on this screen.
- **The sticky CTA is never blocked.** It is disabled **only** when no recipient is selected. It is never disabled by a pending permission dialog, a slow GPS fix, or a failed network write — the share path proceeds and reports what happened.
- **Contact list source and order.** The rows are rendered from `emergency_contacts`, ordered by `sort_order`. This unit **reads** the contacts only; it never writes a contact, never edits `is_primary`, and never re-owns the picker (screen 20 belongs to unit `002-identity` / `003-help-seek`).
- **The avatar gradient is a group mapping, not a decoration.** `group_name` selects the gradient: পরিবার → family `#F472B6 → #EC4899`, বন্ধু → friend `var(--purple-500) → var(--purple-400)`, সহকর্মী → colleague `var(--green-500) → var(--green-600)`. The glyph is the first letter of the contact's name.
- **The `★` marker is read-only here.** Toggling a primary is screen 20's business. The star exists on this screen only so the user can see the blast radius of the "share with all" toggle.
- **The write is a single-table CRUD with owner RLS.** `POST /rest/v1/location_shares` with the user's JWT — **no Edge Function, no service-role key**. The service-role key stays in Edge Functions and CI and never reaches the mobile bundle.
- **The `mode` value is always `'snapshot'`.** The column stays in the schema as the Phase-2 streaming hook and is guarded by a server-side CHECK; the client never writes another value. There is **no** `watchPositionAsync`, no background task, and no foreground service anywhere in this screen's code path (FR-LOC-3).
- **Coordinates and phone numbers never reach a log.** The coding standard is explicit: *"Never log raw GPS coordinates, media payloads, passwords, or tokens."* `recipient_phone` is masked wherever it is formatted for output.
- **The screen renders and works with no network.** The contact list degrades to the last cached contacts, and the OS share path still works offline. A failed audit write never fabricates a receipt and never silently drops the share.
- **Shared primitives.** Build from the unit 001 primitives — `AppBar`, `Toggle`, `StickyFooter`, `Button` — and the light/dark tokens from `docs/design/design-tokens.md`. Presentational components stay dumb; the screen's hook owns the selection and the fix state.
- **i18n is a hard requirement.** Every string goes through i18n with `bn` primary (native-speaker reviewed) and `en` alongside. Suggested keys: `location.appBar.title`, `location.map.pinLabel`, `location.address.title`, `location.address.autoDetected`, `location.toggle.title`, `location.toggle.sub`, `location.divider.specific`, `location.cta.share`, `location.empty.noContacts`.
- **Accessibility and layout.** Every interactive control is ≥ 48 × 48 dp with an accessibility label (the prototype's `aria-label` strings are the contract for the RN `accessibilityLabel` values). The layout holds from 360 dp to 480 dp width without clipping.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` contracts (the typed Supabase client, `ApiErrorCode`, the i18n key contract), the Expo Router `(app)` group, the light/dark design tokens, and the shared UI primitives (`AppBar`, `Toggle`, `StickyFooter`, `Button`)
- Unit `002-identity` — the session and `profiles.id` used as `location_shares.sender_id`; the `emergency_contacts` rows this screen reads (name, phone, `is_primary`, `sort_order`, `group_name`); the `AUTH_DISABLED` gate; the screen-20 contact surface this screen links to
- Unit `004-capture` — the shared `expo-location` fix helper and the shared geocode / reverse-geocode helper that turn a fix into the human-readable address on the address card
- `004-snapshot-payload-and-telemetry` — `buildSnapshotPayload`, the payload this screen shares and `recordShareIntent`
- `002-os-share-sheet-fallback` — the non-app-recipient branch of the share that this screen's CTA triggers
- `003-share-with-all-primary-contacts` — the toggle's fan-out semantics that this screen's toggle row drives
- `005-location-permission-degradation` — the just-in-time permission request and the degraded states this screen renders

### Enables
- `002-os-share-sheet-fallback` — the screen that fires the OS share sheet for a non-app recipient
- `003-share-with-all-primary-contacts` — the toggle row and the contact selection this story's fan-out expands
- `004-snapshot-payload-and-telemetry` — the confirm tap that starts the `location_share_intent_ms` clock
- `005-location-permission-degradation` — the screen that must keep rendering when location is denied

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user has no emergency contacts at all | The screen shows an empty state pointing at screen 20, the contact list is empty, and the sticky CTA is disabled — sharing to nobody is not a valid share |
| The contacts query fails because the device is offline | The last cached contacts render, the list is visibly stale, and the OS share path still works; the screen does not show an empty list that looks like "no contacts" |
| The reverse geocode returns a result that disagrees with the coordinate | The card shows the geocoded address as a hint and the coordinate line as the authoritative value; the server-side `location_shares.lat` / `lng` are the record |
| The geocode is slower than the user | The address line shows a resolving state and the coordinate line still renders; the CTA is never gated on the geocode |
| The user taps a `.custom-checkbox` and immediately taps the CTA | The tap on the CTA reads the latest selection state; the share goes to exactly the contacts checked at confirm time |
| The user taps the `★` primary marker | Nothing changes — the marker is read-only on this screen and no primary flag is written |
| The user navigates back with the `arrow_back` button | The app returns to Home (screen 14) and the share is not performed; no partial `location_shares` row is written |
| The audit write fails (network down, RLS error) | The UI reports that the snapshot was handed off and the in-app record could not be saved, the write is retried once from the device buffer, and **no** receipt is fabricated |
| The signed-in account is disabled (`AUTH_DISABLED`) | The share is refused with the stable error code mapped to a Bangla/English string; no row is written and no raw Postgres error is surfaced |
| The screen is opened at 360 dp width | The layout holds with no clipping; the avatar, the name, and the checkbox all remain visible and tappable |
| The user has reduce-motion enabled | The `.map-pin-pulse` animation does not run; the pin, the label, and the dot still render |

## Out of Scope

- The share-with-all fan-out itself and the "primary contacts only" semantics — `003-share-with-all-primary-contacts`
- The OS share sheet, the payload text, and the "shared / sent" confirmation copy — `002-os-share-sheet-fallback`
- `buildSnapshotPayload` and the `location_share_intent_ms` telemetry — `004-snapshot-payload-and-telemetry`
- The just-in-time permission request, the manual-coordinate fallback, and the share-without-location path — `005-location-permission-degradation`
- The `location_shares` table, its CHECK constraints, its RLS policies, and the write path — the unit `005-location` migration and write-path bolt
- The Emergency Contacts screen (screen 20) and the contact CRUD, the `is_primary` toggle, and the contact picker — unit `002-identity` / `003-help-seek`
- A live interactive map, map tiles, and the MapLibre History map — unit `006-alerts`
- Any delivery or read receipt, a "seen" tick, or a share-status poll — forbidden by ADR-005
- Live location streaming, background location, foreground services, and geofencing — forbidden by FR-LOC-3 / FR-NG-7

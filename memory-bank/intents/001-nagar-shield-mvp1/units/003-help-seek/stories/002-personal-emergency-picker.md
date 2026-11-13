---
id: 002-personal-emergency-picker
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: planned
---

# Story: 002-personal-emergency-picker

## User Story

**As a** Nagar Shield user who has saved trusted contacts
**I want** the Personal Emergency card to open a picker sheet listing my primary contacts, so that I choose exactly whose number the dialer is pre-filled with
**So that** I can reach a chosen person without the app ever placing a call or guessing on my behalf

## Acceptance Criteria

- [ ] **Given** the user taps the Personal Emergency card, **When** the picker sheet opens, **Then** it lists only the user's **primary** emergency contacts ordered by `sort_order` ascending, and the **first** primary in that order is preselected
- [ ] **Given** the picker sheet is open, **When** the user taps any contact row, **Then** the OS dialer opens pre-filled with **that contact's number only**, and no other contact's number is passed to the intent
- [ ] **Given** the picker sheet is open, **When** the user confirms, **Then** exactly one Android `ACTION_DIAL` intent fires and the source tree contains no `ACTION_CALL` intent, no call-state listener, and no telephony-state permission request
- [ ] **Given** the picker sheet is open, **When** the app is inspected at runtime, **Then** no code path initiates the call, observes call outcome, or fails over to another contact automatically — the app returns to the sheet with no automatic retry
- [ ] **Given** the picker sheet has been open for less than **25 s**, **When** the sheet renders, **Then** no "call next contact" affordance is visible and no next-contact number is reachable
- [ ] **Given** the picker sheet has been open for **25 s or more** and a next primary exists, **When** the affordance appears, **Then** it is prefilled with the **next** primary's number and it opens the dialer **only** after the user taps it
- [ ] **Given** the sheet's explanatory copy is rendered, **When** it is compared to prototype screen 20, **Then** the layout (grouped contact rows, avatars, the primary star, the green FAB) is ported unchanged but the sentence "If no answer, it moves to the next primary, then the rest." is **absent**, and no copy anywhere states that the app dials or that it moves to the next contact on no-answer
- [ ] **Given** the user has no primary contacts, **When** the Personal Emergency card is tapped, **Then** the sheet shows an empty-state message and a route to manage contacts, and no dialer is opened
- [ ] **Given** the contacts query fails or the device is offline, **When** the sheet is opened, **Then** the app shows a typed-error message and never opens a dialer with an empty, placeholder, or stale number
- [ ] **Given** the Personal Emergency card renders on Home, **When** the count is read, **Then** it is the user's real primary-contact count in both the sub-line and the `{n} জন` badge, never the prototype's hardcoded ৫
- [ ] **Given** the sheet's controls are inspected, **When** accessibility is checked, **Then** every contact row and every affordance is ≥ 48 × 48 dp and carries an accessibility label in `bn` and `en`

## Technical Notes

- **FR-HELP-5's override is binding.** The app cannot observe call state, so it can never know whether a call was answered. There is **no automatic failover**: the app never advances to the next contact by itself.
- **The prototype's screen 20 copy is a dispatch claim and is corrected.** It reads "Personal Emergency dials your ★ primary contacts first. If no answer, it moves to the next primary, then the rest." The second sentence promises an automatic no-answer failover — exactly what FR-HELP-5's 2026-10-12 override forbids. The first sentence is also inaccurate ("dials" — the app opens a dialer). Both are replaced with copy that states what the app actually does: it opens the dialer pre-filled with a contact the **user** picks, and the next primary is always one tap away. The screen 20 *layout* is ported unchanged.
- **The picker sheet is new** (no prototype screen). It is built from `shared/ui/BottomSheet` and lists primaries in `sort_order` with the first preselected.
- **The 25 s affordance is user-armed.** A timer starts when the sheet opens. At ≥ 25,000 ms an affordance appears prefilled with the **next** primary's number; the user must tap it to open the dialer. The timer is cleared when the sheet closes or the app backgrounds, and the affordance never fires on its own.
- **`listPrimaryContacts()` is read-only.** It reads unit 002's `emergency_contacts` (owner-scoped by RLS) filtered to primary contacts and ordered by `sort_order ASC`. This story does not own the `emergency_contacts` schema, RLS, or CRUD API — unit 002 does. The ordering contract (`is_primary DESC, sort_order ASC, created_at ASC`) is shared so every contact-listing surface agrees.
- **Screen 20's primary star toggle and the green "add" FAB** are rendered by this story over unit 002's API; the FAB routes to unit 002's contact creation flow.
- **C-1 — never auto-dial.** The app fires `ACTION_DIAL` and stops. The string `ACTION_CALL` must not appear in any source file, and no code path may read call state (no `TelephonyManager` / `PhoneStateListener` / `READ_PHONE_STATE`).
- **C-6 — no "emergency service" framing.** No copy may claim the app called, dialled, notified, or reached anyone.
- **Only one number reaches the OS.** The sheet passes exactly the tapped contact's sanitised number (digits and an optional leading `+`) to the single `openDialer(number)` helper; there is no batch, list, or multi-dial path.
- **i18n is a hard requirement.** Every string ships in `bn` (primary, native-speaker reviewed) and `en`; no user-facing string is hardcoded in either language.

## Dependencies

### Requires
- Unit `001-foundation` — `shared/ui/BottomSheet`, the Expo Router route for screen 20, the `bn`/`en` i18n bundles, the typed Supabase client
- Unit `002-identity` — `emergency_contacts` (owner-scoped read) and its stable primary ordering; the session for the authenticated read
- `001-home-and-help-alert-grid` — the Personal Emergency card and the shared `openDialer` hand-off
- `004-graceful-degradation` — the degraded-mode behaviour of the same help action

### Enables
- Unit `005-location` — one-shot location snapshots to a selected contact
- `008-wrong-number-report` — none directly; it consumes the shared dialer helper

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user has exactly one primary contact | The sheet shows that contact preselected; after 25 s no "call next contact" affordance appears because there is no next primary |
| The user has primary contacts but the session expired | The query fails with a typed error; the sheet shows an error state and offers a re-auth route; no dialer opens with a stale number |
| A primary contact's phone contains spaces, dashes, or a `+880` prefix | The number is normalised to E.164 form and sanitised to digits plus an optional leading `+` before it reaches the intent |
| The user backgrounds the app at 20 s and returns at 40 s | The 25 s gate is re-evaluated against elapsed time; if the sheet is still mounted the affordance appears, and it still requires a tap |
| The contact list changes while the sheet is open (a contact deleted elsewhere) | The sheet re-reads the list; the removed contact is no longer selectable and no stale row can be dialled |
| Two contacts share the same phone number | Both rows are listed and both open the dialer with that number; there is no uniqueness constraint on contact phones |
| The user taps the call circle on the card instead of a contact row | The same picker sheet opens; no dialer opens directly from the card |
| The user taps a contact but the OS has no dialer app | The intent cannot be resolved; the app shows manual-dial guidance with the number instead of an empty screen |
| The next primary's number is invalid or missing | The affordance is not rendered for that entry; the app does not open a dialer with an invalid number |

## Out of Scope

- Placing the call, observing call state, or automatic failover — forbidden by C-1 and FR-HELP-5
- The `emergency_contacts` schema, RLS, and CRUD API — unit 002 owns them; this story only reads
- The Emergency Contacts list screen's add / edit / delete flows beyond the ported layout and the primary star toggle
- The Help Alert grid, the confirmation sheet, and the Home layout — `001-home-and-help-alert-grid`
- Location Sharing to a contact — unit 005
- Any "contact notified" tracking, call receipts, or delivery confirmation — not an MVP capability

## Implementation

**This story is not built. The Personal Emergency picker does not exist.**

### What ships

Only the copy. The bundles carry the strings — `apps/mobile/src/shared/i18n/en.ts:153-154` defines `personalTitle: 'Personal emergency contact'` and `personalSubtitle: 'We will call your primary contact.'`, and line 481 carries `intro: 'Personal Emergency dials your'`.

### What does not ship

- **There is no Personal Emergency route.** `apps/mobile/app/(app)/` holds `home`, `alerts`, `alert-detail`, `capture`, `contacts`, `contact-editor`, `history`, `history-map`, `help-alert`, `more-help`, `station-map`, `thana-line`, `report-detail`, `location-sharing`, `more`, and `settings`. There is no `personal-emergency.tsx`, and `find apps/mobile/app -iname "*personal*" -o -iname "*picker*"` returns nothing.
- The only mention of the picker in the codebase is a comment: `apps/mobile/src/shared/ui/ManualDialGuidance.tsx:12` names it as one of the surfaces that renders the degraded-mode guidance — a comment written for a screen that does not exist.
- No picker component, no contact-selection list, no "dial my primary contact" action.

### The gap

The story is the citizen-facing counterpart to the primary-contact data that *does* exist (the `emergency_contacts` table and its CRUD, which story `006-emergency-contacts-crud` shipped). The data is there; the picker that turns it into a help action is not.

### What closing this needs

1. The picker route and screen: list the citizen's emergency contacts, let them choose one, and dial it through the same zero-network `openDialer` helper the other help surfaces use.
2. A primary-contact marker and an ordering, so the picker can present "your primary" first.
3. The dial action wired through `openDialer`, with the number read from the contact record.
4. A test asserting the picker dials the selected contact and makes no network request — matching `dialPath.test.ts`.

**Because nothing of the feature ships, this story stays `planned`.** It is not `partial`: `partial` would mean the picker exists and works but a guard is missing.

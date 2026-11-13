---
id: 006-emergency-contacts-crud
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 006-emergency-contacts-crud

## User Story

**As a** Nagar Shield user
**I want** to add, edit, reorder, and remove the people I trust to be reached in an emergency
**So that** when I need help, my contacts are already saved, complete, and in a sensible order

## Acceptance Criteria

- [x] **Given** a signed-in user, **When** the onboarding wizard reaches S-04a, S-04b, and S-04c, **Then** exactly three emergency contacts are captured and each screen shows the prototype's 1:1 layout with the previous contact marked "saved" — `app/(auth)/contact-1.tsx`, `contact-2.tsx`, `contact-3.tsx`, backed by the shared `src/shared/wizard/ContactCaptureScreen.tsx`. The wizard's own captures are the slots, so a user who already has contacts is not asked for duplicates.
- [x] **Given** a signed-in user, **When** they open the Emergency Contacts screen (prototype screen 20), **Then** their contacts are listed grouped by `group_name` (পরিবার / বন্ধু / সহকর্মী) with the prototype's row layout, avatars, and the "add" FAB — `app/(app)/contacts.tsx`; the FAB now opens the editor.
- [x] **Given** a user with contacts, **When** a contact is created, edited, reordered, or deleted, **Then** only that user's rows change and no other user's `emergency_contacts` row is readable or writable — proved by the live probe over GoTrue → PostgREST → RLS, with **two** signed-in citizens, because the owner-scoping criteria are only meaningful against somebody else.
- [x] **Given** an authenticated user, **When** they query `emergency_contacts` for a `user_id` that is not their own, **Then** the API returns an empty result set, not the other user's rows (RLS negative test) — both the by-id and the by-`user_id` forms are asserted, in the probe and in `supabase/tests/contacts.sql` (C6–C9).
- [x] **Given** the contact list, **When** it is rendered, **Then** the order is determined by `is_primary` first and `sort_order` second, and the same ordering is returned on every read — `is_primary DESC, sort_order ASC, created_at ASC`, asserted identical on a second read.
- [x] **Given** a user with an unlimited number of contacts, **When** they add more than the three captured during onboarding, **Then** the add action still succeeds and no cap is enforced (A-4) — the probe adds six beyond the wizard three and counts the rows.
- [x] **Given** a contact whose phone is not a valid BD E.164 number, **When** the user saves the contact, **Then** the save is rejected with `VALIDATION_FAILED` naming the `phone` field and no row is written — the shared schema rejects it client-side; the DB CHECK (migration 023) is the second line of defence.
- [x] **Given** a user whose only primary contact is deleted, **When** the delete succeeds, **Then** the user is left with no primary contact and the app surfaces a prompt to designate one, without crashing and without blocking the rest of the list — the list keeps a "no primary" notice and the editor keeps the "make primary" toggle.
- [x] **Given** a contact row, **When** it is saved, **Then** `user_id` is set from the authenticated session and never from client input, and `created_at` / `updated_at` are maintained by the database — the owner is a **database default** of `auth.uid()` (migration 022); the client omits the column entirely, and a forged owner is refused by the RLS `WITH CHECK`.

## Technical Notes

- **Owner-scoped CRUD through RLS.** `emergency_contacts` is a plain PostgREST table with RLS policies scoped by `auth.uid() = user_id` for SELECT, INSERT, UPDATE, and DELETE. No RPC and no service-role path is used for the citizen surface. RLS is the authorization mechanism — the client never sends a `user_id` it trusts.
- **`user_id` comes from the session, not the request.** The client writes `user_id: session.user.id`; the RLS `WITH CHECK` clause enforces it independently, so a forged `user_id` is rejected by the database, not merely ignored by the app.
- **Unlimited count (A-4).** There is no per-user cap on `emergency_contacts`. The prototype's "5 saved" and "12 saved" copy is static prototype content and must not be shown as a live count.
- **Stable ordering.** The read order is `ORDER BY is_primary DESC, sort_order ASC, created_at ASC`. `is_primary` plus `sort_order` are the contract that unit 003's Personal Emergency picker relies on, so the ordering must be identical on every surface that lists contacts. `sort_order` is densified on insert (max + 1) so a deleted row never leaves a gap that reshuffles the list.
- **The onboarding wizard is one of the two capture paths.** The other is the Emergency Contacts screen (prototype screen 20) reached from Settings → Safety Profile. Both write through the same owner-scoped API and the same shared `contactSchema`; the wizard screens are a 1:1 port of S-04a / S-04b / S-04c, including the "All three saved." summary on S-04c.
- **Deleting the last primary.** When the deleted contact was the only primary, the list is left in a valid state with zero primaries and the UI offers a "make primary" action. The app never auto-promotes a contact on the user's behalf without an explicit choice, and it never blocks a delete because of the primary flag.
- **Phone format.** A contact's phone is stored and compared in E.164 Bangladesh format (`+8801XXXXXXXXX`); raw `01XXXXXXXXX` input is normalised before the write. The shared `contactSchema` is the single source of truth and the DB CHECK constraint is the second line of defence.
- **`group_name` is optional free text** drawn from the prototype's three groups (পরিবার / বন্ধু / সহকর্মী); it is a display grouping, not an enum with behavioural meaning, and a contact with no group renders in an ungrouped section.
- **The unit brief's scope note.** This story owns the `emergency_contacts` **API** and the onboarding capture. The standalone Emergency Contacts list screen (prototype screen 20) and the Personal Emergency contact-picker sheet are unit 003's surfaces built on top of this API; where this story and unit 003 both touch screen 20, the API contract owned here is authoritative and unit 003 owns the picker behaviour and the dialer hand-off.
- **i18n is a hard requirement.** Every contact string ships in `bn` (primary) with English alongside. Every interactive control is ≥ 48 × 48 dp with an accessibility label.
- No token, password, phone number, or contact phone number is written to app logs.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`contactSchema`, `ApiErrorCode`), the typed Supabase client, the Expo Router route groups, the design tokens, the shared UI primitives, and the i18n bundles
- `supabase/migrations/0001_identity.sql` — the `emergency_contacts` table, its `updated_at` trigger, and the four owner-scoped RLS policies
- `001-signup-with-email-and-phone` — the wizard that captures the three contacts and the authenticated session the CRUD runs under

### Enables
- Unit `003-help-seek` — the Personal Emergency picker sheet and the stable primary ordering it depends on
- Unit `005-location` — one-shot location snapshots to a selected contact or to all primary contacts
- `002-dual-identifier-login` — the session that scopes the CRUD

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user adds a contact whose phone equals their own phone | Accepted — a contact's phone has no uniqueness constraint; it is not an identifier |
| Two contacts share the same phone number | Accepted — there is no uniqueness constraint on `emergency_contacts.phone` |
| The user deletes a contact in the middle of the list | The remaining rows are re-ordered densely and their relative order is preserved |
| The user marks a second contact as primary without clearing the first | Exactly one primary is kept per group selection action; the write is atomic so the list never shows two primaries for the same slot |
| The user deletes the only primary contact | The list is left with no primary, a prompt to designate one is shown, and nothing crashes |
| The user submits an empty name | Rejected with `VALIDATION_FAILED` naming the `name` field |
| The user submits a name longer than the field limit | Rejected client-side by the shared schema; the DB CHECK constraint is the second line of defence |
| The user is signed out and the app is resumed | The list is not rendered; the app routes to Login and no contact data is cached in plain storage |
| The network drops mid-save | The write fails with a typed error and the form retains the user's input for retry; no row is created |
| A forged `user_id` is sent on an insert | The RLS `WITH CHECK` clause rejects the write; the row is not created |
| The wizard is abandoned after Contact 1 | The already-saved contacts remain and are editable from the Emergency Contacts screen; the wizard resumes rather than duplicating them |

## Implementation Notes

Implemented in bolt `006-identity`. The story above is the spec; where the
built schema disagreed with it, **the schema won and the story was updated
to match**. Every deviation is listed here rather than silently ticked.

### The table is `contacts`, not `emergency_contacts`

The schema ships `public.contacts`. The story's text says
`emergency_contacts` in three places; those are read as naming the same
concept, and the ACs are otherwise unchanged. `supabase/tests/contacts.sql`
asserts the real name, so a rename would fail loudly.

### `group_name` is an enum, not free text

The story's Technical Notes call `group_name` "optional free text … a
display grouping, not an enum with behavioural meaning". The shipped column is
`public.contact_group` — `('family', 'friend', 'colleague', 'other')`. The
enum is the **stronger** of the two: it cannot hold a typo, and it is the
only thing that makes the three-way grouping exhaustive. The AC is met
either way — the prototype's three groups (পরিবার / বন্ধু / সহকর্মী) map onto
`family` / `friend` / `colleague`, and `other` is the ungrouped section the
story describes. The i18n layer renders the Bengali label; the enum value
never reaches the screen.

### Two migrations were needed — both found by probing, not by reading

The story says the DB CHECK is "the second line of defence" for the phone
format. It did not exist. The `contacts.phone` column carried no constraint
at all, and `contacts.user_id` had no default. Both were found by the live
probe, not by reading the schema:

- **`20261105000022_contacts_owner_default.sql`** — `user_id` now defaults to
  `auth.uid()`. Before this, an insert that omitted the owner was refused
  (the RLS `WITH CHECK` saw NULL) and the client had to name the owner
  itself — which is exactly what the story forbids. The three cases are now:
  the owner omitted → the database fills it; the client's own id → accepted;
  someone else's id → refused by `WITH CHECK`.
- **`20261105000023_contacts_phone_constraint.sql`** — adds
  `contacts_phone_format`. It is written against the **three-valued trap**:
  the obvious form (`normalise_bd_phone(phone) = phone`) silently accepts
  every non-BD number, because `normalise_bd_phone` returns NULL for one,
  `NULL = '…'` is NULL, and a CHECK rejects only FALSE. The shipped form
  requires `is not null AND =`. The constraint is added **after** the
  backfill, and the backfill **deletes** the rows it cannot repair — the
  column is `NOT NULL`, so there is nowhere to park an unparseable number.
  The same trap was found on `profiles.alternate_phone` in migration 020,
  also by a live probe.

### The primary flag is written through one path only

`updateContact` deliberately does **not** write `is_primary`. A promotion has
to clear every other primary in the same pass, and that is `makePrimary`'s
job; `clearPrimary` is its mirror. The original editor wrote the flag
through the ordinary update *before* calling `makePrimary`, which left a
window with two primaries. The editor now reads `wasPrimary` from the loaded
contact and routes through the two helpers only.

### The ordering is the contract, and `sort_order` is densified

`sort_order` is `max + 1` on insert and re-densified after a delete, so a
deleted row never leaves a gap that reshuffles the list. `reorderContacts`
writes the whole sequence in one pass. The read order is
`is_primary DESC, sort_order ASC, created_at ASC` — `created_at` is the
tie-breaker, because two rows written in the same transaction share the same
`now()`.

### Two facts that only show up over the wire

Both were found by the live probe and would have been missed by reading the
schema:

- **A write that RLS filters out is not an error.** PostgREST answers an
  UPDATE with `200` and an empty representation and a DELETE with `204` and
  no body. The probe asserts the **effect** — no rows affected, the other
  user's row unchanged — not the status code.
- **`now()` is the transaction timestamp.** `updated_at` cannot advance past
  `created_at` inside one transaction, so all rows written by one transaction
  share a timestamp. The SQL assertions are written around that fact rather
  than against it.

### Verification

| Layer | Where | Count |
|---|---|---|
| SQL assertions | `supabase/tests/contacts.sql` (Tests A–J) | 47 |
| Live probe | `tools/probe-contacts-crud.cjs` (`pnpm contacts:check`) | 26 |

The probe signs in as **two** seeded citizens (`citizen@nagar.local`,
`citizen2@nagar.local`), because the owner-scoping criteria are only
meaningful when there is somebody else to scope against. It goes through the
door the app uses — GoTrue → PostgREST → the owner-scoped RLS policies — and
cleans up its own rows (`name = like 'probe-*'`).

The SQL suite runs as an **impersonated client** (`set local role
authenticated` + `set local request.jwt.claims`), because the superuser has
`BYPASSRLS` — every RLS defect would otherwise be invisible.

### The screens

| File | What it is |
|---|---|
| `app/(app)/contact-editor.tsx` | one screen behind add **and** edit; loads the existing contact and pre-fills the form |
| `app/(app)/contacts.tsx` | the list; the FAB opens the editor |
| `src/shared/api/contacts.ts` | the CRUD API layer — `fetchContacts`, `createContact`, `updateContact`, `deleteContact`, `makePrimary`, `clearPrimary`, `reorderContacts` |
| `src/shared/wizard/ContactCaptureScreen.tsx` | the shared S-04a/b/c capture surface |
| `app/(auth)/contact-1.tsx` / `contact-2.tsx` / `contact-3.tsx` | the three wizard routes |
| `app/(auth)/location-permission.tsx` | S-05 — the just-in-time permission step, so the wizard has an end. The permission is requested on the CTA press, not on mount (FR-PERMS-1), and "Continue without location" is a first-class path. |

### One thing this story does **not** own

The stand-alone Emergency Contacts list screen is listed in the Out of Scope
section as unit 003's surface. The **API contract** is this story's, and the
list screen now consumes it — but the screen's final grouping design (and
unit 003's Personal Emergency picker sheet) is not settled by this story.

## Out of Scope

- The Personal Emergency contact-picker sheet and its dialer hand-off — unit 003
- The stand-alone Emergency Contacts list screen beyond this story's API and CRUD contract — unit 003 builds the surface on top of it
- Location Sharing to a contact — unit 005
- Account creation and the rest of the onboarding wizard — `001-signup-with-email-and-phone`
- Identifier resolution, password sign-in, and Remember me — `002-dual-identifier-login`
- Password reset by email OTP — `003-email-otp-password-reset`
- The biometric re-auth gate — `004-biometric-reauth-gate`
- Remote account disable handling — `005-remote-account-disable`
- Account deletion and restore — `007-account-deletion-and-recovery`
- Contact verification, OTP-confirmed contacts, and any "contact notified" tracking — not an MVP capability
- SMS messaging to a contact — unit 005 uses the OS share sheet for non-app recipients

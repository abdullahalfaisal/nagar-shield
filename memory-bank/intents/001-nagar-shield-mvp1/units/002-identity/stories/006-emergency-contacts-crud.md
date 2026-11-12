---
id: 006-emergency-contacts-crud
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 006-emergency-contacts-crud

## User Story

**As a** Nagar Shield user
**I want** to add, edit, reorder, and remove the people I trust to be reached in an emergency
**So that** when I need help, my contacts are already saved, complete, and in a sensible order

## Acceptance Criteria

- [ ] **Given** a signed-in user, **When** the onboarding wizard reaches S-04a, S-04b, and S-04c, **Then** exactly three emergency contacts are captured and each screen shows the prototype's 1:1 layout with the previous contact marked "saved"
- [ ] **Given** a signed-in user, **When** they open the Emergency Contacts screen (prototype screen 20), **Then** their contacts are listed grouped by `group_name` (পরিবার / বন্ধু / সহকর্মী) with the prototype's row layout, avatars, and the "add" FAB
- [ ] **Given** a user with contacts, **When** a contact is created, edited, reordered, or deleted, **Then** only that user's rows change and no other user's `emergency_contacts` row is readable or writable
- [ ] **Given** an authenticated user, **When** they query `emergency_contacts` for a `user_id` that is not their own, **Then** the API returns an empty result set, not the other user's rows (RLS negative test)
- [ ] **Given** the contact list, **When** it is rendered, **Then** the order is determined by `is_primary` first and `sort_order` second, and the same ordering is returned on every read
- [ ] **Given** a user with an unlimited number of contacts, **When** they add more than the three captured during onboarding, **Then** the add action still succeeds and no cap is enforced (A-4)
- [ ] **Given** a contact whose phone is not a valid BD E.164 number, **When** the user saves the contact, **Then** the save is rejected with `VALIDATION_FAILED` naming the `phone` field and no row is written
- [ ] **Given** a user whose only primary contact is deleted, **When** the delete succeeds, **Then** the user is left with no primary contact and the app surfaces a prompt to designate one, without crashing and without blocking the rest of the list
- [ ] **Given** a contact row, **When** it is saved, **Then** `user_id` is set from the authenticated session and never from client input, and `created_at` / `updated_at` are maintained by the database

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

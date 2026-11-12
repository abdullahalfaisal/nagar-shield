---
id: 005-remote-account-disable
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 005-remote-account-disable

## User Story

**As a** Nagar Shield user whose account has been disabled by a moderator
**I want** the app to tell me clearly on my next open that my account is disabled and to point me to support
**So that** I understand what happened and how to get help, instead of hitting silent write failures with no explanation

## Acceptance Criteria

- [ ] **Given** `profiles.disabled_at` is set, **When** the app is opened with a valid session, **Then** the message "Your account has been disabled. Contact support." is shown in Bangla (primary) with an English translation
- [ ] **Given** a disabled account, **When** any API write is attempted, **Then** the request is rejected with the error code `AUTH_DISABLED` (HTTP 403)
- [ ] **Given** a disabled account, **When** the app is opened, **Then** no write-capable surface (Capture submit, Location Sharing, emergency-contact create/edit/delete, profile edit) is reachable in an enabled state
- [ ] **Given** a disabled account, **When** a read-only surface (Alerts feed, History, the curated hotline list, station data, the offline emergency numbers) is opened, **Then** it renders without crashing and degrades to read-only
- [ ] **Given** an account that is not disabled, **When** the app is opened, **Then** no disable message is shown and the disable check adds no visible delay to reaching Home
- [ ] **Given** a moderator sets `profiles.disabled_at` while the citizen's app is running, **When** the citizen next performs a write, **Then** the write fails with `AUTH_DISABLED` and the app shows the disable message rather than a generic error
- [ ] **Given** the `disable_user` Edge Function, **When** this story is implemented before unit 007 lands, **Then** the disable path is still exercised end to end through a direct `profiles` update in tests, and the Edge Function is not re-implemented in this unit
- [ ] **Given** the disable message screen, **When** the user reads it, **Then** it names the support contact path and never claims the account was deleted, never exposes moderator notes, and never reveals why the account was disabled

## Technical Notes

- **The write path is the enforcement point.** A disabled account's session may still be cryptographically valid, so the gate is enforced twice: (1) on the client, the `disabled_at` check on session resume routes to the disable screen; (2) on the server, RLS / RPC guards on every write path return `AUTH_DISABLED` with HTTP 403. The client check is a UX convenience; the server check is the guarantee.
- **Read-only surfaces degrade, they do not crash.** The Alerts feed, History, the curated hotline dataset, and the station dataset are all readable for a disabled account. The client renders them in a read-only state and suppresses their write affordances rather than throwing on the `AUTH_DISABLED` response.
- **The `disable_user` Edge Function is owned by unit 007.** This unit consumes only its effect — the `profiles.disabled_at` column — and enforces `AUTH_DISABLED` on writes. Until unit 007 lands, the disable path is exercised through a direct `profiles` update in the Supabase-local integration test. The service-role key stays in Edge Functions and CI and never appears in the mobile bundle or any client-callable path.
- **Only a moderator may set `disabled_at`.** The RLS policy on `profiles` lets a citizen read and update only their own row and only the columns they own; `disabled_at` is set through the moderator-scoped Edge Function path. A citizen cannot disable themselves or anyone else via a direct PostgREST update.
- **The message is a fixed string, not a template.** "Your account has been disabled. Contact support." is a single i18n key with a Bangla primary and an English translation. It must not embed the moderator's reason, the disabling timestamp, or any internal identifier.
- **Resolution check on session resume.** The `disabled_at` value is read as part of the session-resume path, alongside the biometric gate evaluation. The check is a single RLS-scoped read of the user's own `profiles` row.
- **No panic-path cost.** The disable check adds no measurable cold-start latency to the panic path; Home → dialer median stays < 12 s (FR-HELP-8, unchanged). The check runs once on resume, in parallel with the profile fetch.
- **i18n is a hard requirement.** The disable message and every disabled-state affordance ship in `bn` (primary) with English alongside. Every interactive control is ≥ 48 × 48 dp with an accessibility label.
- No token, password, phone number, or account identifier is written to app logs; the structured app log for a disabled write records the action and the error code only.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode` including `AUTH_DISABLED`, the error-code → i18n mapping), the typed Supabase client, the `expo-secure-store` session helper, the Expo Router route guards, the design tokens, and the i18n bundles
- `supabase/migrations/0001_identity.sql` — the `profiles.disabled_at` column, the moderator-scoped write policy, and the RLS policies that scope a citizen to their own row
- `002-dual-identifier-login` — the session whose resume path performs the disable check
- `004-biometric-reauth-gate` — the same session-resume evaluation point; the disable check takes precedence over the biometric prompt

### Enables
- Unit `004-capture` — capture writes must be rejected with `AUTH_DISABLED` for a disabled account
- Unit `005-location` — location-share snapshots must be rejected with `AUTH_DISABLED` for a disabled account
- Unit `006-alerts` — the alerts surface degrades to read-only for a disabled account
- Unit `007-moderation` — the moderator console's disable action relies on this unit consuming `profiles.disabled_at`

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The account is disabled while the citizen is offline | The disable message appears on the next open when the session resumes; nothing is shown while offline |
| The citizen's session is already expired when the disable lands | The app shows the Login screen; after a successful sign-in the disable check fires and the disable message is shown |
| The citizen taps Capture on a disabled account before the message is displayed | The submit is rejected with `AUTH_DISABLED`; the client catches it and routes to the disable screen instead of showing a generic failure |
| A write is attempted by a disabled account through a raw PostgREST call outside the app | The server-side guard returns `AUTH_DISABLED` regardless of the client — the guarantee is not client-side |
| The disable message screen's support action needs the network and it is unavailable | The message itself is fully readable offline; only the support deep-link is unavailable, and the screen does not crash |
| The citizen's `profiles` row read fails transiently | The app treats it as "not disabled" for that resume and lets writes attempt, where the server-side guard still rejects them with `AUTH_DISABLED`; the user is never blocked by a transient read failure |
| The moderator's disable reason contains sensitive text | The reason is never shown in the app; it stays in the moderator console's audit trail |
| A moderator disables an account that is already soft-deleted | The account stays deleted; `disabled_at` and `deleted_at` are independent columns and the disable message does not offer a restore path |
| The user has contacts and captured reports already | The read-only surfaces remain browsable; the app does not purge or hide the user's own history on disable |

## Out of Scope

- Account creation and the onboarding wizard — `001-signup-with-email-and-phone`
- Identifier resolution, password sign-in, and the 30-day Remember me persistence — `002-dual-identifier-login`
- Password reset by email OTP — `003-email-otp-password-reset`
- The biometric re-auth gate and its failure accounting — `004-biometric-reauth-gate`
- Emergency-contact CRUD — `006-emergency-contacts-crud`
- Account deletion and restore — `007-account-deletion-and-recovery`
- The `disable_user` Edge Function and the moderator console UI that calls it — **unit 007**
- Undisabling an account and the appeal workflow — unit 007
- Account deletion and the 30-day PII purge — units 002 (this unit's story 007) and 008 respectively
- Social login of any kind — FR-AUTH-6
- SMS OTP delivery and the SMS opt-in flow — feature-flagged off (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`), W-2

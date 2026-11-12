---
id: 003-email-otp-password-reset
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 003-email-otp-password-reset

## User Story

**As a** Nagar Shield user who has forgotten my password
**I want** to receive a one-time code by email and set a new password
**So that** I can recover my account without any paid channel and without waiting on a carrier

## Acceptance Criteria

- [ ] **Given** a registered email address, **When** the user submits the Forgot Password form, **Then** a password-reset OTP email is requested through `sendPasswordResetOtp` and the OTP entry step opens with the prototype's screen-13 layout
- [ ] **Given** a correct OTP submitted within 10 minutes of the challenge being issued, **When** the user confirms, **Then** the password is reset and the user is signed in with a new session
- [ ] **Given** an OTP submitted more than 10 minutes after the challenge was issued, **When** the user confirms, **Then** the attempt is rejected with `VALIDATION_FAILED` and the password is unchanged
- [ ] **Given** an incorrect OTP, **When** the user confirms three times, **Then** the challenge enters a 30-minute cooldown during which every further attempt is rejected server-side
- [ ] **Given** a challenge in its 30-minute cooldown, **When** the user submits another OTP, **Then** the rejection happens server-side even if the client-side timer is bypassed, and the response carries the remaining cooldown in `details.retry_after_sec`
- [ ] **Given** `EXPO_PUBLIC_SMS_OTP_ENABLED=false`, **When** any reset screen renders, **Then** no SMS reset option, no SMS delivery claim, and no carrier-charge copy is shown
- [ ] **Given** the SMS opt-in disclosure contract, **When** the flag is off, **Then** the Settings "SMS-এ ও OTP পাঠান" row is hidden entirely and the disclosure "Switching to SMS may incur carrier charges. Nagar Shield does not profit from this" is not rendered anywhere in the app
- [ ] **Given** an identifier that matches no account, **When** the user requests a reset, **Then** the same generic response is shown as for a registered address, and no account-existence signal is returned
- [ ] **Given** a completed reset, **When** the new password is later used on the Login screen, **Then** it is accepted, and **When** the previous password is used, **Then** it is rejected

## Technical Notes

- **Email OTP is the default and the only shipped channel.** FR-AUTH-3 defaults to email because it is free; SMS-OTP is opt-in behind `EXPO_PUBLIC_SMS_OTP_ENABLED=false` (W-2). The SMS path is implemented as an abstraction only — no carrier integration, no SMS send call, no SMS delivery copy ships.
- **The disclosure is specified but hidden at MVP.** The disclosure copy — "Switching to SMS may incur carrier charges. Nagar Shield does not profit from this" — is shown **once before the opt-in takes effect**, and is **re-acknowledged at every session start where the user is opted in**. Because the flag is off for Phase 1 builds, the Settings "SMS-এ ও OTP পাঠান" row is **hidden**, so the disclosure sheet and the per-session re-acknowledgement are not reachable and the row is not rendered at all. The disclosure component is still specified so that flipping the flag later does not require new copy; the re-acknowledgement is evaluated once per session-start for an opted-in user.
- **Server-side attempt accounting.** The 3-attempt limit and the 30-minute cooldown are enforced by the challenge state in Supabase Auth (GoTrue), not by a client counter. The client renders a countdown but never becomes the authority; a bypassed client still gets rejected. The API error is `VALIDATION_FAILED` with `details.retry_after_sec` carrying the remaining cooldown.
- **10-minute validity.** The OTP challenge expires 10 minutes after issue. Expiry is evaluated server-side; the client shows a countdown that mirrors it but does not decide it.
- **Correct OTP ⇒ reset + sign-in.** `verifyPasswordResetOtp` verifies the token, applies the new password, and returns a session in one operation, so the user lands authenticated without a second credential entry.
- **Prototype screen 13 (Forgot Password) is ported 1:1**: the back button, the "অ্যাকাউন্ট পুনরুদ্ধার" app-bar title, the "পাসওয়ার্ড ভুলে গেছেন?" heading, the email helper copy, the `mail` icon, the identifier input, the "OTP কোড পাঠান" primary button, and the "← লগইনে ফিরে যান" back link. The prototype's copy says a reset **link** is sent; the shipped flow sends an OTP, so the helper copy is reworded through i18n to describe a code, and it must not claim delivery (email deliverability is not guaranteed on the free tier).
- **Identifier input accepts phone or email** and is resolved to the primary email through the same `resolve_login_identifier` RPC used by Login, so a reset requested with the phone number reaches the same account.
- **No account-existence oracle.** An unknown identifier returns the same generic message as a registered one, matching the login story's rule.
- **i18n is a hard requirement.** All reset copy ships in `bn` (primary) with English alongside; nothing is hardcoded in either language. Every interactive control is ≥ 48 × 48 dp with an accessibility label.
- No token, password, phone number, or OTP is written to app logs, including the OTP value itself.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (error codes, i18n key contract), the typed Supabase client, the `expo-secure-store` session helper, the Expo Router `(auth)` group, the design tokens, and the i18n bundles
- `supabase/migrations/0001_identity.sql` — the `resolve_login_identifier` RPC used to accept a phone identifier for the reset flow
- `001-signup-with-email-and-phone` — the email-primary account and its password credential
- `002-dual-identifier-login` — the session model and the secure-store persistence the reset re-establishes

### Enables
- `004-biometric-reauth-gate` — the password credential and identifier + password screen that the gate falls back to
- `007-account-deletion-and-recovery` — the Settings account section where the reset entry point lives
- Unit `003-help-seek`, `004-capture`, `005-location`, `006-alerts` — an account restored by this story resumes full write access

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The OTP email never arrives (free-tier deliverability) | The user can request a resend on the existing 30-second timer; the app never states the email was delivered and never claims the code was received |
| The user requests several OTPs in quick succession | Only the newest challenge is valid; the previous code is rejected as invalid rather than accepted |
| The user enters an OTP with fewer than 6 digits | Rejected client-side by the shared OTP schema; no attempt is consumed server-side |
| The user enters a correct OTP exactly at the 10-minute boundary | Treated as expired — the validity window is closed at 10 minutes |
| The 30-minute cooldown elapses while the app is closed | The next attempt is evaluated against the server state and is allowed once the cooldown has genuinely expired |
| The user is in cooldown and requests a brand-new OTP | The cooldown still applies to the new challenge; the user is shown the remaining wait rather than a false reset |
| The user resets the password on one device while signed in on another | The other device's refresh token is rejected after the password change; the user signs in again with the new password |
| The new password fails the shared password policy | Rejected with a field-level error naming `password`; the OTP is not consumed, so the user can retry with a compliant password |
| The user requests a reset for an account that is soft-deleted | The generic response is shown; the deleted account is not restored and no PII is disclosed |
| The flag `EXPO_PUBLIC_SMS_OTP_ENABLED` is flipped to `true` in a future build | The Settings SMS row and the disclosure sheet become reachable; the disclosure is shown once before opt-in and re-acknowledged each session while the user is opted in |

## Out of Scope

- Account creation and the onboarding wizard — `001-signup-with-email-and-phone`
- Signing in with an existing account — `002-dual-identifier-login`
- Biometric re-auth and its failure accounting — `004-biometric-reauth-gate`
- Remote account disable handling — `005-remote-account-disable`
- Emergency-contact CRUD — `006-emergency-contacts-crud`
- Account deletion and restore — `007-account-deletion-and-recovery`
- SMS OTP delivery, the SMS carrier-charge opt-in flow, and any carrier integration — feature-flagged off (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`), W-2
- Social login of any kind — FR-AUTH-6
- Email change, phone change, and the identity-change row in Settings — surfaced by the Settings account section
- The moderator console, the `disable_user` Edge Function, and moderator-initiated password resets — unit 007

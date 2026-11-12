---
id: 003-email-otp-password-reset
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 003-email-otp-password-reset

## User Story

**As a** Nagar Shield user who has forgotten my password
**I want** to receive a one-time code by email and set a new password
**So that** I can recover my account without any paid channel and without waiting on a carrier

## Acceptance Criteria

- [x] **Given** a registered email address, **When** the user submits the Forgot Password form, **Then** a password-reset OTP email is requested through `sendPasswordResetOtp` and the OTP entry step opens with the prototype's screen-13 layout
- [x] **Given** a correct OTP submitted within 10 minutes of the challenge being issued, **When** the user confirms, **Then** the password is reset and the user is signed in with a new session
- [x] **Given** an OTP submitted more than 10 minutes after the challenge was issued, **When** the user confirms, **Then** the attempt is rejected with `VALIDATION_FAILED` and the password is unchanged
- [x] **Given** an incorrect OTP, **When** the user confirms three times, **Then** the challenge enters a 30-minute cooldown during which every further attempt is rejected server-side
- [x] **Given** a challenge in its 30-minute cooldown, **When** the user submits another OTP, **Then** the rejection happens server-side even if the client-side timer is bypassed, and the response carries the remaining cooldown in `details.retry_after_sec`
- [x] **Given** `EXPO_PUBLIC_SMS_OTP_ENABLED=false`, **When** any reset screen renders, **Then** no SMS reset option, no SMS delivery claim, and no carrier-charge copy is shown
- [x] **Given** the SMS opt-in disclosure contract, **When** the flag is off, **Then** the Settings "SMS-এ ও OTP পাঠান" row is hidden entirely and the disclosure "Switching to SMS may incur carrier charges. Nagar Shield does not profit from this" is not rendered anywhere in the app
- [x] **Given** an identifier that matches no account, **When** the user requests a reset, **Then** the same generic response is shown as for a registered address, and no account-existence signal is returned
- [x] **Given** a completed reset, **When** the new password is later used on the Login screen, **Then** it is accepted, and **When** the previous password is used, **Then** it is rejected

## Implementation Notes

### Where the story was implemented

| Piece | Where |
|-------|-------|
| The challenge state | `supabase/migrations/20261105000021_password_reset_otp.sql` — `public.password_reset_challenges`, `password_reset_code_hash()`, `start_password_reset_otp()`, `check_password_reset_otp_state()`, `consume_password_reset_otp()` |
| The mail transport | `supabase/functions/_shared/mailer.ts` — `readMailerConfig()`, `sendViaSmtp()`, `sendViaHttp()`, `sendMail()`, `buildResetEmailBody()` |
| The Edge Function | `supabase/functions/password-reset/index.ts` — one request mode and one verify mode |
| The client service | `apps/mobile/src/shared/auth/passwordResetService.ts` — `sendPasswordResetOtp()`, `verifyPasswordResetOtp()`, `readRetryAfterSeconds()`, `readAttemptsRemaining()`, `isRateLimited()` |
| The screens | `apps/mobile/app/(auth)/forgot-password.tsx` (rewritten), `apps/mobile/app/(auth)/verify-otp.tsx` (new), `apps/mobile/app/(auth)/reset-password.tsx` (new) |
| The live proof | `tools/probe-password-reset.cjs` (`pnpm reset:check`) — 30 checks over the real path, plus `supabase/tests/password_reset.sql` — 47 assertions |
| The client unit tests | `apps/mobile/src/shared/auth/passwordResetService.test.ts` — 14 tests over the in-memory hand-off and the error-detail readers |

### GoTrue cannot carry a code, and the architecture is inverted because of it

The story's Technical Notes say the challenge state lives "in Supabase Auth
(GoTrue)". It does not, and it cannot.

GoTrue's recovery flow issues a **token**, mails a **link** that redeems it,
and exposes `POST /auth/v1/verify`. The `verify` endpoint accepts exactly two
shapes — `{type, token_hash}` and `{type, token}` — and **ignores a 6-digit
code** in both. A `code` sent beside a `token_hash` is refused with
`"Only the token_hash and type should be provided"`; a `code` sent alone is
refused with `"Verify requires either a token or a token hash"`.

The failure this was found by is the important part. The first implementation
of this story put the code **beside** the token in the `verify` call, on the
assumption that GoTrue would check it. It does not. Proved live against the
local stack: a request carrying the real token and the **wrong** code
`000000` returned a **full session** — the code was never compared. Every
six-digit guess would have produced a signed-in session.

So the ownership is inverted from what the story describes, and the split is
now:

- **The database owns the code.** The plaintext code is never stored; the
  row holds a bcrypt hash (`extensions.crypt`), compared with
  `extensions.crypt(code, hash) = hash`. A fast hash would be brute-forceable
  offline — the code space is a million — so bcrypt's cost is the point.
- **GoTrue owns the session.** The GoTrue recovery token is released to the
  client **only after** the database has confirmed the code. The `verify`
  call then carries the token and **nothing else**.

The migration's header comment records this at length, so the wrong design is
not re-derived from the story text.

### The mail is the app's own

GoTrue's recovery template always renders a **link**
(`/auth/v1/verify?token=…&type=recovery`) and the code appears nowhere in
the message it sends. `generate_link`'s `email_otp` is a display value only —
it is not redeemable through `verify`, and it is not in the mail either.

So the app owns the mail. `supabase/functions/_shared/mailer.ts` has two
transports — `MAIL_SMTP_URL` (the production relay path) and
`MAIL_HTTP_ENDPOINT` (a mailpit-compatible HTTP API, the local stack's
choice) — and **no fallback between them**. A deployment with neither
configured cannot send a code, and the function says so with
`password_reset_mail_unconfigured` rather than pretending the code was
delivered. `sendMail()` never throws; it returns `false` and the caller
turns that into a real error.

The local transport reaches the mail server by its **container alias**
(`http://inbucket:8025`). The Edge Function runs in a container, so the
host-side port mapping (`54324`) is not reachable from inside the network
and `127.0.0.1` is the container's own loopback. `supabase/functions/.env`
is **committed** for this reason — it carries no credential, and CI boots the
stack with no developer override, so the probe needs a transport that exists
without anyone writing one by hand.

### The client's shape check

The client validates the six-digit shape with the shared `otpCodeSchema`
**before** calling the server, so a typo never consumes a server attempt. It
is a convenience, not the authority: the server still counts every attempt it
sees, and the client's cooldown countdown mirrors the server's
`retry_after_sec` without ever deciding it.

The **combined** verify — check the code, apply the password, adopt the
session — happens on `reset-password`. The verify step therefore never
consumes the challenge on its own.

### The code travels in memory, not in a URL

The code the user typed has to reach the password step. It does **not** travel
in the route params: a route param is part of a URL, and a URL ends up in the
navigation state, in any route-change log, and in any crash report. The code
is a credential, and the story's own rule is that no token, password, phone
number or OTP is written to app logs.

So `passwordResetService.ts` holds the code in the **module's memory** for
the length of one navigation, and nowhere else. It is *taken* — read and
cleared in one step — so a second pass through the password step cannot replay
it, and it never survives the process. The identifier travels the same way:
it is PII, so it is in memory too, not in a URL.

The remaining cooldown and the remaining attempts **do** travel in the route
params. They are the server's own answer about the attempt counter, not
secrets, and they are what the code step needs to render.

### The criteria that are met in a weaker form than they read

**AC — the Settings "SMS-এ ও OTP পাঠান" row is hidden.** The row is not
rendered anywhere, so the criterion holds — but the Settings screen does not
exist yet (it belongs to story `007-account-deletion-and-recovery`). The
criterion is satisfied by the screen's absence rather than by a conditional
that hides the row. The `smsOtp` i18n key exists in both bundles so that
flipping the flag later needs no new copy.

**AC — the disclosure is not rendered anywhere.** Same reason: there is no
Settings screen and no disclosure sheet, so neither the opt-in sheet nor the
per-session re-acknowledgement is reachable. Both are specified so the flag
can be flipped without new copy, but neither is built.

**AC — a request with an unknown identifier shows the same generic
response.** The Edge Function returns the same body (`{"sent": true}`) and
the same status for a known and an unknown identifier, so the response is
identical. The *mail* is not sent for an unknown identifier, so no account
existence signal exists on that side either.

### The edge cases that were not built

**Resend on the 30-second timer.** The "the OTP email never arrives" row
calls for a resend on a 30-second timer. The verify screen **does** offer a
resend, but it is not on a 30-second timer — it is available immediately. A
resend issues a fresh challenge and **supersedes** the previous one, so a
frequent resender loses the code they were about to type. A 30-second timer
is the correct behaviour and is not implemented.

**A cooldown that elapses while the app is closed.** The next attempt is
evaluated against the server state, so this holds. But the client does not
reconcile its mirrored countdown with the server when the app resumes — it
carries whatever it last knew. The server is the authority, so the outcome is
correct; the displayed number may be stale until the next request.

**The password is not changed on another device.** The story expects the
other device's refresh token to be rejected after the password change. That
depends on GoTrue's session invalidation on a password update, which is
**not** proved by this story's probe — the probe covers a fresh sign-in with
the new password and a rejected sign-in with the old one, on one device.

**The soft-deleted account.** The generic response is shown for a deleted
account and no PII is disclosed. The deleted account is not restored — but
the deletion path itself belongs to story `007`, so there is no soft-deleted
fixture to prove this against yet.

### The proof

`pnpm reset:check` — 30 checks, all passing. It reads the code out of the
**mailbox**, which is the only place it can be read from in production too,
and covers: the no-oracle rule (unknown identifier → same body, same
status), the delivery, the 10-minute TTL, the bcrypt hash, the wrong code
refused with the remaining attempts reported, the third failure opening the
cooldown, the cooldown lasting 30 minutes, the **correct** code refused
while the cooldown runs, the password round-trip (new accepted, old rejected),
the code not being redeemable twice, and the superseded code being refused.

`supabase/tests/password_reset.sql` — 47 assertions inside the database,
covering the half the probe cannot: the bcrypt properties, the constants,
one-live-challenge-per-account, the code comparison, the attempt counter
surviving the rejection, the cooldown refusing even a correct code, the
validity window, the no-oracle rule, the server-only grants, and the absence
of a column named `code`.

## Technical Notes

- **Email OTP is the default and the only shipped channel.** FR-AUTH-3 defaults to email because it is free; SMS-OTP is opt-in behind `EXPO_PUBLIC_SMS_OTP_ENABLED=false` (W-2). The SMS path is implemented as an abstraction only — no carrier integration, no SMS send call, no SMS delivery copy ships.
- **The disclosure is specified but hidden at MVP.** The disclosure copy — "Switching to SMS may incur carrier charges. Nagar Shield does not profit from this" — is shown **once before the opt-in takes effect**, and is **re-acknowledged at every session start where the user is opted in**. Because the flag is off for Phase 1 builds, the Settings "SMS-এ ও OTP পাঠান" row is **hidden**, so the disclosure sheet and the per-session re-acknowledgement are not reachable and the row is not rendered at all. The disclosure component is still specified so that flipping the flag later does not require new copy; the re-acknowledgement is evaluated once per session-start for an opted-in user.
- **Server-side attempt accounting.** The 3-attempt limit and the 30-minute cooldown are enforced by the challenge state in the **database** (`public.password_reset_challenges`), not by a client counter. The client renders a countdown but never becomes the authority; a bypassed client still gets rejected. The API error is `VALIDATION_FAILED` with `details.retry_after_sec` carrying the remaining cooldown. — **DEVIATION:** the story says "in Supabase Auth (GoTrue)"; GoTrue cannot hold a code, so the state lives in Postgres. See the Implementation Notes.
- **10-minute validity.** The OTP challenge expires 10 minutes after issue. Expiry is evaluated server-side; the client shows a countdown that mirrors it but does not decide it.
- **Correct OTP ⇒ reset + sign-in.** `verifyPasswordResetOtp` verifies the token, applies the new password, and returns a session in one operation, so the user lands authenticated without a second credential entry. — **DEVIATION:** the "verifies the token" step is the database's bcrypt comparison, not GoTrue's. GoTrue's `verify` endpoint ignores a code and cannot be the thing that checks it; the GoTrue token is redeemed **after** the comparison succeeds. See the Implementation Notes.
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

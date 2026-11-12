---
id: 002-dual-identifier-login
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 002-dual-identifier-login

## User Story

**As a** registered Nagar Shield user
**I want** to sign in with either my phone number or my email address using the same password, and to choose whether the app remembers me for 30 days
**So that** I can get back into my account quickly with whichever identifier I remember, without giving up control of how long my session lasts

## Acceptance Criteria

- [ ] **Given** a registered phone number and the account's password, **When** the user submits the Login form, **Then** `resolve_login_identifier` returns the account's primary email, `signInWithPassword` is called with that email and the password, and the resulting session resolves to that account's `profiles.id`
- [ ] **Given** a registered email and the account's password, **When** the user submits the Login form, **Then** the resulting session resolves to the same `profiles.id` as the phone sign-in for that account
- [ ] **Given** one person signing in by phone and by email, **When** both sessions are compared, **Then** the account still has exactly one `auth.users` row and the password accepted is the same credential in both cases
- [ ] **Given** an identifier that matches no account, **When** the user submits, **Then** the response is the generic `VALIDATION_FAILED` message that is byte-identical to the wrong-password message, and no distinct "user not found" response is shown
- [ ] **Given** "Remember me" is checked, **When** the session is created, **Then** the refresh token is written to `expo-secure-store` with a 30-day expiry and is absent from AsyncStorage, and a force-close plus reopen within 30 days leaves the user authenticated
- [ ] **Given** "Remember me" is unchecked, **When** the app is force-closed and reopened after the session grace window has elapsed, **Then** the Login screen is shown and no refresh token is persisted in `expo-secure-store`
- [ ] **Given** the Login screen, **When** the OTP step is used, **Then** the prototype's simulated toggle is replaced by the real Supabase email-OTP flow while the brand block, hero, identifier input with the `mail` icon, the `send OTP` secondary button, the 6-digit OTP input with the `lock` icon, the green "✓ ইমেইলে কোড পাঠানো হয়েছে" helper, the 30-second resend link, and the primary submit all remain in the prototype's exact layout
- [ ] **Given** the 30-second resend link, **When** fewer than 30 seconds have elapsed since the last send, **Then** the link is disabled, and **When** 30 seconds have elapsed, **Then** a new OTP can be requested
- [ ] **Given** any auth screen, **When** it renders, **Then** no Google, Facebook, or Apple sign-in control is present (FR-AUTH-6)

## Technical Notes

- **Identifier resolution, then one password.** `resolve_login_identifier(identifier)` is a read-only `SECURITY DEFINER` RPC that accepts either an email or an E.164 BD phone and returns `{ "data": { "email": "…" } }`. It does not authenticate, does not return an `auth.users` row, and never creates a second auth user (W-1). The client then calls `signInWithPassword({ email: resolvedEmail, password })`.
- **Same credential for both identifiers.** The phone is an attribute of `profiles`, not a credential. There is no separate phone password, no phone-only auth provider, and no second `auth.users` row for the same person.
- **No account-existence oracle.** An unknown identifier returns the same generic failure as a wrong password (`VALIDATION_FAILED`). The RPC must not distinguish "no such account" from "wrong password" in either the code, the message, or the response timing shape.
- **The prototype's Login screen has no password field and no "Remember me" control**, but FR-AUTH-1/2 and the 3-fail biometric fallback both require identifier + password. Both controls are added in the prototype's own `input-group` / `toggle` styles, and the identifier + password route is the route exercised by FR-AUTH-1 acceptance.
- **The prototype's `send-otp-btn` handler is a simulation** (`display='block'`, nothing sent, nothing verified). It is replaced with the real `signInWithOtp` / `verifyOtp` flow against the resolved email. The layout is byte-identical to the prototype; the helper text must not claim delivery, because email deliverability is not guaranteed on the free tier.
- **Session persistence.** The refresh token lives in `expo-secure-store` (Android Keystore-backed), never in AsyncStorage. "Remember me" checked sets a 30-day persistence window; unchecked the session survives only the configured grace window and then the user returns to Login. The secure-store session helper is owned by unit 001 and is the only writer of tokens.
- **Protocol shapes follow `api-conventions.md`.** RPCs return the `{ "data": … }` envelope; errors return `{ "error": { "code": "VALIDATION_FAILED", "message": … } }` and the client maps `code` → a Bangla/English i18n string. Raw server or Postgres text never reaches the user.
- **No social login.** No Google / Facebook / Apple provider is wired in Auth and no such control appears on any auth screen.
- No token, password, phone number, or OTP is written to app logs.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`loginSchema`, `ApiErrorCode`), the typed Supabase client, the `expo-secure-store` session helper, the Expo Router `(auth)` group, the design tokens, and the i18n key contract
- `supabase/migrations/0001_identity.sql` — the `resolve_login_identifier` RPC, the `profiles` table with its unique `phone` column, and the RLS policies
- `001-signup-with-email-and-phone` — the account, its `profiles.id`, and its email-primary auth identity

### Enables
- `003-email-otp-password-reset` — the password credential and session model this story establishes
- `004-biometric-reauth-gate` — the valid session and the identifier + password screen that the gate falls back to
- `005-remote-account-disable` — the session this story issues is the one the disable gate inspects
- `007-account-deletion-and-recovery` — the session that deletion revokes and that restore re-establishes
- Unit `003-help-seek`, `004-capture`, `005-location`, `006-alerts` — every downstream unit consumes the session and `profiles.id` this story produces

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user types the phone in raw local form (`01711111111`) | Normalised to `+8801711111111` before the RPC call, so the resolution hits |
| The user types the email with surrounding whitespace or mixed case | Trimmed and lowercased before the RPC call; resolution still hits the account |
| The identifier is neither a valid email nor a valid E.164 BD phone | Rejected client-side by `loginSchema` with a field-level error; no RPC call is made |
| The phone belongs to a deleted (soft-deleted) account | The account does not resolve to a usable session; the generic `VALIDATION_FAILED` path is shown and the account is not probed |
| The network drops during sign-in | The request fails with a typed error, the app does not enter a half-authenticated state, and the form retains the identifier for retry |
| "Remember me" is toggled on after a successful sign-in without Remember me | The refresh token is moved into `expo-secure-store` with a 30-day expiry; no token is ever written to AsyncStorage |
| The user unchecks "Remember me" on a later sign-in | The previously persisted refresh token is removed from `expo-secure-store` and the new session is session-window bound |
| The device clock is wrong and the 30-day window is misjudged | The server remains the source of truth for token validity; the client treats an expired refresh as signed out and shows Login |
| The identifier is a phone that matches another user's alternate phone | The RPC resolves only against `profiles.phone`; the alternate phone is never a login identifier, so the resolution falls through to the generic failure |
| The OTP resend is tapped repeatedly inside 30 seconds | The resend link stays disabled until the 30-second timer expires; only one OTP is in flight per challenge |

## Out of Scope

- Account creation and the onboarding wizard — `001-signup-with-email-and-phone`
- Password reset by email OTP — `003-email-otp-password-reset`
- Biometric re-auth and its failure accounting — `004-biometric-reauth-gate`
- Remote account disable handling — `005-remote-account-disable`
- Emergency-contact CRUD — `006-emergency-contacts-crud`
- Account deletion and restore — `007-account-deletion-and-recovery`
- SMS OTP delivery and the SMS carrier-charge disclosure flow — feature-flagged off (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`), W-2
- Social login of any kind — FR-AUTH-6
- Phone-number change, email change, and the identity-change row in Settings — surfaced by the Settings account section, not part of this sign-in story
- The moderator console and the `disable_user` Edge Function — unit 007

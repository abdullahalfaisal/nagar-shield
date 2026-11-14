---
id: 002-dual-identifier-login
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 002-dual-identifier-login

## User Story

**As a** registered Nagar Shield user
**I want** to sign in with either my phone number or my email address using the same password, and to choose whether the app remembers me for 30 days
**So that** I can get back into my account quickly with whichever identifier I remember, without giving up control of how long my session lasts

## Acceptance Criteria

- [x] **Given** a registered phone number and the account's password, **When** the user submits the Login form, **Then** `resolve_login_identifier` returns the account's primary email, `signInWithPassword` is called with that email and the password, and the resulting session resolves to that account's `profiles.id`
- [x] **Given** a registered email and the account's password, **When** the user submits the Login form, **Then** the resulting session resolves to the same `profiles.id` as the phone sign-in for that account
- [x] **Given** one person signing in by phone and by email, **When** both sessions are compared, **Then** the account still has exactly one `auth.users` row and the password accepted is the same credential in both cases
- [x] **Given** an identifier that matches no account, **When** the user submits, **Then** the response is the generic `VALIDATION_FAILED` message that is byte-identical to the wrong-password message, and no distinct "user not found" response is shown
- [x] **Given** "Remember me" is checked, **When** the session is created, **Then** the refresh token is written to `expo-secure-store` with a 30-day expiry and is absent from AsyncStorage, and a force-close plus reopen within 30 days leaves the user authenticated
- [x] **Given** "Remember me" is unchecked, **When** the app is force-closed and reopened after the session grace window has elapsed, **Then** the Login screen is shown and no refresh token is persisted in `expo-secure-store`
- [ ] **Given** the Login screen, **When** the OTP step is used, **Then** the prototype's simulated toggle is replaced by the real Supabase email-OTP flow while the brand block, hero, identifier input with the `mail` icon, the `send OTP` secondary button, the 6-digit OTP input with the `lock` icon, the green "✓ ইমেইলে কোড পাঠানো হয়েছে" helper, the 30-second resend link, and the primary submit all remain in the prototype's exact layout
- [ ] **Given** the 30-second resend link, **When** fewer than 30 seconds have elapsed since the last send, **Then** the link is disabled, and **When** 30 seconds have elapsed, **Then** a new OTP can be requested
- [x] **Given** any auth screen, **When** it renders, **Then** no Google, Facebook, or Apple sign-in control is present (FR-AUTH-6)

## Technical Notes

- **Identifier resolution, then one password.** `resolve_login_identifier(identifier)` is a read-only `SECURITY DEFINER` RPC that accepts either an email or an E.164 BD phone and returns `{ "data": { "email": "…" } }`. It does not authenticate, does not return an `auth.users` row, and never creates a second auth user (W-1). The client then calls `signInWithPassword({ email: resolvedEmail, password })`.
- **Same credential for both identifiers.** The phone is an attribute of `profiles`, not a credential. There is no separate phone password, no phone-only auth provider, and no second `auth.users` row for the same person.
- **No account-existence oracle.** An unknown identifier returns the same generic failure as a wrong password (`VALIDATION_FAILED`). The RPC must not distinguish "no such account" from "wrong password" in either the code, the message, or the response timing shape.
- **The prototype's Login screen has no password field and no "Remember me" control**, but FR-AUTH-1/2 and the 3-fail biometric fallback both require identifier + password. Both controls are added in the prototype's own `input-group` / `toggle` styles, and the identifier + password route is the route exercised by FR-AUTH-1 acceptance.
- **The prototype's `send-otp-btn` handler is a simulation** (`display='block'`, nothing sent, nothing verified). Under waiver W-1 it is **not** replaced on the Login screen: the email-OTP flow belongs to the **password reset**, where story `003-email-otp-password-reset` owns it (`forgot-password.tsx` → `verify-otp.tsx` → `reset-password.tsx`). The Login screen is a password flow, and adding an OTP step to it would give a signed-out user two ways into the account. The helper text on the reset flow must not claim delivery, because email deliverability is not guaranteed on the free tier.
- **Session persistence.** The refresh token lives in `expo-secure-store` (Android Keystore-backed), never in AsyncStorage. "Remember me" checked sets a 30-day persistence window; unchecked the session survives only the configured grace window and then the user returns to Login. The secure-store session helper is owned by unit 001 and is the only writer of tokens. The window itself is enforced in that helper — `apps/mobile/src/shared/api/session-storage.ts` — at the only place a session is read back, and the policy is written **beside** the session rather than inside it, because the value under the session key is `supabase-js`'s own JSON.
- **The generic sign-in failure code.** The criterion names `VALIDATION_FAILED`; the app's own code for a refused sign-in is `AUTH_REQUIRED` (`packages/shared/src/errors/index.ts`). What the criterion requires is that the **same** code and the **same** message are used for an unknown identifier and for a wrong password — and that is what ships, and what the probe asserts. The code's *name* is a naming difference between the criterion and the codebase, not a behavioural one.
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

## Implementation

**The dual-identifier login, the Remember-me window and the no-social-login rule all ship, and each is proved by a guard that fails when the thing it guards is broken. The story is `partial` for one reason only: two of its criteria describe a login-screen OTP step that the email-primary waiver (W-1) removed, and no guard can be written for a screen that is not there.**

### What ships

| Piece | Where |
|-------|-------|
| The login screen | `apps/mobile/app/(auth)/login.tsx` — the identifier input (`testID="login-identifier"`), the password input, and the Remember-me switch (`accessibilityLabel={t('auth.rememberMe')}`) |
| The sign-in service | `apps/mobile/src/shared/auth/authService.ts` — `logIn({ identifier, password, rememberMe })`, `resolveEmail()` |
| The identifier resolver | `supabase/migrations/20261105000007_read_models.sql` — `resolve_login_identifier(p_identifier)`, `SECURITY DEFINER`, granted to `anon` |
| The session window | `apps/mobile/src/shared/api/session-storage.ts` — `REMEMBERED_WINDOW_MS`, `SESSION_GRACE_WINDOW_MS`, `SessionPersistencePolicy`, and the store's `getItem`/`setItem`/`removeItem` |
| The live proof | `tools/probe-dual-identifier-login.cjs` (`pnpm dual-identifier:check`) — **17/17** assertions over the real GoTrue + PostgREST path |
| The client guards | `apps/mobile/src/__tests__/login.dom.test.tsx` (12), `apps/mobile/src/shared/auth/authService.test.ts` (11), `apps/mobile/src/shared/api/session-window.test.ts` (14), `apps/mobile/src/__tests__/noSocialLogin.test.ts` (11) |

### The three gaps, and what closed them

The three gaps this section used to name are all closed — and one of them was **worse than it said**.

#### 1. "No component test on the login screen" — closed

`apps/mobile/src/__tests__/login.dom.test.tsx`. The claim is **split**, the same way `boot.dom.test.tsx` splits it, because `@testing-library/react-native` is not installed and a React Native tree cannot be rendered here:

- **The rendered half** — the screen's form state is rendered with real React hooks in jsdom, and driven the way a user drives it. An email, a `+`-prefixed E.164 number, the raw local form (`01711111111`), and a mixed-case value with surrounding whitespace all reach the submit **unchanged**. The screen does not trim, lowercase, or strip a `+` — `logIn` owns the normalisation.
- **The structural half** — the screen's own source is read and its wiring asserted: the identifier input writes the state (`onChangeText={setIdentifier}`), the state reaches the call (`logIn({ identifier, password, rememberMe })`), and the screen does **not** normalise the identifier on the way in.

Neither half alone would do. The rendered half proves the *value* survives; the structural half proves the *wiring* exists.

#### 2. "No test that the Remember-me switch actually changes the session write" — closed, and the gap was bigger than it said

The gap was not "no assertion covers the branch". **The branch did not exist.**

The Supabase client is built with `auth: { storage: secureStore, autoRefreshToken: true, persistSession: true }`, so the session was written to `expo-secure-store` on **every** sign-in, whatever the switch said, and stayed there indefinitely. `rememberMe` reached `logIn` and did nothing except trigger a `refreshSession()`. There was no 30-day window anywhere in the codebase and no grace window either.

So **AC #6 failed outright** — not merely untested. The window now exists:

- `REMEMBERED_WINDOW_MS` is 30 days; `SESSION_GRACE_WINDOW_MS` is one day.
- `logIn` records the policy **before** `signInWithPassword`, because `supabase-js` writes the session as part of the sign-in (`_saveSession` → `storage.setItem`) and a policy set afterwards would be too late for the first write.
- The policy is written to the store **beside** the session, not inside it — the value under the session key is `supabase-js`'s own JSON, and `supabase-js` parses it back.
- The window is enforced in the store's `getItem`, which is the only place a session is read back and therefore the only place "past the window" can become "no session". A session past its window reads as a miss, and the stale entry is deleted on the way out.
- A failed sign-in leaves **no** policy behind, and a sign-out clears the one that is there.

The three guards are `session-window.test.ts` (the store), `authService.test.ts` (the flag → the policy, and the order), and `login.dom.test.tsx` (the screen → the flag).

#### 3. "No i18n key-parity gate covers `auth.rememberMe`" — was stale

The gate **already exists**: `apps/mobile/src/shared/i18n/keyParity.test.ts` asserts that every key in the English bundle is present in the Bangla bundle and the other way round. `auth.rememberMe` is in both (`bn.ts:66` — `'মনে রাখুন'`, `en.ts:73` — `'Remember me'`). The gap list had not been re-read since the gate landed.

### The gap this section did not name, and that was the real one

**Nothing proved that the phone and the email resolve to the same account.** The RPC was covered inside Postgres (`supabase/tests/read_models.sql` — a phone resolves to the account's email, a national-format phone resolves to the same account, an unknown identifier raises `AUTH_REQUIRED`), but the RPC is only **half** of AC #1. AC #1 says the *session* must resolve to the account's `profiles.id`, which means the email the RPC returned must actually **authenticate**, and the identity behind the resulting JWT must be the account the phone belongs to. A resolver that returned the wrong email would pass every RPC test and fail every user.

`tools/probe-dual-identifier-login.cjs` does the whole trip, twice, and compares:

- the phone resolves over REST **as an anonymous caller** (the shape the client uses — at sign-in the caller has no session, so the RPC has to be `SECURITY DEFINER`);
- the national-format phone resolves to the same account;
- the phone sign-in's session resolves to the account's `profiles.id` **and** its `profiles.phone`;
- the email sign-in resolves to the **same** `profiles.id`;
- the account has exactly **one** `auth.users` row, and the phone created no second one;
- a wrong password is refused through both paths with the **same** status, and the refusal carries no "user not found" signal;
- an unknown identifier carries the same `AUTH_REQUIRED` signal.

Each run creates its own account, through the Auth admin endpoint, with a unique digits-only phone. `profiles.phone` is UNIQUE and the signup trigger refuses a metadata without one (`PHONE_REQUIRED`), so a fixed account would eventually fail against a healthy codebase — a proof that stops working after N runs is not a proof.

### The two criteria that stay open, and why

AC #7 and AC #8 describe a **login-screen OTP step**: the prototype's simulated `send OTP` toggle replaced by "the real Supabase email-OTP flow", with the brand block, hero, identifier input, `send OTP` secondary button, 6-digit OTP input, the green helper, a 30-second resend link, and the primary submit all in the prototype's exact layout. AC #8 is the 30-second resend link's disabled state.

**Neither is built, and neither can be.** The waiver **W-1** made Auth email-primary: the login is a password flow, and the email-OTP flow belongs to the **password reset**, where story `003-email-otp-password-reset` (which is `complete`) owns it — `forgot-password.tsx` → `verify-otp.tsx` → `reset-password.tsx`, proved by `tools/probe-password-reset.cjs` and `supabase/tests/password_reset.sql`.

So the two criteria are **void against this story**, not unmet — the same call the handover made for `005-admin-skeleton-and-ci`'s AC2. The email-OTP flow they describe **is** in the app, on the screen the story describes it least, and it is proved; what is not there is an OTP step **on the Login screen**. Making AC #7 true as written would mean putting a second credential path on the login screen, which is the opposite of W-1's "email-primary and password-only" and would give a signed-out user two ways into the account.

The decision belongs to the story's author: **amend or retire the two criteria**, moving the OTP-step requirement to `003-email-otp-password-reset` where it belongs.

### The rule that also shipped: no social login (FR-AUTH-6)

AC #9 had **no guard at all**. A `Button` labelled *"Continue with Google"* would have shipped unnoticed — and it would have been worse than a cosmetic defect: a social provider is a **second credential system** with its own account rows, which would break the "one person, one `auth.users` row" invariant the whole identity model rests on.

`apps/mobile/src/__tests__/noSocialLogin.test.ts` scans three places — the auth screens, both i18n bundles, and the Supabase client and auth service — and asserts that every `.auth.*` call in the auth modules is on an **explicit allowlist**. A deny-list would let a new sign-in method through by default; an allowlist makes a new one a deliberate act.

The scan carries a **positive control**: a synthetic source that *does* contain a social control, run through the same matcher, which must be flagged. A negative claim alone cannot distinguish "clean" from "blind".

### The causal checks

Every guard in this story was proved to **fail** when the thing it guards is broken, and then restored:

| Guard | Broken, and the guard failed |
|-------|------------------------------|
| `login.dom.test.tsx` | the screen trimmed the identifier before the call → the wiring assertion failed; the input stopped writing the state → the wiring assertion failed |
| `authService.test.ts` | the switch became decorative (`windowForRememberMe(true)` always) → the window assertions failed; the policy was set **after** the sign-in → the order assertion failed |
| `session-window.test.ts` | the policy read was stubbed out → both expiry assertions failed; the policy write was removed → the "persists the policy beside the session" assertion failed |
| `noSocialLogin.test.ts` | a *"Continue with Google"* button was planted → both the provider-name and the social-label assertions failed; a `provider: 'facebook'` string was wired in → the provider assertion failed |
| `probe-dual-identifier-login.cjs` | the `profiles.id` assertion was broken → the probe failed with exit 1 |

### What closing this still needs

1. **A decision on AC #7 and AC #8** — amend or retire them, and move the email-OTP-step requirement to `003-email-otp-password-reset`.
2. Nothing else. Every other criterion is met by shipped code and a guard that fails when the code is broken.


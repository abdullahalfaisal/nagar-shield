---
unit: 002-identity
intent: 001-nagar-shield-mvp1
phase: inception
status: ready
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Unit Brief: Identity

## Purpose

Own the `identity` domain module end to end: signup, dual-identifier login
(phone **OR** email + password against an email-primary Supabase Auth user),
30-day "Remember me" session persistence, email-OTP password reset, a local
biometric re-auth gate with the 3-fail / 5-in-24h failure rules, remote account
disable, emergency-contact CRUD, and account deletion with a 30-day recovery
window. Every citizen screen that asks "who is this?" starts here, and every
later unit (capture, location, alerts, moderation) depends on the `profiles`
row and the session this unit produces.

## Scope

### In Scope

- `supabase/migrations/0001_identity.sql` — `profiles` + `emergency_contacts`
  tables, role enum, CHECK constraints, RLS policies, `updated_at` trigger,
  profile auto-provisioning trigger on `auth.users` insert
- `resolve_login_identifier(identifier)` RPC — phone-or-email → the
  email-primary Auth email (identifier resolution only; no password handling)
- Supabase Auth wiring: `signUp`, `signInWithPassword`,
  `sendPasswordResetOtp`, `verifyPasswordResetOtp`, session refresh, sign-out
- Session persistence in `expo-secure-store` with the 30-day "Remember me"
  persistence window and a session-grace window when unchecked
- Biometric re-auth gate: opt-in preference, local prompt on returning
  sessions, failure accounting (3 fails → password screen, 5 fails / 24 h →
  biometric auto-disabled)
- Remote account disable handling: read `profiles.disabled_at` on session
  resume, show the disable message, and reject writes with `AUTH_DISABLED`
  (the `disable_user` Edge Function itself is owned by unit 007)
- `emergency_contacts` CRUD surface (PostgREST + owner RLS) consumed by the
  onboarding wizard and by unit 003
- Account deletion: soft-delete (`profiles.deleted_at`), 30-day recovery
  window, `restoreAccount` before expiry; the PII purge leg after 30 days is
  owned by unit 008
- Mobile screens: the onboarding wizard (S-00, S-01, S-02, S-04a/b/c, S-05,
  S-06), Login, Registration, Forgot Password, the biometric lock gate, and
  the Settings → account section — all 1:1 from `docs/design/screen-spec.md`
- i18n keys for every new string in `bn` (primary) and `en`

### Out of Scope

- The moderator console UI and the `disable_user` Edge Function (unit 007
  `007-moderation`) — this unit only consumes their effect
- The standalone Emergency Contacts list screen (screen spec screen 20) and
  the Personal Emergency contact-picker sheet — unit 003 builds those
  surfaces on top of this unit's `emergency_contacts` API
- The account PII purge job after the 30-day window (unit 008
  `008-jobs-operations`)
- SMS OTP delivery, SMS cost disclosure flows, and any carrier integration
  (feature-flagged off, W-2)
- Social login providers of any kind (FR-AUTH-6)
- Capture, location sharing, alerts, moderation, and Help Alert behaviour

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-1 | Dual-identifier signup and login (email-primary Auth, unique E.164 phone) | Must |
| FR-AUTH-2 | Remember me — 30-day refresh-token persistence in the OS secure store | Must |
| FR-AUTH-3 | Password reset by email OTP (10-minute validity, 3 attempts, 30-minute cooldown) | Must |
| FR-AUTH-4 | Biometric re-auth for returning sessions (local device unlock, never a credential) | Should |
| FR-AUTH-5 | Biometric failure handling (3 fails → password screen, 5 fails / 24 h → auto-disable) | Must |
| FR-AUTH-6 | No social login | Must |
| FR-AUTH-7 | Remote account disable (`profiles.disabled_at`, `AUTH_DISABLED` on writes) | Must |
| FR-DATA-6 | Account deletion — soft-delete with a 30-day recovery window, then PII purge | Should |
| FR-PERMS-1 | Just-in-time permission requests (applied to the auth/onboarding screens) | Must |

---

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `profiles` | Extends `auth.users`; one row per person; the identity, preferences, and account-state record | `id` uuid PK → `auth.users.id`, `phone` text unique not null (E.164, BD format), `email` text unique, `role` enum `citizen\|moderator` (default `citizen`), `locale` text, `theme` text, `biometric_opt_in` boolean default false, `biometric_fail_count` integer default 0, `biometric_fail_window_started_at` timestamptz, `disabled_at` timestamptz, `deleted_at` timestamptz, `created_at` timestamptz, `updated_at` timestamptz |
| `auth.users` | Supabase-managed identity record — **never** written by client code directly | `id` uuid, `email` text unique, encrypted password credentials, email/OTP verification state (managed by GoTrue) |
| `emergency_contacts` | The citizen's trusted contacts, owned by this unit; CRUD surface consumed by unit 003 | `id` uuid PK, `user_id` uuid FK → `profiles.id` not null, `name` text not null, `phone` text not null (E.164 BD), `is_primary` boolean default false, `sort_order` integer not null, `group_name` text (prototype groups: পরিবার / বন্ধু / সহকর্মী), `created_at` timestamptz, `updated_at` timestamptz |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `resolve_login_identifier` | RPC — resolves a phone **or** email to the email-primary Auth email (does not authenticate, does not reveal account existence) | `identifier` text | `{ "data": { "email": "…" } }` |
| `signUp` | Supabase Auth signup — one auth user per person; `profiles` row provisioned with the same `id` | `{ email, password, phone }` | session + `profiles` row |
| `signInWithPassword` | Supabase Auth password sign-in using the **resolved email** | `{ email, password }` | session (access + refresh token) |
| `sendPasswordResetOtp` | Sends the password-reset OTP to the account email | `{ email }` | OTP challenge state (10-minute validity) |
| `verifyPasswordResetOtp` | Verifies the OTP, resets the password, signs the user in | `{ email, token, password }` | new session |
| `recordBiometricAttempt` | Biometric failure accounting — increments the rolling 24 h counter; at 3 fails returns the password-screen fallback, at 5 fails clears `biometric_opt_in` | `{ success: boolean }` | `{ "data": { "fail_count": n, "biometric_enabled": boolean, "fallback": "password" \| null } }` |
| `disableUser` | Moderator action — sets `profiles.disabled_at` (implemented by the `disable_user` Edge Function, unit 007) | `{ user_id, reason }` | `{ "data": { "disabled_at": "…" } }` |
| `deleteAccount` | Soft-delete — sets `profiles.deleted_at`, revokes the session, starts the 30-day recovery window | `{ password }` | `{ "data": { "deleted_at": "…", "recoverable_until": "…" } }` |
| `restoreAccount` | Undoes a soft-delete inside the 30-day window (clears `deleted_at`) | authenticated session + `{ user_id }` | restored profile |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 7 |
| Must Have | 6 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| US-AUTH-01 | Signup with email + phone (email-primary Auth user, one profile row) | Must | Planned |
| US-AUTH-02 | Dual-identifier login (phone or email) + 30-day Remember me | Must | Planned |
| US-AUTH-03 | Password reset by email OTP (10-minute OTP, 3 attempts, 30-minute cooldown) | Must | Planned |
| US-AUTH-04 | Biometric re-auth gate with 3-fail / 5-in-24h failure handling | Must | Planned |
| US-AUTH-05 | Remote account disable handled in-app (`AUTH_DISABLED` on writes) | Must | Planned |
| US-AUTH-06 | Emergency contacts CRUD (onboarding capture + owner-scoped CRUD) | Must | Planned |
| US-AUTH-07 | Account deletion with a 30-day recovery window and restore | Should | Planned |

> US-AUTH-04 covers FR-AUTH-4 (Should) and FR-AUTH-5 (Must); the story is
> Must because its failure-handling half is a Must.

---

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-foundation` | `packages/shared` schemas (`signupSchema`, error codes, i18n key contract), the typed Supabase client, the secure-store session helper, the Expo Router `(auth)` / `(onboarding)` / `(app)` groups, and the design tokens |

### Depended By

| Unit | Reason |
|------|--------|
| `003-help-seek` | Needs `profiles` (author identity), the session, and `emergency_contacts` for the Personal Emergency picker |
| `004-capture` | Needs the session + `profiles.id` as `author_id`; writes must be rejected with `AUTH_DISABLED` for disabled accounts |
| `005-location` | Needs the session + `emergency_contacts` for one-shot snapshots |
| `006-alerts` | Needs the session, `profiles.id`, and the disabled-account gate |
| `007-moderation` | Needs `profiles.role` and `profiles.disabled_at`; owns the `disable_user` Edge Function this unit consumes |
| `008-jobs-operations` | Needs the deletion/purge contract (soft-delete timestamp → 30-day purge job) |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| Supabase Auth (GoTrue) | Identity, password credentials, email OTP delivery, refresh tokens | Medium — email deliverability is not guaranteed by the free tier; OTP copies must never promise delivery |
| Supabase Postgres | `profiles`, `emergency_contacts`, RPC, RLS | Low |
| `expo-secure-store` | Refresh-token persistence (Android Keystore-backed) | Low |
| `expo-local-authentication` | Fingerprint / face prompt on returning sessions | Medium — hardware and enrolled-biometric availability vary per device; the gate must degrade to password |
| npm registry | Expo SDK, `@supabase/supabase-js`, `expo-local-authentication` | Low |

---

## Technical Context

### Suggested Technology

Expo SDK + Expo Router, `@supabase/supabase-js` (typed, from unit 001),
PostgREST + Postgres RPC for `profiles` / `emergency_contacts` /
`resolve_login_identifier`, `expo-secure-store` for session tokens,
`expo-local-authentication` for the biometric prompt, React Hook Form + Zod
resolvers with the shared schemas, TanStack Query for the contacts query,
`i18next` + `expo-localization` for `bn` / `en`, Jest + React Native Testing
Library for unit tests, Maestro for the Android E2E flows, and Supabase local
(for RLS / RPC integration tests).

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Mobile → Supabase Auth (GoTrue) | API | HTTPS — `signUp`, `signInWithPassword`, `signInWithOtp` / `verifyOtp`, `sendPasswordResetOtp`, `verifyPasswordResetOtp`, refresh, sign-out |
| Mobile → PostgREST `/rest/v1/profiles` | API | HTTPS — GET/PATCH own row (RLS-scoped) |
| Mobile → RPC `resolve_login_identifier` | API | HTTPS — `POST /rest/v1/rpc/resolve_login_identifier` |
| Mobile → PostgREST `/rest/v1/emergency_contacts` | API | HTTPS — owner-scoped CRUD |
| Admin → Edge Function `disable_user` | API | HTTPS — **owned by unit 007**; this unit only reads `profiles.disabled_at` and enforces `AUTH_DISABLED` |
| Mobile → `expo-secure-store` | Native module | Keychain/Keystore-backed token persistence (never AsyncStorage) |
| Mobile → `expo-local-authentication` | Native module | Biometric prompt + local gate evaluation |
| Mobile → `expo-localization` | Native module | Bangla-first locale resolution (from unit 001) |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `profiles` rows | Postgres table | Low — ~1k rows | With the account; PII purged after the 30-day deletion window |
| `emergency_contacts` rows | Postgres table | Low — ≤ 5 rows per user (≤ ~5k rows) | With the account |
| Session access + refresh tokens | OS secure store (`expo-secure-store`) | 1 session | 30 days when "Remember me" is checked; otherwise the session grace window only |
| Biometric opt-in flag | Device key-value | 1 key | Until changed; cleared when the account-level flag auto-disables |
| Biometric failure counters | Device key-value + mirrored on `profiles` | 1 local key + 2 columns | Rolling 24-hour window; reset on success |
| Password-reset OTP challenge | Supabase Auth (GoTrue) | 1 in-flight challenge per account | 10-minute validity; 30-minute cooldown after 3 wrong attempts |

### Mobile Screens

Every screen below is a **1:1 port** of `docs/design/screen-spec.md` and
`prototype ui.html`; no redesign, no additional chrome.

| Screen | Prototype spec | Story | Notes |
|--------|----------------|-------|-------|
| Welcome | S-00 (screen 1) | US-AUTH-01 | Entry point for "Create my safety profile" and "Log in to existing account" |
| Own Phone | S-01 (screen 2) | US-AUTH-01 | Primary phone, E.164 BD, uniqueness checked before submit |
| Alt Phone | S-02 (screen 3) | US-AUTH-01 | Alternate phone — must differ from the primary |
| Contact 1 | S-04a (screen 5) | US-AUTH-06 | First emergency contact (name + mobile) |
| Contact 2 | S-04b (screen 6) | US-AUTH-06 | Second emergency contact |
| Contact 3 | S-04c (screen 7) | US-AUTH-06 | Third emergency contact; "All three saved." summary |
| Location | S-05 (screen 8) | US-AUTH-01 / FR-PERMS-1 | Just-in-time location request; "Continue without location" is a valid path |
| All Set | S-06 (screen 9) | US-AUTH-01 | Profile summary; "Open Nagar Shield" → Home |
| Login | screen 11 | US-AUTH-02 | Identifier (phone or email) → resolved email → password or email-OTP step; "Remember me" control |
| Registration | screen 12 | US-AUTH-01 | Full name, email, phone (+ password field — see Notes) |
| Forgot Password | screen 13 | US-AUTH-03 | Identifier → email OTP → new password |
| Biometric lock gate | new surface (no prototype screen) | US-AUTH-04 | Wraps returning sessions; password fallback on 3 fails; never a lockout screen |
| Settings → account section | screen 16 (Settings) | US-AUTH-04 / US-AUTH-05 / US-AUTH-07 | Profile edit, identity change (phone/email), biometric opt-in toggle, delete account; the SMS-OTP row is hidden while the flag is off |

---

## Constraints

- **W-1 — email-primary identity.** Supabase Auth is email-primary; one
  `auth.users` row per person, never two. Dual login = identifier resolution
  (`resolve_login_identifier`) + **one** password. `profiles.phone` is
  required, unique, and E.164.
- **W-2 — SMS OTP is feature-flagged OFF.** `EXPO_PUBLIC_SMS_OTP_ENABLED=false`.
  No SMS reset or verification path is offered, and **no product copy may
  claim SMS verification or delivery** — including the prototype's Registration
  "SMS-এও OTP পাঠান" checkbox and the Settings "SMS-এ ও OTP পাঠান" toggle, both
  of which must be hidden while the flag is off.
- Phone numbers are stored and compared in **E.164 Bangladesh format**
  (`+8801XXXXXXXXX`). Raw `01XXXXXXXXX` input is normalised before any
  comparison, uniqueness check, or RPC call.
- The signup path must never create two auth users for one person — the
  `profiles` row is provisioned from the `auth.users` insert trigger using the
  same `id`, never by a second client-side insert.
- **No social login** — no Google / Facebook / Apple control may appear on any
  auth screen (FR-AUTH-6).
- **Biometric is a local device unlock, never a credential.** The fingerprint /
  face template never leaves the device and is never sent to Supabase; the
  biometric gate only unlocks an already-valid session.
- A biometric failure must never lock the user out: at 3 consecutive failures
  the identifier + password screen is shown; at 5 failures within 24 hours the
  biometric preference is auto-disabled for that account.
- Identifier resolution must not leak account existence — an unknown
  identifier returns the same generic error as a wrong password
  (`VALIDATION_FAILED`), never a distinct "user not found" response.
- A disabled account (`profiles.disabled_at` set) sees "Your account has been
  disabled. Contact support." and every API write fails with
  `AUTH_DISABLED`.
- Deletion is a **soft delete** for 30 days; PII purge is the purge leg owned
  by unit 008 and must not run before the window closes.
- FR-PERMS-1: **no permission prompt on first launch.** The location prompt
  fires only on the S-05 Location step, immediately before the feature that
  needs it; every prompt has a "continue without" path.
- RLS is the authorization mechanism: a citizen may read/update only their own
  `profiles` row and their own `emergency_contacts`; only a moderator may read
  all profiles or set `disabled_at`.
- The service-role key stays in Edge Functions and CI — it must never appear
  in a mobile bundle or in any client-callable code path.
- The biometric lock gate has no prototype screen. It reuses the prototype's
  visual language (tokens, card, primary/secondary buttons) but is a new
  surface — it must not introduce a new layout system.
- All user-facing strings go through i18n; **Bangla is primary**, English is
  the secondary locale, and no string is hardcoded in either language.

---

## Success Criteria

### Functional

- [ ] A successful signup creates **exactly one** `auth.users` row and
      **exactly one** `profiles` row sharing the same `id`, with
      `profiles.phone` equal to the submitted number in E.164 form
- [ ] Signing up with a phone number that already belongs to another account
      fails with `VALIDATION_FAILED` and **no auth user is created**
- [ ] Logging in with the registered **phone** + correct password resolves to
      the same account (`profiles.id`) as logging in with the registered
      **email** + the same password
- [ ] "Remember me" checked → the refresh token is present in
      `expo-secure-store` (and **absent** from AsyncStorage) and the session
      survives a force-close and reopen within 30 days
- [ ] "Remember me" unchecked → after the session grace window the login
      screen is shown and no refresh token is persisted
- [ ] Password reset sends an OTP email for a registered address; a correct OTP
      submitted within 10 minutes resets the password and signs the user in
- [ ] An OTP submitted after 10 minutes is rejected
- [ ] After 3 incorrect OTP attempts, further attempts are rejected for
      30 minutes (cooldown enforced server-side, not only in the UI)
- [ ] 3 consecutive biometric failures show the identifier + password screen;
      no lockout screen is reachable and no credential is locked
- [ ] 5 biometric failures within 24 hours set `biometric_opt_in = false`, and
      the next session goes straight to password login
- [ ] A disabled account shows "Your account has been disabled. Contact
      support." on app open, and every API write returns `AUTH_DISABLED`
- [ ] Account deletion soft-deletes immediately (`deleted_at` set, session
      revoked), the account is restorable for 30 days, and PII is purged once
      the window closes (purge leg verified with unit 008)
- [ ] A user can create, edit, reorder, and delete emergency contacts, and can
      read no other user's contacts (RLS negative test)
- [ ] No social sign-in control exists on any auth screen (code scan + screen
      review)
- [ ] No shipped string claims SMS verification or SMS OTP delivery while
      `EXPO_PUBLIC_SMS_OTP_ENABLED=false` (code + copy scan)

### Non-Functional

- [ ] Every auth/onboarding screen is a 1:1 port of `docs/design/screen-spec.md`
      (screenshot comparison against the prototype for S-00 … S-06, screens
      11, 12, 13, and the Settings account section)
- [ ] Every interactive control on the auth, onboarding, and gate screens is
      ≥ 48 × 48 dp with an accessibility label
- [ ] Every new i18n key resolves in `bn` (primary) and `en`, with native
      Bangla review
- [ ] The biometric gate adds no measurable cold-start latency to the panic
      path — Home → dialer median stays < 12 s (FR-HELP-8, unchanged)
- [ ] No token, password, phone number, or OTP appears in app logs or in
      Edge Function structured logs

### Quality

- [ ] Jest unit tests cover the biometric attempt accounting
      (3 → password fallback, 5 / 24 h → auto-disable, window reset) and the
      E.164 phone normalisation
- [ ] Supabase-local integration tests cover the `resolve_login_identifier`
      RPC (email hit, phone hit, unknown identifier), profile provisioning,
      and the RLS policies for `profiles` and `emergency_contacts`
- [ ] A Maestro E2E flow covers signup → onboarding → Home → biometric
      re-auth → 3-fail password fallback
- [ ] A Maestro E2E flow covers account disable (moderator action) → citizen
      sees the disable message, and account delete → restore inside the
      30-day window
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass for the shared
      package, the mobile app, and the migration dry-run

---

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-002-identity-1 | ddd | US-AUTH-01, US-AUTH-02 | `0001_identity.sql` (`profiles`, `emergency_contacts`, RLS, `resolve_login_identifier`, provisioning trigger) + Supabase Auth wiring (signup, identifier resolution, password sign-in, Remember me session) |
| bolt-002-identity-2 | simple | US-AUTH-01, US-AUTH-03, US-AUTH-04 | Mobile auth surfaces: onboarding wizard (S-00 … S-06), Login, Registration, Forgot Password, email-OTP flow, biometric lock gate with failure accounting |
| bolt-002-identity-3 | simple | US-AUTH-05, US-AUTH-06, US-AUTH-07 | Account lifecycle: disabled-account gate (`AUTH_DISABLED`), Settings → account section (profile/identity edit, biometric toggle), emergency-contact CRUD, account deletion + 30-day restore |

---

## Notes

- **The prototype's Login screen is a simulation.** Its `send-otp-btn`
  handler simply sets `document.getElementById('otp-step').style.display='block'`
  and hides itself — no code is sent, nothing is verified. That toggle must be
  replaced with the **real Supabase email-OTP flow**
  (`signInWithOtp` / `verifyOtp` against the resolved email) while keeping the
  layout identical: brand block, hero, identifier input with the `mail` icon,
  the `send OTP` secondary button, the 6-digit OTP input with the `lock` icon,
  the green "✓ ইমেইলে কোড পাঠানো হয়েছে" helper, the 30-second resend link,
  and the primary submit. The resend timer is real, and the helper text must
  not claim delivery.
- **The prototype's Login screen has no password field and no "Remember me"
  control**, but FR-AUTH-1/2 and FR-AUTH-5 require identifier + password
  (including the 3-fail biometric fallback screen). Both controls are added in
  the prototype's own input-group / toggle styles — the identifier + password
  route is the one exercised by FR-AUTH-1 acceptance, and the email-OTP step
  remains the second factor shown in the prototype.
- **The prototype's Registration screen fields are:** full name (`পূর্ণ নাম`),
  email (`ইমেইল (প্রয়োজন)`), phone (`ফোন (প্রয়োজন)`), the "SMS-এও OTP
  পাঠান (ঐচ্ছিক, অপারেটর চার্জ প্রযোজ্য)" checkbox, and the 6-digit OTP
  input. FR-AUTH-1 also requires a **password**, so a password input is added
  in the same style, and the SMS-OTP checkbox is **removed** while
  `EXPO_PUBLIC_SMS_OTP_ENABLED=false` (its copy claims SMS delivery, which the
  flag forbids).
- **Prototype screen numbering skips screen 4** (the index jumps S-02 → S-04a)
  and the wizard copy reads "Step 1 of 4" on both phone screens, "Step 2 of 4"
  on the contact screens, and "Step 4 of 4 · last" on Location. The RN route
  set follows the screens that exist in the spec (S-00, S-01, S-02, S-04a/b/c,
  S-05, S-06) and the step labels are ported verbatim — the copy is the
  contract, so the discrepancy is flagged here rather than "fixed" in the UI.
- **The alternate phone (S-02) has no column in the specified `profiles`
  schema.** Recommendation: add a nullable, non-unique
  `profiles.alternate_phone text` (E.164) in `0001_identity.sql`. It is
  explicitly **not** a login identifier and does not affect uniqueness. If
  the schema is frozen without it, the S-02 field cannot be persisted and the
  screen must be reduced — raise with the parent before implementation.
- **The prototype's Settings screen shows an "SMS-এ ও OTP পাঠান" toggle**
  under নিরাপত্তা. It is hidden while the flag is off; the biometric opt-in
  toggle and the delete-account entry are added to the account section.
- **i18n is a hard requirement, not a follow-up.** Bangla is the primary
  locale: every wizard, auth, gate, and account-section string ships in `bn`
  first with English alongside, reviewed by a native speaker, with Bangla
  rendered in Noto Sans Bengali.
- The biometric gate is a new surface with no prototype counterpart. It is
  built from the existing token set and shared primitives and reuses the
  prototype's card + button treatment; no new design language is introduced.
- `resolve_login_identifier` is a read-only resolution RPC. It must not
  authenticate, must not return an `auth.users` row, and must return a
  generic failure for an unknown identifier so that account existence cannot
  be probed.
- The `disable_user` Edge Function is **owned by unit 007**; this unit only
  consumes the resulting `profiles.disabled_at` and enforces `AUTH_DISABLED`
  on writes. Until unit 007 lands, the disable path is exercised through a
  direct `profiles` update in tests.
- The 30-day PII purge is **owned by unit 008**; this unit owns the
  soft-delete and the restore path only. Both halves share the
  `deleted_at` timestamp as the contract.

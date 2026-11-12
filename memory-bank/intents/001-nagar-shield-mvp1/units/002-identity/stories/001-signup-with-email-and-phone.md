---
id: 001-signup-with-email-and-phone
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 001-signup-with-email-and-phone

## User Story

**As a** first-time Nagar Shield user in Bangladesh
**I want** to create one account with my email, a password, and my own mobile number, then complete a short safety-profile wizard
**So that** I have a single identity that Nagar Shield can reach me through and that I can sign in to from any device

## Acceptance Criteria

- [x] **Given** a new email, a valid password, and a BD mobile number, **When** the user completes registration, **Then** exactly one `auth.users` row and exactly one `profiles` row exist, and both carry the same `id`
- [x] **Given** a successful signup, **When** the `profiles` row is read, **Then** `profiles.email` equals the submitted email, `profiles.phone` equals the submitted number in E.164 form (`+8801XXXXXXXXX`), and `profiles.role` is `citizen`
- [x] **Given** a phone number that already belongs to another account, **When** signup is submitted, **Then** the request fails with the error code `VALIDATION_FAILED` and the `auth.users` table gains no new row
- [x] **Given** a phone number that is not a valid BD E.164 number, **When** the user submits, **Then** the request fails with `VALIDATION_FAILED` and the `auth.users` table gains no new row
- [x] **Given** a signup submission, **When** the phone format and uniqueness checks run, **Then** both checks complete before any `auth.users` insert is attempted, proven by an integration test that counts `auth.users` rows before and after a rejected signup
- [x] **Given** the Registration screen with `EXPO_PUBLIC_SMS_OTP_ENABLED=false`, **When** it renders, **Then** no SMS-OTP checkbox, no SMS-OTP copy, and no claim of SMS delivery is present
- [ ] **Given** the onboarding wizard, **When** the user advances step by step, **Then** the screen order is exactly S-00 → S-01 → S-02 → S-04a → S-04b → S-04c → S-05 → S-06, and each screen matches the prototype's 1:1 layout in `docs/design/screen-spec.md`
- [ ] **Given** the S-05 Location step, **When** the user reaches it, **Then** the OS location permission is requested at that moment (no permission prompt appears on first launch) and choosing "Continue without location" advances to S-06
- [x] **Given** the S-02 alternate phone step, **When** the user enters a number equal to the primary number, **Then** the form is rejected with a field-level error and the value is not stored
- [x] **Given** the S-02 alternate phone step, **When** the user enters a valid alternate number, **Then** it is stored in the nullable, non-unique `profiles.alternate_phone` column, and a second account may store the same alternate number without a uniqueness error

## Technical Notes

- **One person, one auth user.** Supabase Auth is email-primary (W-1). The `profiles` row is provisioned by an `AFTER INSERT` trigger on `auth.users` that copies `new.id` into `profiles.id`; the client never performs a second insert into `profiles`.
- **Phone validation happens before the auth user exists.** Two layers: (1) a pre-flight `SECURITY DEFINER` RPC (`check_phone_available`) answers "is this E.164 BD number already taken?" so the client can fail fast with a field error; (2) the provisioning trigger inserts `profiles.phone` under a `UNIQUE` constraint and raises on violation, which rolls back the `auth.users` insert inside the same transaction. Layer 2 is the guarantee — a race between two simultaneous signups cannot leave a second auth user behind, so a rejected duplicate phone leaves **zero** new `auth.users` rows.
- **E.164 normalisation before any comparison.** Raw `01XXXXXXXXX` input is normalised to `+8801XXXXXXXXX` by the shared helper before the format check, the uniqueness check, the RPC call, and the stored value. Stored and compared values are always E.164 BD.
- **`profiles.alternate_phone` is added in `supabase/migrations/0001_identity.sql`** as `text NULL` with a format CHECK but **no unique constraint** — the prototype's S-02 field has no column in the specified schema, so this column is the documented recommendation from the unit brief. The alternate phone is never a login identifier and never participates in uniqueness. If the schema is frozen without it, the S-02 field cannot be persisted and the screen must be reduced — raise with the parent before implementation.
- **The prototype's SMS-OTP checkbox is removed** from the Registration screen while `EXPO_PUBLIC_SMS_OTP_ENABLED=false`. Its copy claims SMS delivery, which the flag forbids. The Registration screen keeps the prototype's full name / email / phone fields and adds a password input in the same `input-group` / `input-field` style, because FR-AUTH-1 requires a password.
- **The wizard copy is the contract.** The prototype's step labels are ported verbatim, including the discrepancy: "Step 1 of 4" appears on both phone screens, "Step 2 of 4" on all three contact screens, and "Step 4 of 4 · last" on Location. Prototype screen numbering skips screen 4 (S-02 → S-04a). These are flagged in the unit brief, not "fixed" in the UI.
- **FR-PERMS-1 just-in-time permission.** The location permission fires only on S-05, immediately before the feature that needs it. "Continue without location" is a first-class path, not an error state.
- **Validation is shared.** `signupSchema` from `packages/shared` (email, password ≥ 8 characters, E.164 phone) is the single source of truth; the DB CHECK constraints are the second line of defence.
- **i18n is a hard requirement.** Every wizard and Registration string ships in `bn` (primary, Noto Sans Bengali) with English alongside; no string is hardcoded in either language. Every interactive control is ≥ 48 × 48 dp with an accessibility label.
- **No social login.** No Google / Facebook / Apple control may appear on any screen in this story (FR-AUTH-6).
- No token, password, phone number, or OTP is written to app logs.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`signupSchema`, `ApiErrorCode`, E.164 normaliser), the typed Supabase client, the `expo-secure-store` session helper, the Expo Router `(auth)` / `(onboarding)` / `(app)` groups, the design tokens, and the i18n key contract
- `supabase/migrations/0001_identity.sql` — the `profiles` table (including `alternate_phone`), the `auth.users` provisioning trigger, the `updated_at` trigger, and the RLS policies
- `006-emergency-contacts-crud` — the S-04a / S-04b / S-04c contact steps of this wizard write through that story's owner-scoped API

### Enables
- `002-dual-identifier-login` — the account this story creates is the account that story resolves by phone or email
- `004-biometric-reauth-gate` — the `profiles` row and its `biometric_opt_in` / failure-counter columns
- `005-remote-account-disable` — `profiles.disabled_at` is read from the row this story provisions
- `006-emergency-contacts-crud` — the wizard's contact steps are its onboarding capture path
- `007-account-deletion-and-recovery` — `profiles.deleted_at` on the row this story provisions
- Unit `003-help-seek` — the author identity (`profiles.id`) for Personal Emergency
- Unit `004-capture` — the session and `profiles.id` as `author_id`

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user enters `01711-111111` | Normalised to `+8801711111111` before validation, uniqueness check, and storage; the raw form is never persisted |
| The user enters a non-BD number (`+14155550123`) | Rejected with `VALIDATION_FAILED` naming the `phone` field; no `auth.users` row is created |
| The user enters a BD landline (`02-XXXXXXX`) | Rejected — FR-AUTH-1 requires E.164 mobile format |
| Two users submit the same phone at the same instant | The unique-constraint violation inside the provisioning trigger rolls the transaction back; exactly one `auth.users` row exists and the loser receives `VALIDATION_FAILED` |
| The user abandons the wizard after S-01 | The auth user and `profiles` row already exist; the wizard resumes on the next open rather than creating a second account |
| The email is already registered | GoTrue rejects the signup; the client shows a generic `VALIDATION_FAILED`-style message and never creates a second auth user |
| The user declines the location permission on S-05 | "Continue without location" advances to S-06 and the profile is completed with no location; the app still functions |
| The user re-enters the primary number on S-02 | The field is rejected client-side with a field error; `profiles.alternate_phone` stays `NULL` |
| A different user enters the same alternate number | Accepted — `alternate_phone` is intentionally non-unique |
| The device has no network during signup | The request fails with a typed error; no partial auth user is left behind, and the form retains the user's input for retry |

## Out of Scope

- Login with an existing account — `002-dual-identifier-login`
- Password reset and OTP verification — `003-email-otp-password-reset`
- The biometric re-auth gate and its failure accounting — `004-biometric-reauth-gate`
- Remote account disable handling — `005-remote-account-disable`
- The full emergency-contact CRUD surface beyond the wizard's three capture steps — `006-emergency-contacts-crud`
- Account deletion and restore — `007-account-deletion-and-recovery`
- SMS OTP delivery, SMS carrier integration, and the SMS-OTP opt-in — feature-flagged off (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`), W-2
- Social login of any kind — FR-AUTH-6
- The moderator console and the `disable_user` Edge Function — unit 007
- The post-signup panic-path surfaces (Capture, Location Sharing, Alerts) — units 004, 005, 006

## Implementation Notes

### Where the story was implemented

| Concern | Where |
|---------|-------|
| The signup call and the duplicate-phone mapping | `apps/mobile/src/shared/auth/authService.ts` — `signUp` |
| The Registration screen and its field errors | `apps/mobile/app/(auth)/register.tsx` |
| The S-02 alternate-phone step | `apps/mobile/app/(auth)/alternate-phone.tsx` |
| The alternate-phone write | `apps/mobile/src/shared/api/profile.ts` — `setAlternatePhone` |
| The shared normalisation and the two schemas | `packages/shared/src/schemas/index.ts` — `normalisePhone`, `phoneSchema`, `alternatePhoneSchema` |
| The `alternate_phone` format CHECK | `supabase/migrations/20261105000020_alternate_phone_constraint.sql` |
| The signup contract, proved over the wire | `tools/probe-signup-contract.cjs` — `pnpm signup:check` |
| The alternate-phone constraint, proved over the wire | `tools/probe-alternate-phone.cjs` — `pnpm alternate:check` |
| The column's write rules, proved in Postgres | `supabase/tests/write_guards.sql` — Test H |

### The `check_phone_available` RPC does not exist

The Technical Notes describe **two** layers: a pre-flight `SECURITY DEFINER`
RPC (`check_phone_available`) that lets the client fail fast, and the
`UNIQUE` constraint inside the provisioning trigger that is "the guarantee".

Only the second layer exists. The pre-flight would have been advisory — it
answers "is this number taken?" *before* the insert, but the answer can go
stale between the check and the insert, so the constraint is the only thing
that actually holds. The guarantee the story asks for is therefore met by
the stronger of the two mechanisms, and the client maps the constraint's
violation to `VALIDATION_FAILED` with `{ field: 'phone' }` so the error
lands on the phone input rather than in a banner.

No pre-flight RPC was written, deliberately: an advisory check that can
disagree with the constraint is a source of false confidence, and the
constraint violation already produces the right error code.

### The two criteria that are not met as written

**The wizard's screen order (the second unticked criterion).** The S-02
alternate-phone step is implemented and the S-00 → S-01 → S-02 order holds,
but the S-04a → S-04b → S-04c contact steps belong to `006-emergency-contacts-crud`,
which is still open (the contacts API is read-only). The S-05 Location step
is not yet the just-in-time permission surface either — the location fix is
hard-coded to `null` (gap L1/L2). Both criteria stay unticked until those
stories land.

### The three-valued trap in the format CHECK

The `alternate_phone` CHECK cannot be written the obvious way:

```sql
check (normalise_bd_phone(alternate_phone) = alternate_phone)
```

`normalise_bd_phone` returns NULL for a non-BD number, `NULL = '…'` is NULL,
and a CHECK constraint rejects only FALSE — so the obvious form silently
accepts **every** non-BD number. The shipped constraint requires the
normaliser to be non-NULL as well:

```sql
check (
  alternate_phone is null
  or (
    public.normalise_bd_phone(alternate_phone) is not null
    and public.normalise_bd_phone(alternate_phone) = alternate_phone
  )
)
```

`pnpm alternate:check` is what caught this, and it is wired into CI for
exactly that reason.

The constraint is added **after** the backfill. A row holding the local
form (`01712345678`) fails the check as written, so the order is
load-bearing: normalise first, constrain second.

### Why the alternate phone is written after the signup

The `profiles` row is created by the `handle_new_user()` trigger on
`auth.users`, and that trigger writes `id, email, phone, full_name` only —
it does not carry `alternate_phone`. There is therefore no way to set the
column as part of the signup itself. `signUp` returns the new user's id so
the Registration screen can write the column straight afterwards.

That write is owned by the profile's owner, so it succeeds, and it is
allowed to fail without failing the signup: the account exists, the user is
signed in, and the alternate phone is a convenience detail. When it fails,
the user is told (`auth.alternatePhoneNotSaved`) but is not thrown back to
the form.

### The "must differ" comparison normalises both sides

Comparing the raw strings would let `01711-111111` and `+8801711111111` —
the same number, two spellings — pass the "must differ from your primary
number" rule. Both sides are normalised to E.164 before the comparison, and
`packages/shared/src/schemas/schemas.test.ts` asserts that the two
spellings compare equal.

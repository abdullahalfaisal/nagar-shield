---
id: 007-account-deletion-and-recovery
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: ready
priority: should
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 007-account-deletion-and-recovery

## User Story

**As a** Nagar Shield user who no longer wants the app
**I want** to delete my account and be able to change my mind within 30 days
**So that** I can leave with my personal data gone, while still having a fair window to come back if I deleted it by mistake

## Acceptance Criteria

- [ ] **Given** an authenticated user, **When** the user confirms account deletion, **Then** `profiles.deleted_at` is set, the current session is revoked, and the app returns to the Welcome screen
- [ ] **Given** a soft-deleted account, **When** the user restores it inside the 30-day window, **Then** `profiles.deleted_at` is cleared, the account's data is intact, and the user can sign in again
- [ ] **Given** a soft-deleted account, **When** the recovery window is measured, **Then** the recoverable period is exactly 30 days from `profiles.deleted_at`, and the app shows the remaining days in that window
- [ ] **Given** a soft-delete, **When** the operation completes, **Then** the `auth.users` row still exists — the auth identity is **not** destroyed at soft-delete time
- [ ] **Given** more than 30 days have elapsed since `profiles.deleted_at`, **When** the user attempts to restore, **Then** the restore is refused with `VALIDATION_FAILED` and the account cannot be recovered through the app
- [ ] **Given** a soft-deleted account, **When** the user signs in again within the window, **Then** the app shows the recovery screen offering "restore my account" and "sign out", and the account's PII has not been scrubbed
- [ ] **Given** a soft-deleted account, **When** a write is attempted before it is restored, **Then** the write is rejected with `AUTH_DISABLED` and the account's emergency contacts and reports are not modified
- [ ] **Given** a soft-deleted account, **When** the 30-day window closes, **Then** the PII purge leg scrubs the profile, and the purge does not run before the window closes

## Technical Notes

- **Soft delete only.** Deletion sets `profiles.deleted_at`; it does not delete the `auth.users` row and does not delete the `profiles` row. The `auth.users` row survives the soft-delete window so the restore path can re-establish a session; it is the purge leg's job to destroy it afterwards.
- **The contract with unit 008 is the timestamp.** This unit owns the soft-delete and the restore path only. Unit 008 (`008-jobs-operations`) owns the 30-day PII purge job, and both halves share `profiles.deleted_at` as the single contract. The purge must not run before `deleted_at + 30 days`; a purge that fires early is a defect in unit 008 and is verified jointly with that unit.
- **`deleteAccount` requires the password.** The operation takes `{ password }` so that a stolen unlocked device cannot destroy an account. The password is re-verified server-side before `deleted_at` is written.
- **Session revocation at delete time.** The current session is signed out and the persisted refresh token is removed from `expo-secure-store` immediately, so a deleted account cannot keep writing with a cached token. The server-side guard still rejects writes with `AUTH_DISABLED` for a deleted account.
- **`restoreAccount` is time-boxed.** The restore RPC checks `deleted_at IS NOT NULL AND now() < deleted_at + interval '30 days'`; past that, it refuses with `VALIDATION_FAILED` and the account can only be recovered through the purge-leg path (which no longer exists).
- **Deletion is scoped to the account.** A soft-deleted account's `emergency_contacts` and captured reports are left untouched at soft-delete time; they are scrubbed by unit 008's purge leg, not by this story. The user cannot delete another user's rows.
- **Entry point.** Deletion lives in the Settings → account section (prototype screen 16), where the biometric opt-in toggle and the delete-account entry sit alongside the account rows. The Settings "SMS-এ ও OTP পাঠান" row remains hidden while `EXPO_PUBLIC_SMS_OTP_ENABLED=false`.
- **`disabled_at` and `deleted_at` are independent.** A deleted account is not "disabled" in the moderator sense and the two columns do not interact; the disable message does not offer a restore path and the restore screen does not mention moderation.
- **i18n is a hard requirement.** All deletion, confirmation, and recovery copy ships in `bn` (primary) with English alongside. Every interactive control is ≥ 48 × 48 dp with an accessibility label.
- No token, password, phone number, or account identifier is written to app logs.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode`), the typed Supabase client, the `expo-secure-store` session helper, the Expo Router route groups, the design tokens, and the i18n bundles
- `supabase/migrations/0001_identity.sql` — the `profiles.deleted_at` column, the `deleteAccount` and `restoreAccount` RPCs, and the owner-scoped RLS policies
- `002-dual-identifier-login` — the session and the secure-store persistence that deletion revokes and that restore re-establishes
- `001-signup-with-email-and-phone` — the account whose `profiles.deleted_at` is set

### Enables
- Unit `008-jobs-operations` — the 30-day PII purge job consumes `profiles.deleted_at` as its trigger and its deadline
- `005-remote-account-disable` — both stories gate writes on `profiles` state and share the `AUTH_DISABLED` write rejection

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user mistypes the password on the confirmation | The delete is rejected with `VALIDATION_FAILED`; nothing is written and the account is untouched |
| The app is force-closed during the confirmation dialog | Nothing is deleted — the delete is only committed when the confirmation is explicitly submitted |
| The user deletes and the device loses network immediately after | The server has already committed the soft delete and revoked the session; on reopen the app shows the recovery screen, not the Home screen |
| The user restores on a different device | The restore is allowed — it is scoped to the account, not to the device — and the new device signs in normally |
| The user restores exactly at the 30-day boundary | Treated as expired; the window is closed at 30 days |
| The user deletes an account that is already soft-deleted | The operation is idempotent — `deleted_at` is not extended, so the original recovery deadline still applies |
| The user deletes an account that a moderator has disabled | Both states are recorded independently; the account can still be restored inside the window |
| The user restores but the account's emergency contacts were purged | The restore succeeds for whatever remains; the app renders the contacts list with whatever rows exist and does not fabricate the missing ones |
| The user never returns | The purge leg in unit 008 scrubs the profile after the window closes; this story does not perform the purge |
| The user presses "sign out" on the recovery screen instead of restoring | The account stays soft-deleted, the recovery window keeps running, and the app returns to the Welcome screen |

## Out of Scope

- The 30-day PII purge job and its scheduling — **unit 008** (`008-jobs-operations`)
- Undeleting after the 30-day window — not an MVP capability
- Account creation and the onboarding wizard — `001-signup-with-email-and-phone`
- Identifier resolution, password sign-in, and the 30-day Remember me persistence — `002-dual-identifier-login`
- Password reset by email OTP — `003-email-otp-password-reset`
- The biometric re-auth gate and its failure accounting — `004-biometric-reauth-gate`
- Remote account disable handling and the `disable_user` Edge Function — `005-remote-account-disable` and unit 007
- Emergency-contact CRUD — `006-emergency-contacts-crud`
- Deleting the user's captured reports, media, or flags — the report/media retention rules belong to units 004 and 008
- Data export / portability before deletion — not an MVP capability
- Social login of any kind — FR-AUTH-6
- SMS OTP delivery and the SMS opt-in flow — feature-flagged off (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`), W-2

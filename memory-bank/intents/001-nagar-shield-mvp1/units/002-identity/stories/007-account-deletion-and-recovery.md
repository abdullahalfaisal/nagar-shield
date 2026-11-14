---
id: 007-account-deletion-and-recovery
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: complete
priority: should
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
---

# Story: 007-account-deletion-and-recovery

## User Story

**As a** Nagar Shield user who no longer wants the app
**I want** to delete my account and be able to change my mind within 30 days
**So that** I can leave with my personal data gone, while still having a fair window to come back if I deleted it by mistake

## Acceptance Criteria

- [x] **Given** an authenticated user, **When** the user confirms account deletion, **Then** `profiles.deleted_at` is set, the current session is revoked, and the app returns to the Welcome screen
- [x] **Given** a soft-deleted account, **When** the user restores it inside the 30-day window, **Then** `profiles.deleted_at` is cleared, the account's data is intact, and the user can sign in again
- [x] **Given** a soft-deleted account, **When** the recovery window is measured, **Then** the recoverable period is exactly 30 days from `profiles.deleted_at`, and the app shows the remaining days in that window
- [x] **Given** a soft-delete, **When** the operation completes, **Then** the `auth.users` row still exists — the auth identity is **not** destroyed at soft-delete time
- [x] **Given** more than 30 days have elapsed since `profiles.deleted_at`, **When** the user attempts to restore, **Then** the restore is refused with `VALIDATION_FAILED` and the account cannot be recovered through the app
- [x] **Given** a soft-deleted account, **When** the user signs in again within the window, **Then** the app shows the recovery screen offering "restore my account" and "sign out", and the account's PII has not been scrubbed
- [x] **Given** a soft-deleted account, **When** a write is attempted before it is restored, **Then** the write is rejected with `AUTH_DISABLED` and the account's emergency contacts and reports are not modified
- [x] **Given** a soft-deleted account, **When** the 30-day window closes, **Then** the PII purge leg scrubs the profile, and the purge does not run before the window closes

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

## Implementation

**The delete, the 30-day restore window, and the purge path all ship and are proven against the live stack. The three gaps this section used to name are closed, and the story is now `complete`.**

### What ships

- The delete path works and is proven live: `tools/probe-account-deletion.cjs` reports **26/26** assertions against the running stack.
- The restore window is enforced by the database, not by the app. Migration `034` turns `restore_account` into a **conditional update bounded by `recoverable_until`**, so a restore attempted after the 30-day window is refused by Postgres rather than by a client-side date comparison that could be bypassed. The refusal carries `VALIDATION_FAILED` (errcode `22023`).
- The soft-deleted guard is in place: writes from a soft-deleted account are refused (`ACCOUNT_DISABLED` on the wire, which the client maps to `AUTH_DISABLED`).
- `apps/mobile/app/(auth)/account-deleted.tsx` renders the deleted state and offers Restore and Sign out.
- **The screen now states the deadline and reports a closed window truthfully.** The three gaps below are closed.
- **The purge leg's side of the contract is now proved too.** AC #8 names two things: that the purge scrubs the profile, and that it does not run before the window closes. The second was unguarded — and proving it found two real defects in unit 008's purge, both fixed by migration `036`. See "The purge leg" below.

### The gaps, and how each closed

| # | The gap as written | How it closed |
|---|---|---|
| 1 | "An expired restore is misreported as an internal error." | The screen branches on the failure code. `VALIDATION_FAILED` renders *"the 30-day recovery period has ended"* — in Bangla and English — and `CONFLICT` renders the conflict copy. Only an unknown failure is reported as `errors.internal`. The classification lives in `apps/mobile/src/shared/api/recovery-window.ts` as `classifyRestoreFailure` and `restoreErrorCopy`, beside the window rules they depend on, so they are pure functions of (failure, window state) and are tested against the **real** bundles. |
| 2 | "`recoverableUntil` is fetched but never read." | It is read. `loadAccountStatus` now returns `deletedAt` and `recoverableUntil`, `useAccountStatus` carries `recoverableUntil` through, and the recovery screen shows the days remaining and the deadline date. The deadline is derived by `recoveryDeadline()` in the shared package, so the app, the purge leg and the database cannot drift apart. |
| 3 | "The screen has no guard against pressing Restore after the window closed." | The Restore button is disabled once the window has closed, and the screen says why. The boundary is **exclusive** — at exactly `deleted_at + 30 days` the window has closed — which is what the database's `now() >= deleted_at + interval '30 days'` says, so the client never offers a restore the server will refuse. |

### The purge leg

AC #8 says: *"the PII purge leg scrubs the profile, and the purge does not run before the window closes"*.

The **job** is unit `008-jobs-operations`'s — `supabase/functions/purge-deleted-accounts/` and the `job_purge_deleted_accounts` worklist. But the *promise* is this story's, because this story makes it to the citizen. So the half of the contract that lives in unit 008 is proved here too, and proving it found two defects:

| # | The defect | The fix |
|---|---|---|
| 1 | The purge's window was **one microsecond too narrow**. Its predicate was `deleted_at < now() - interval '30 days'`, while this story's restore refuses at `now() >= deleted_at + interval '30 days'` — the same instant, written with a strict inequality. In the sliver between them the account was **unrecoverable but not yet purgeable**: the citizen's account was gone, the app said the recovery period had ended, and their PII was still on disk with the job refusing to touch it. | Migration `036` makes the predicate `deleted_at <= now() - interval '30 days'`. The three statements of the boundary — the restore's refusal, the shared package's `isRecoveryWindowOpen`, and the purge's worklist — now name the same instant. |
| 2 | The job worklists were executable by **`anon` and `authenticated`**. `job_purge_deleted_accounts` returns every account awaiting its purge and the instant it was deleted. Migration 012 revoked execute only from `public`, which does not remove the direct grants Supabase's default privileges give those roles — so any signed-in citizen could read them. | Migration `036` revokes from `public`, `anon` **and** `authenticated` explicitly, and `schema_contract.sql` now asserts that **no** `job_*` function is client-executable. |

The purge's own story — unit 008's `002-deleted-account-pii-purge` — carries the detailed account of both.

### The guards

| Guard | What it proves |
|---|---|
| `apps/mobile/src/shared/api/recovery-window.test.ts` (18 tests) | The deadline is 30 days; the days remaining are floored; the boundary is exclusive at exactly the deadline; a **missing** deadline is treated as *open*, not closed — the app does not know the deadline, the server does, and assuming "closed" would take away a restore the user was entitled to. |
| `apps/mobile/src/__tests__/account-deleted.dom.test.tsx` (15 tests) | The **message**, against the real bundles: a closed window says so in Bangla and English and never says "try again"; a conflict is not a closed window; an unknown failure is an internal error. The structural half asserts the screen actually routes the failure through `restoreErrorCopy`, actually renders it, and actually disables the button. |
| `packages/shared/src/jobs/jobs.test.ts` (5 new tests) | `recoveryDeadline` agrees with `ACCOUNT_RECOVERY_WINDOW_DAYS` and with the purge cut-off; `isRecoveryWindowOpen` is exclusive at the boundary. |
| `supabase/tests/account_deletion.sql` (12 assertions) | The purge's half of the contract, in the database: a 1-day and a 29-day deletion are not purge candidates; a 31-day one is; the boundary account at exactly 30 days **is**; one second inside the window is not; a stamped account leaves the list; and the two halves of the promise agree in both directions. |
| `supabase/tests/schema_contract.sql` (2 new assertions) | No `job_*` worklist is executable by `anon` or `authenticated`, and every one of them is executable by `service_role`. The check is over the pattern, not a named list. |
| `tools/probe-account-deletion.cjs` (26/26) | The whole contract over the real GoTrue + PostgREST path, including the facts the probe did not previously assert: the `auth.users` row **survives** the soft delete (AC #4), the client can read the `deleted_at` the deadline is derived from (AC #3), a signed-in citizen's call to the purge worklist is **refused** with HTTP 403, and the worklist holds a freshly deleted account **not** at all. |

### The causal checks

Each guard was proved to **fail** when the thing it guards is broken, then restored:

| Break | The guard that caught it |
|---|---|
| The screen's bare `catch { setError(t('errors.internal')) }` restored | 2 tests fail in `account-deleted.dom.test.tsx` |
| `disabled={busy}` — the button not disabled when the window closes | 1 test fails |
| `isWindowOpen` using `<=` instead of `<` — an inclusive boundary | 1 test fails in `recovery-window.test.ts` |
| `classifyRestoreFailure` mapping `VALIDATION_FAILED` to `nothingToRestore` | 5 tests fail across the two files |
| The purge worklist's predicate reverted to `<` | 2 assertions fail in `account_deletion.sql` (Test A4, Test B1) |
| `grant execute … to authenticated` on the purge worklist | Test E1 fails in `account_deletion.sql`; the probe drops to 25/26 and prints the leaked rows |
| `grant execute … to anon` on `job_purge_media_candidates` | Contract 6a2 fails in `schema_contract.sql` |

### What is deliberately **not** here

- **The purge job itself.** The 30-day PII purge job is unit `008-jobs-operations`'s, and this story's Technical Notes make the contract with it explicit: both halves share `profiles.deleted_at`, and the purge must not run before `deleted_at + 30 days`. The *rule* that decides it lives in the shared package (`isAccountPurgeCandidate`) and in the worklist's SQL predicate; both are covered. The job that runs it is unit 008's.
- **A device-clock correction.** The device's clock is **not** the authority on when the window closes, and the app does not pretend it is. A device whose clock is *ahead* of the server's may show the window as closed early — the server would still have honoured the restore. That is the safe direction to be wrong in. The opposite case (a device *behind*) shows the window as open, and the server's refusal is handled as the real answer: `restoreErrorCopy` believes the server over the screen.


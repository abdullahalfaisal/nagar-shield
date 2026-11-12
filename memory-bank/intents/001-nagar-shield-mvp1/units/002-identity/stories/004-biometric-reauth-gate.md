---
id: 004-biometric-reauth-gate
unit: 002-identity
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 004-biometric-reauth-gate

## User Story

**As a** Nagar Shield user on a device with a fingerprint or face unlock
**I want** to unlock my existing session with a local biometric prompt instead of typing my password every time
**So that** I can reach Home quickly without weakening how my account is secured

## Acceptance Criteria

- [x] **Given** biometric opt-in is enabled and a valid session exists, **When** the app opens, **Then** a biometric prompt appears and a successful match lands the user on Home
- [x] **Given** the biometric prompt, **When** it is shown, **Then** no biometric template, fingerprint image, or biometric-derived material is transmitted to Supabase or stored server-side — the biometric is only a local device unlock of the existing session
- [x] **Given** three consecutive biometric failures, **When** the third failure is recorded, **Then** the identifier + password screen is shown, no lockout screen is reachable, and no credential is locked
- [x] **Given** five biometric failures within a rolling 24-hour window, **When** the fifth failure is recorded, **Then** `profiles.biometric_opt_in` is set to `false` and the next session goes straight to password login
- [x] **Given** the failure counters, **When** an attempt is recorded, **Then** the count is written to the device key-value store **and** mirrored on `profiles.biometric_fail_count` / `profiles.biometric_fail_window_started_at`
- [x] **Given** the app was uninstalled and reinstalled after an auto-disable, **When** the user signs in again, **Then** the biometric preference is still `false` and no biometric prompt is shown
- [x] **Given** a successful biometric match, **When** it is recorded, **Then** the failure counter and the 24-hour window are reset to zero
- [x] **Given** the device has no enrolled biometrics or the hardware is unavailable, **When** the gate evaluates the session, **Then** it degrades to the identifier + password screen without an error state
- [x] **Given** any screen in this story, **When** it renders, **Then** no Google, Facebook, or Apple sign-in control is present and biometric is never offered as an alternative credential (FR-AUTH-6)

## Technical Notes

- **Biometric is a local unlock, never a credential (W-1).** `expo-local-authentication` verifies the match on-device. The fingerprint or face template never leaves the device, is never sent to Supabase, and is never accepted by any Auth endpoint. The gate only unlocks an already-valid session — it is not a sign-in path and creates no session on its own.
- **Failure accounting is two-tiered.** The device key-value store holds the counters for fast, offline evaluation of the 3-fail fallback; `profiles.biometric_fail_count` and `profiles.biometric_fail_window_started_at` mirror them so the **auto-disable survives a reinstall**. The server-side record (`recordBiometricAttempt`) is authoritative for the 24-hour window and the auto-disable write; the local copy is a cache.
- **3 fails → password screen.** At the third consecutive failure the gate routes to the identifier + password screen (the Login screen from `002-dual-identifier-login`). There is **no lockout screen anywhere in the route tree** and no credential is ever disabled. The biometric preference remains enabled at 3 fails — only the 5-in-24h rule turns it off.
- **5 fails / 24 h → auto-disable.** The window is rolling and anchored on `profiles.biometric_fail_window_started_at`; the counter resets on a successful match and the window restarts once 24 hours have elapsed. At the fifth failure inside the window, `profiles.biometric_opt_in` is set to `false`, the local mirror is cleared, and the next session goes straight to password login.
- **The gate is a new surface with no prototype screen.** It reuses the prototype's visual language — the existing token set, the card treatment, and the primary/secondary button styles — and introduces **no new layout system**. It is built from the shared primitives in `apps/mobile/shared/ui`, not from bespoke styling.
- **Opt-in lives in two places.** The account-level flag is `profiles.biometric_opt_in`; the device-level mirror lives in device key-value so a prompt is only attempted on a device with enrolled biometrics. Enabling the toggle is done in the Settings → account section (screen 16).
- **No panic-path cost.** The gate adds no measurable cold-start latency to the panic path; Home → dialer median stays < 12 s (FR-HELP-8, unchanged). The gate is evaluated once on app open, not on every navigation.
- **Settings row placement.** The Settings screen's existing "SMS-এ ও OTP পাঠান" toggle stays **hidden** while `EXPO_PUBLIC_SMS_OTP_ENABLED=false`; the biometric opt-in toggle and the delete-account entry are added to the account section alongside it.
- **i18n is a hard requirement.** All gate copy ships in `bn` (primary) with English alongside. Every interactive control is ≥ 48 × 48 dp with an accessibility label.
- No token, password, phone number, or biometric material is written to app logs.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared`, the typed Supabase client, the `expo-secure-store` session helper, the Expo Router root wrapper for the gate, the shared UI primitives and design tokens, and the i18n bundles
- `supabase/migrations/0001_identity.sql` — the `profiles` columns `biometric_opt_in`, `biometric_fail_count`, `biometric_fail_window_started_at`, and the owner-scoped RLS policy on `profiles`
- `002-dual-identifier-login` — the valid session the gate unlocks and the identifier + password screen it falls back to
- `001-signup-with-email-and-phone` — the `profiles` row whose `biometric_opt_in` column this story toggles

### Enables
- `005-remote-account-disable` — the same session-resume path that evaluates the biometric gate also evaluates `profiles.disabled_at`
- `007-account-deletion-and-recovery` — the Settings account section where the biometric opt-in toggle lives
- Unit `003-help-seek`, `004-capture`, `005-location`, `006-alerts` — the fast resume path that keeps the panic surface one tap away

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The user cancels the system biometric prompt (not a failed match) | Treated as a non-match and counted as a failure; after three, the password screen is shown. No lockout screen appears |
| The device has a fingerprint sensor but no enrolled fingerprint | The gate degrades to the identifier + password screen without an error banner |
| `expo-local-authentication` is unavailable on the device | The gate falls back to password login silently; no crash and no biometric prompt |
| The user fails 4 times, then succeeds on the 5th attempt | The 5th attempt is a success, so the counter and window reset to zero and the preference stays enabled — the auto-disable requires five *failures* inside one window |
| The user fails 5 times spread across two days | The rolling 24-hour window has expired, so the counter restarts and the preference is not disabled |
| The app is killed while the biometric prompt is open | The next open re-evaluates the gate from the persisted counters; no failure is recorded for a prompt that was never answered |
| The user's session expired while the gate was waiting | The gate detects the invalid session and routes to Login; it never attempts to mint a session from a biometric match alone |
| The user reinstalls the app after 2 failures | The local counter is gone, but the mirrored `profiles` counters restore the count, so the 3-fail and 5-fail thresholds still hold across the reinstall |
| The clock on the device moves forward past the 24-hour window | The server-side window governs the auto-disable; the client only mirrors the server's verdict |
| A moderator disables the account while the gate is open | The disabled-account check wins over the biometric prompt; the disable message is shown and no biometric unlock is attempted |

## Out of Scope

- Account creation and the onboarding wizard — `001-signup-with-email-and-phone`
- Identifier resolution, password sign-in, and the 30-day Remember me persistence — `002-dual-identifier-login`
- Password reset by email OTP — `003-email-otp-password-reset`
- Remote account disable handling — `005-remote-account-disable`
- Emergency-contact CRUD — `006-emergency-contacts-crud`
- Account deletion and restore — `007-account-deletion-and-recovery`
- Biometric **enrolment**, **template storage**, and any server-side biometric verification — the biometric is device-local only
- Social login of any kind — FR-AUTH-6
- SMS OTP delivery and the SMS opt-in flow — feature-flagged off (`EXPO_PUBLIC_SMS_OTP_ENABLED=false`), W-2
- The moderator console and the `disable_user` Edge Function — unit 007

import * as LocalAuthentication from 'expo-local-authentication';
import { supabase, secureStore } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

/**
 * The biometric re-auth gate (FR-AUTH-4, FR-AUTH-5).
 *
 * A returning user with a live session should be able to get into the app
 * with a fingerprint instead of a password. The device does the
 * authentication — `expo-local-authentication` — and the app records the
 * outcome server-side so the failure accounting is authoritative and
 * survives a reinstall.
 *
 * **The failure accounting is server-side on purpose.** The thresholds
 * (3 fails → password, 5 fails in 24 h → biometric auto-disabled) live in
 * the `record_biometric_attempt` RPC, not in the app. An app-local counter
 * would be cleared by a reinstall or defeated by editing local storage, so
 * it could not enforce the "5 fails in 24 h" rule the PRD requires. The app
 * renders what the server returns; it does not decide.
 *
 * **A biometric failure never locks the user out.** After 3 failures the RPC
 * answers `fallback: 'password'` and the app shows the password screen. The
 * user can always get in with the password they already have.
 */

export type BiometricFallback = 'password' | null;

export interface BiometricAttemptResult {
  /** How many failures are recorded in the current 24-hour window. */
  failCount: number;
  /** Whether biometric sign-in is still enabled for this account. */
  biometricEnabled: boolean;
  /** `'password'` once the user must fall back to the password screen. */
  fallback: BiometricFallback;
  /** When the 24-hour failure window closes. */
  windowUntil: string | null;
}

/**
 * The outcome of a biometric prompt.
 *
 * There is deliberately no "cancelled" outcome. A dismissed prompt counts
 * as a failed attempt, per the story's edge-case table: the prompt is the
 * only gate between the app and a live session, and a gate that a
 * dismissal walks past for free is not a gate. The counter is about
 * attempts, not about biometric material — and a user who dismisses three
 * times is told to use the password, which is the answer either way.
 *
 * `unavailable` is the one case that does **not** count: the device has no
 * enrolled biometrics, so the user never declined anything.
 */
export type BiometricOutcome = 'success' | 'failed' | 'unavailable';

/**
 * Whether the device can do biometric authentication at all.
 *
 * A device with no enrolled fingerprint or face cannot offer the gate, so
 * the app must not show it — an option that cannot work is worse than no
 * option. The check also covers the hardware being present but the app
 * lacking the `USE_BIOMETRIC` permission.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const supported = await LocalAuthentication.hasHardwareAsync();
    if (!supported) return false;

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

/**
 * The kind of biometric the device offers, for the prompt copy.
 *
 * Returns `'fingerprint'`, `'facial'` or `null` when the device does not
 * say — the caller then uses generic wording.
 */
export async function getBiometricType(): Promise<'fingerprint' | 'facial' | null> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'facial';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'fingerprint';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Runs the device's biometric prompt.
 *
 * Never throws for an ordinary outcome — a dismissed prompt is a result,
 * not an error, and the caller must be able to act on it.
 */
export async function runBiometricPrompt(prompt: string): Promise<BiometricOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      // The gate is a *re*-authentication for an existing session, so the
      // biometric itself is the whole check — a device credential fallback
      // here would silently bypass the thing the user opted into.
      disableDeviceFallback: true,
    });

    if (result.success) {
      return 'success';
    }

    // `not_enrolled` and `not_available` mean the device cannot do this at
    // all — the fallback path is the password screen, not a failure count.
    // The user did not decline anything; the sensor is simply not there.
    if (result.error === 'not_enrolled' || result.error === 'not_available') {
      return 'unavailable';
    }

    // Everything else — a failed match, a dismissal, a system takeover, a
    // device-credential fallback — is a failed attempt. The prompt is the
    // gate, and a gate a dismissal walks past for free is not a gate.
    return 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Records a biometric outcome with the server.
 *
 * The RPC is the authority on the thresholds. It answers with the current
 * failure count, whether biometric sign-in is still enabled, and whether the
 * user must fall back to the password screen.
 *
 * A network failure here is **not** treated as an authentication failure.
 * The user did present a valid fingerprint; the app simply could not tell
 * the server. Counting it against them would punish a connectivity
 * problem, and the alternative — proceeding without recording — is safe
 * because the biometric itself already succeeded.
 */
export async function recordBiometricAttempt(success: boolean): Promise<BiometricAttemptResult> {
  const { data, error } = await supabase.rpc('record_biometric_attempt', {
    p_success: success,
  });

  if (error) throw fromSupabaseError(error);

  const result = (data ?? {}) as {
    fail_count?: number;
    biometric_enabled?: boolean;
    fallback?: string | null;
    window_until?: string | null;
  };

  return {
    failCount: result.fail_count ?? 0,
    biometricEnabled: result.biometric_enabled ?? true,
    fallback: result.fallback === 'password' ? 'password' : null,
    windowUntil: result.window_until ?? null,
  };
}

/**
 * Clears the failure accounting after a successful password sign-in.
 *
 * The user got in the hard way, so the biometric failures that led here
 * should not follow them to the next session.
 */
export async function resetBiometricFailures(): Promise<void> {
  try {
    await recordBiometricAttempt(true);
  } catch {
    // The reset is a convenience. If it fails, the next biometric attempt
    // simply starts the count over.
  }
}

/**
 * The device-side mirror of the failure counters.
 *
 * The story requires the count to live in **both** places: the device
 * key-value store for a fast, offline evaluation, and `profiles` so the
 * auto-disable survives a reinstall.
 *
 * The mirror is a cache, never the authority. The server's window governs
 * the auto-disable — a device whose clock has been moved cannot talk itself
 * out of a disabled preference, because the verdict comes from the RPC.
 * What the mirror buys is a screen that can render the attempt count
 * immediately, without waiting for a network round-trip, and it lets the
 * gate degrade to the password screen when the server cannot be reached.
 */

const FAIL_COUNT_KEY = 'nagar-shield.biometric-fail-count';
const FAIL_WINDOW_KEY = 'nagar-shield.biometric-fail-until';

export interface LocalBiometricState {
  failCount: number;
  /** When the current 24-hour window closes. */
  windowUntil: string | null;
}

/**
 * Writes the mirror after an attempt is recorded.
 *
 * Called with the server's answer, never with a locally computed count —
 * the two would drift, and the server's is the one that decides.
 */
export async function mirrorBiometricState(result: BiometricAttemptResult): Promise<void> {
  try {
    await secureStore.setItem(FAIL_COUNT_KEY, String(result.failCount));
    if (result.windowUntil) {
      await secureStore.setItem(FAIL_WINDOW_KEY, result.windowUntil);
    } else {
      await secureStore.removeItem(FAIL_WINDOW_KEY);
    }
  } catch {
    // The mirror is a cache. A failed write only costs the app its
    // offline rendering, never the enforcement.
  }
}

/**
 * Reads the mirror.
 *
 * A count whose window has closed is reported as zero — the 24 hours have
 * passed, so the failures are history.
 */
export async function readLocalBiometricState(): Promise<LocalBiometricState> {
  try {
    const rawCount = await secureStore.getItem(FAIL_COUNT_KEY);
    const rawWindow = await secureStore.getItem(FAIL_WINDOW_KEY);

    const failCount = Number.parseInt(rawCount ?? '0', 10);
    if (!Number.isFinite(failCount) || failCount <= 0) {
      return { failCount: 0, windowUntil: null };
    }

    if (rawWindow && new Date(rawWindow).getTime() <= Date.now()) {
      // The window closed. The failures no longer count.
      return { failCount: 0, windowUntil: null };
    }

    return { failCount, windowUntil: rawWindow };
  } catch {
    return { failCount: 0, windowUntil: null };
  }
}

/**
 * Clears the mirror.
 *
 * A successful match resets the counter and the window, on the device as
 * well as on the server.
 */
export async function clearLocalBiometricState(): Promise<void> {
  try {
    await secureStore.removeItem(FAIL_COUNT_KEY);
    await secureStore.removeItem(FAIL_WINDOW_KEY);
  } catch {
    // Nothing to do.
  }
}

import { useCallback, useEffect, useState } from 'react'
import { supabase, secureStore } from '@/shared/api/supabase'
import { isBiometricAvailable } from '@/shared/auth/biometricService'

/**
 * Decides whether a returning session must pass the biometric gate.
 *
 * Four things must all hold before the gate is offered:
 *
 *   1. there is a session;
 *   2. the account has `biometric_opt_in` set — the user opted in, and it
 *      has not been auto-disabled by the failure accounting;
 *   3. the device can actually do biometric authentication;
 *   4. this is a **returning** session — the app was opened with a
 *      persisted session, not one the user just created by signing in.
 *
 * The third check matters. A user who opted in on a phone with a
 * fingerprint reader, then replaced it with a phone that has none, must not
 * be stuck behind a prompt that can never succeed — the gate would be an
 * unopenable door. When the device cannot do it, the app goes straight to
 * the password screen.
 *
 * The fourth check is what separates the gate from theatre. A user who
 * just typed their password has already proven who they are; asking for a
 * fingerprint immediately afterwards proves nothing extra. The gate is for
 * the *returning* launch — the app was closed and is opened again.
 *
 * **The provenance is a stored flag, not a runtime one.** "Returning" means
 * returning across an app restart, so the fact that the last sign-in was
 * a password has to outlive the process. It is written to SecureStore on
 * password sign-in and **cleared when the app is backgrounded**, so a
 * later foreground is treated as a returning session again.
 */

export type BiometricGateState = 'checking' | 'required' | 'not-required'

export interface BiometricGate {
  state: BiometricGateState
  refresh: () => Promise<void>
}

/**
 * Watches the signed-in user's biometric preference.
 *
 * `userId` is `undefined` while signed out, and the gate is then not
 * required — there is nothing to re-authenticate.
 */
export function useBiometricGate(userId: string | undefined): BiometricGate {
  const [state, setState] = useState<BiometricGateState>('checking')

  const refresh = useCallback(async () => {
    if (!userId) {
      setState('not-required')
      return
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('biometric_opt_in')
        .eq('id', userId)
        .maybeSingle()

      if (!data?.biometric_opt_in) {
        setState('not-required')
        return
      }

      const available = await isBiometricAvailable()
      if (!available) {
        setState('not-required')
        return
      }

      // The user just signed in with a password — no gate for this launch.
      if (await wasSignedInWithPassword()) {
        setState('not-required')
        return
      }

      // The gate was already passed in this foreground — asking again
      // would loop the user back onto the prompt they just satisfied.
      if (await wasGatePassed()) {
        setState('not-required')
        return
      }

      setState('required')
    } catch {
      // The preference could not be read. Offering the gate on a guess
      // would put a fingerprint prompt in front of a user who never asked
      // for one; skipping it would let an opted-in user in without the
      // check they wanted. Neither is safe, so the app falls back to the
      // password screen — the strictly-more-secure of the two.
      setState('not-required')
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { state, refresh }
}

/**
 * The flag that records "the current session was opened with a password".
 *
 * It is set when the user signs in with a password and cleared when the app
 * goes to the background, so the next foreground counts as a returning
 * session — which is the case the biometric gate is for.
 */
const PASSWORD_SESSION_KEY = 'nagar-shield.password-session'
const GATE_PASSED_KEY = 'nagar-shield.gate-passed'

export async function markPasswordSignIn(): Promise<void> {
  try {
    await secureStore.setItem(PASSWORD_SESSION_KEY, '1')
  } catch {
    // If the flag cannot be written, the gate is offered on the next
    // foreground — which is the safe direction.
  }
}

export async function clearPasswordSignIn(): Promise<void> {
  try {
    await secureStore.removeItem(PASSWORD_SESSION_KEY)
  } catch {
    // Nothing to do.
  }
}

export async function wasSignedInWithPassword(): Promise<boolean> {
  try {
    return (await secureStore.getItem(PASSWORD_SESSION_KEY)) === '1'
  } catch {
    return false
  }
}

/**
 * Records that the biometric gate was passed.
 *
 * Without this the gate would be re-armed the instant the user gets in:
 * the app group layout reads the gate state, sees the account is opted in,
 * and redirects straight back to the prompt. The user would have to
 * fingerprint their way in, in a loop.
 *
 * The flag is cleared when the app is backgrounded, alongside the password
 * flag, so the next foreground is gated again.
 */
export async function markGatePassed(): Promise<void> {
  try {
    await secureStore.setItem(GATE_PASSED_KEY, '1')
  } catch {
    // If the flag cannot be written the gate may re-arm. That is a
    // nuisance, not a lockout — the fingerprint still works.
  }
}

export async function wasGatePassed(): Promise<boolean> {
  try {
    return (await secureStore.getItem(GATE_PASSED_KEY)) === '1'
  } catch {
    return false
  }
}

export async function clearGatePassed(): Promise<void> {
  try {
    await secureStore.removeItem(GATE_PASSED_KEY)
  } catch {
    // Nothing to do.
  }
}

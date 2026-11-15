import {
  clearSessionPersistencePolicy,
  setSessionPersistencePolicy,
  windowForRememberMe,
} from '@/shared/api/session-storage'
import { clearLocalBiometricState, resetBiometricFailures } from '@/shared/auth/biometricService'
import { markPasswordSignIn } from '@/shared/auth/useBiometricGate'

export interface CompletePasswordSignInOptions {
  /**
   * The user's "Remember me" choice: the 30-day window when `true`, the
   * 24-hour grace window when `false`.
   *
   * Only the login screen asks. Sign-up and the password reset have no such
   * switch, so they pass `false`: a session the user did not ask to keep gets
   * the shorter window, and the longer one stays something the user chooses.
   * Before this, those two flows set no window at all, and their sessions
   * never expired on the device.
   */
  rememberMe: boolean
}

/**
 * The one "finish sign-in" step for every flow where the user types a
 * password and ends up with a session: login, sign-up and the password reset.
 *
 * It does two jobs that each flow used to do (or forget) on its own:
 *
 *   1. **The session window is recorded before the session exists.**
 *      `supabase-js` writes the session to the store as part of creating it
 *      (`signInWithPassword`, `signUp`, `setSession` all end in
 *      `_saveSession`), and the store judges a session by the policy in force
 *      at that first write. So the policy is set, *then* `createSession`
 *      runs. If it throws, no session was created and the policy is cleared,
 *      so it cannot govern the next session instead.
 *   2. **The password counts as the proof the biometric gate asks for.** The
 *      session is marked as password-verified, so an opted-in user is not
 *      asked for a fingerprint straight after typing a password, and the
 *      biometric failure count is cleared on the server and on the device,
 *      so failures that led to the password do not follow the user. Only
 *      login did this before; a user who reset their password was sent from
 *      the new-password screen straight to the fingerprint prompt.
 *
 * `createSession` must throw when it did not produce a session (a
 * `supabase-js` call that returns `{ error }` has to be turned into a throw),
 * so the biometric step never runs for a sign-in that failed.
 *
 * `logIn` records the same policy itself, because it is also used on its own
 * and its tests pin that order. Recording it twice writes the same window.
 */
export async function completePasswordSignIn<T>(
  { rememberMe }: CompletePasswordSignInOptions,
  createSession: () => Promise<T>,
): Promise<T> {
  setSessionPersistencePolicy({
    remembered: rememberMe,
    windowMs: windowForRememberMe(rememberMe),
    persistedAt: Date.now(),
  })

  let result: T
  try {
    result = await createSession()
  } catch (error) {
    clearSessionPersistencePolicy()
    throw error
  }

  // Each of these swallows its own failure: the user is signed in either
  // way, and a flag that could not be written only means the gate may ask
  // once more — the safe direction.
  await markPasswordSignIn()
  await resetBiometricFailures()
  await clearLocalBiometricState()

  return result
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { supabase, secureStore } from '@/shared/api/supabase'
import {
  isBiometricAvailable,
  mirrorBiometricOptIn,
  readBiometricOptInMirror,
} from '@/shared/auth/biometricService'

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
 * the password screen (`password-required`). It used to open the app
 * instead, which meant removing the enrolled fingerprints in the phone's
 * settings was enough to walk past the lock.
 *
 * The fourth check is what separates the gate from theatre. A user who
 * just typed their password has already proven who they are; asking for a
 * fingerprint immediately afterwards proves nothing extra. The gate is for
 * the *returning* launch — the app was closed and is opened again, or it was
 * left in the background long enough to count as left (see
 * `REARM_AFTER_BACKGROUND_MS`).
 *
 * **The provenance is a stored flag, not a runtime one.** "Returning" means
 * returning across an app restart, so the fact that the last sign-in was
 * a password has to outlive the process. It is written to SecureStore on
 * password sign-in and **cleared when the app is backgrounded**, so a
 * later foreground is treated as a returning session again.
 *
 * **The opt-in is read from the device first.** The server is asked too, but
 * the answer it gave last time is mirrored in SecureStore, so a launch with
 * no network still knows whether the lock applies. See `evaluateGate` for the
 * order and for what happens when neither answer exists.
 */

/**
 * `checking` — not decided yet; nothing protected may render.
 * `required` — the fingerprint prompt must be passed first.
 * `password-required` — the lock applies (or may apply) but the fingerprint
 *   cannot be used, so the password screen is the way in.
 * `not-required` — the app may open.
 */
export type BiometricGateState = 'checking' | 'required' | 'password-required' | 'not-required'

type DecidedGateState = Exclude<BiometricGateState, 'checking'>

export interface BiometricGate {
  state: BiometricGateState
  refresh: () => Promise<void>
}

/**
 * How long the app must have been in the background before coming back
 * re-arms the gate.
 *
 * Re-arming on every return would not work. Several things the app does
 * itself send it to the background for a moment: a runtime permission
 * dialog, the share sheet, the camera for a photo or a capped 30-second
 * video, and on some Android devices the biometric prompt itself. A lock
 * that fired on each of those would throw the user out of the screen they
 * were using — mid-capture, losing the evidence — and right after a
 * successful fingerprint it could put the prompt straight back up, in a
 * loop.
 *
 * Only a real background counts (`inactive`, which the iOS system prompt and
 * the notification shade cause, never re-arms), and only once it has lasted
 * a minute. A minute covers the app's own round trips — a 30-second video
 * plus its review screen — and anything longer is the user having left. The
 * stored "gate passed" and "password sign-in" flags are still cleared on
 * every background, so a process that dies while backgrounded is gated on its
 * next launch however short the background was.
 */
export const REARM_AFTER_BACKGROUND_MS = 60_000

/**
 * The longest a launch waits for the server's opt-in answer when there is no
 * stored one to decide from. A slow network must not hold the splash screen
 * forever; past this the answer counts as unavailable.
 */
export const OPT_IN_READ_TIMEOUT_MS = 4_000

export interface GateInputs {
  signedInWithPassword: boolean
  gatePassed: boolean
  /** `null` when neither the server nor the device mirror could answer. */
  optIn: boolean | null
  biometricAvailable: boolean
}

/**
 * The gate's rule, with every input already read.
 *
 * An unknown opt-in is the case the old code got backwards: it treated a
 * failed read as "not opted in" and opened the app. It now fails closed to
 * the password screen, which always works when the network does — and when
 * the network does not, the stored mirror normally answers first.
 */
export function decideGate(inputs: GateInputs): DecidedGateState {
  // A password typed in this foreground, or a fingerprint already passed in
  // it, is the proof the gate asks for. Asking again would loop the user
  // back onto the prompt they just satisfied.
  if (inputs.signedInWithPassword || inputs.gatePassed) return 'not-required'
  if (inputs.optIn === null) return 'password-required'
  if (!inputs.optIn) return 'not-required'
  return inputs.biometricAvailable ? 'required' : 'password-required'
}

/**
 * Follows the app's foreground state and says when the gate must re-arm.
 *
 * `backgroundedAt` is the moment the app last went to the background, or
 * `null`. The first background of a run is kept, so a repeated `background`
 * event does not restart the clock. A clock that went backwards (the user
 * changed the time while away) re-arms: an elapsed time that cannot be
 * trusted is not a reason to skip the lock.
 */
export function trackAppState(
  backgroundedAt: number | null,
  next: AppStateStatus,
  now: number,
): { backgroundedAt: number | null; rearm: boolean } {
  if (next === 'background') {
    return { backgroundedAt: backgroundedAt ?? now, rearm: false }
  }

  if (next === 'active') {
    if (backgroundedAt === null) return { backgroundedAt: null, rearm: false }
    const away = now - backgroundedAt
    return { backgroundedAt: null, rearm: away < 0 || away >= REARM_AFTER_BACKGROUND_MS }
  }

  // `inactive` (and anything else) is a transition, not a departure.
  return { backgroundedAt, rearm: false }
}

/**
 * The server's opt-in for `userId`, or `null` when it cannot be had.
 *
 * `supabase-js` reports a failed query by returning `{ error }`, not by
 * throwing — so the old `try/catch` never saw it, `data` was `null`, and
 * `!data?.biometric_opt_in` opened the app. Every way of not getting a
 * boolean (an error, a missing row, a timeout, a throw) is `null` here.
 */
async function readServerOptIn(userId: string): Promise<boolean | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), OPT_IN_READ_TIMEOUT_MS)
  })

  const read = (async (): Promise<boolean | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('biometric_opt_in')
        .eq('id', userId)
        .maybeSingle()

      if (error || !data || typeof data.biometric_opt_in !== 'boolean') return null
      return data.biometric_opt_in
    } catch {
      return null
    }
  })()

  try {
    return await Promise.race([read, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface GateEvaluation {
  state: DecidedGateState
  /** The opt-in the decision was made from (`null` = unknown). */
  optIn: boolean | null
  /**
   * A later decision, once the server has answered, when it differs from
   * `state`; `null` otherwise. Present so a launch that decided from the
   * stored mirror still picks up an opt-in changed on another device.
   */
  revised: Promise<{ state: DecidedGateState; optIn: boolean } | null>
}

/**
 * Reads everything the gate needs and decides.
 *
 * The order is what keeps the lock both fast and closed:
 *
 *   1. The two grace flags and the stored opt-in are local reads, and when
 *      they are enough to decide, the decision is made from them at once.
 *      A user who is not opted in reaches Home without waiting for the
 *      network, and an opted-in user is locked even with no network at all.
 *      The server is still asked, in the background, to refresh the mirror.
 *   2. Only when there is no stored opt-in for this account (the first
 *      launch on a build that keeps one, or the first after another account
 *      used the phone) does the launch wait for the server, for at most
 *      `OPT_IN_READ_TIMEOUT_MS`.
 *   3. If the server cannot answer either, the opt-in is unknown and the gate
 *      sends the user to the password screen. The one exception is a session
 *      the user has just created with a password: the grace flag already
 *      lets them in, so a failed read right after signing in does not bounce
 *      them back to the screen they came from — the lock has nothing to add
 *      to the password they just typed. The next foreground asks again.
 */
export async function evaluateGate(userId: string): Promise<GateEvaluation> {
  const [signedInWithPassword, gatePassed, stored] = await Promise.all([
    wasSignedInWithPassword(),
    wasGatePassed(),
    readBiometricOptInMirror(userId),
  ])

  const decide = async (optIn: boolean | null): Promise<DecidedGateState> => {
    const needsDevice = optIn === true && !signedInWithPassword && !gatePassed
    return decideGate({
      signedInWithPassword,
      gatePassed,
      optIn,
      biometricAvailable: needsDevice ? await isBiometricAvailable() : false,
    })
  }

  if (signedInWithPassword || gatePassed || stored !== null) {
    const state = await decide(stored)
    const revised = (async () => {
      const server = await readServerOptIn(userId)
      if (server === null) return null
      await mirrorBiometricOptIn(userId, server)
      if (server === stored) return null
      const next = await decide(server)
      return next === state ? null : { state: next, optIn: server }
    })()
    return { state, optIn: stored, revised }
  }

  const server = await readServerOptIn(userId)
  if (server !== null) await mirrorBiometricOptIn(userId, server)
  return { state: await decide(server), optIn: server, revised: Promise.resolve(null) }
}

/**
 * Watches the signed-in user's biometric preference.
 *
 * `userId` is `undefined` while signed out, and the gate is then not
 * required — there is nothing to re-authenticate.
 *
 * The state is `checking` until a decision exists **for this user id**. A
 * decision is stored with the id it was made for, so switching accounts can
 * never show the previous account's `not-required` for a render.
 */
export function useBiometricGate(userId: string | undefined): BiometricGate {
  const [decided, setDecided] = useState<{
    userId: string | undefined
    state: BiometricGateState
  } | null>(null)

  // Each evaluation takes a number; a slower, older one finishing late must
  // not overwrite a newer decision (a re-arm racing the launch check).
  const generation = useRef(0)

  // The opt-in the last decision was made from. A re-arm hides the app
  // behind the splash only when the user may be opted in — someone who is
  // not opted in comes back to their screen with no flash.
  const lastOptIn = useRef<boolean | null>(null)

  const refresh = useCallback(async () => {
    const run = ++generation.current

    if (!userId) {
      setDecided({ userId, state: 'not-required' })
      return
    }

    try {
      const evaluation = await evaluateGate(userId)
      if (run !== generation.current) return
      lastOptIn.current = evaluation.optIn
      setDecided({ userId, state: evaluation.state })

      const revised = await evaluation.revised
      if (revised && run === generation.current) {
        lastOptIn.current = revised.optIn
        setDecided({ userId, state: revised.state })
      }
    } catch {
      // Every read above already turns its own failure into a value, so this
      // is a bug rather than a network fault. It still fails closed.
      if (run === generation.current) setDecided({ userId, state: 'password-required' })
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Returning to the app re-arms the gate. The decision used to be made only
  // when the user id changed, so reopening the app from the recent-apps list
  // (same process, same user) skipped the lock entirely.
  useEffect(() => {
    let backgroundedAt: number | null = null
    let clearing: Promise<unknown> = Promise.resolve()

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      // Leaving the foreground ends the "signed in with a password" grace and
      // the "gate already passed" grace, whatever happens next. A process
      // killed in the background is then gated on its next launch.
      if (next !== 'active') {
        clearing = Promise.all([clearPasswordSignIn(), clearGatePassed()])
      }

      const step = trackAppState(backgroundedAt, next, Date.now())
      backgroundedAt = step.backgroundedAt
      if (!step.rearm) return

      if (lastOptIn.current !== false) setDecided({ userId, state: 'checking' })
      // The flags must be gone before the gate reads them, or the grace
      // being cleared could still be read as present.
      void clearing.then(refresh)
    })

    return () => {
      subscription.remove()
    }
  }, [refresh, userId])

  const state: BiometricGateState =
    decided && decided.userId === userId ? decided.state : 'checking'

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

import * as Battery from 'expo-battery'
import * as Network from 'expo-network'

/**
 * The degraded-mode signals.
 *
 * Story `003-help-seek / 004-graceful-degradation`. The dial path must keep
 * working when the device cannot help it — location off, battery saver on, no
 * signal — and it must say plainly what to do instead.
 *
 * Two rules shape this file:
 *
 *   1. **The dial path makes zero network requests.** Every signal here is
 *      read from the OS, never from the server. A citizen whose phone has no
 *      signal still reaches help, and the app must not depend on a round trip
 *      to tell them so.
 *   2. **A missing signal is not a negative signal.** When the app cannot read
 *      the device state, it says so rather than pretending the state is known.
 *      A silent no-op is the failure mode the story names explicitly.
 *
 * ## FR-PERMS-3 — the battery-saver capability
 *
 * `expo-battery` **does** read Android power-save mode:
 * `Battery.isLowPowerModeEnabledAsync()` maps to `PowerManager.isPowerSaveMode`.
 * An earlier build shipped this module with the capability hard-wired to
 * `'unavailable'` — the premise was that no first-class Expo API exposed it —
 * and the always-`'unknown'` reading made `powerSaveWarningIsUseful` true for
 * **every** user, so the battery-saver line appeared after every dial attempt
 * and read as a false "battery saver is on" prompt. The capability is real:
 * the constant below is `'available'`, the read is live, and the warning only
 * renders when the mode is actually on — or when the read itself fails, which
 * the copy still covers ("…or this phone does not let the app check").
 */

/**
 * Whether the app can detect Android power-save mode.
 *
 * `'available'`: `expo-battery` ships the read, and the app calls it. The
 * `'unavailable'` member stays in the vocabulary so a future build that loses
 * the module (or a platform where the read throws, such as web) can express
 * the degraded state without a new concept.
 */
export type PowerSaveCapability = 'available' | 'unavailable'

/**
 * The power-save detection capability of **this** build.
 *
 * Kept as a constant rather than a runtime probe so that the capability is
 * visible in one place and in one grep. A reviewer who wants to know whether
 * the battery warning is live reads this line.
 */
export const BATTERY_SAVER_DETECTION: PowerSaveCapability = 'available'

/**
 * Whether power saving is on.
 *
 * `'unknown'` when the capability is unavailable or the read failed. The
 * warning renders on `'unknown'` too — see `powerSaveWarningIsUseful`.
 */
export type PowerSaveState = 'on' | 'off' | 'unknown'

/** The degraded-mode signals, as one snapshot. */
export interface DegradedState {
  /** Whether the app can detect power-save mode on this build. */
  powerSaveCapability: PowerSaveCapability
  /** Whether power saving is on. `'unknown'` when it cannot be read. */
  powerSave: PowerSaveState
  /** Whether the device has a usable network connection. */
  isOffline: boolean
  /** Whether the location permission is denied. */
  isLocationDenied: boolean
}

/**
 * The state the app assumes when it cannot read the device state.
 *
 * `isOffline: false` because an unknown network state must not make the app
 * claim a degraded mode it cannot substantiate. `isLocationDenied: false` for
 * the same reason — the story asks for the *location-denied* guidance, not
 * the *location-unknown* guidance, and the app does not prompt for location
 * on the dial path, so it never learns the answer there.
 */
export const UNKNOWN_DEGRADED_STATE: DegradedState = {
  powerSaveCapability: BATTERY_SAVER_DETECTION,
  powerSave: 'unknown',
  isOffline: false,
  isLocationDenied: false,
}

/**
 * Whether the battery-saver warning should be shown at all.
 *
 * The warning is a **warning, not a guarantee**. It says the dialer *may* be
 * suppressed — never that it was, and never that a call happened. So it is
 * worth showing whenever the state is known and on, and it is worth showing
 * when the state is unknown, because "we cannot tell you whether power saving
 * is on, so dial the number yourself" is still true and still useful.
 *
 * What it is **not** worth showing is when power saving is known to be off.
 * Then the warning would be noise.
 */
export function powerSaveWarningIsUseful(state: DegradedState): boolean {
  return state.powerSave !== 'off'
}

/**
 * Whether the manual-dial guidance should be shown.
 *
 * The guidance is needed whenever the dialer may not have opened:
 *
 *   * the dialer intent did not resolve (the OS has no `tel:` handler, or the
 *     user disabled the dialler app);
 *   * the device is offline — the OS dialler still opens, but a phone with no
 *     signal cannot place a call, so the number must be in front of the user;
 *   * power saving is on or unknown — the dialer may be suppressed.
 *
 * It is **not** needed merely because location is denied: the dial path never
 * needed a location fix, so a denied location does not stop the dialer. The
 * story asks for the *manual-dial guidance* on a denied location, and it is
 * shown — but it is shown because the help action completes and the user is
 * told the number to dial, which is the guidance the story names.
 */
export function needsManualDialGuidance(state: DegradedState, dialerOpened: boolean): boolean {
  if (!dialerOpened) return true
  return state.isOffline || powerSaveWarningIsUseful(state)
}

/**
 * Reads the power-save mode.
 *
 * Reads the real OS state through `expo-battery` (`PowerManager.isPowerSaveMode`
 * on Android). It returns `'unknown'` whenever the read **fails** — on a
 * platform without the module, or when the native side throws. It never
 * returns `'off'` for a failed read: "we could not read the state" is not the
 * same as "power saving is off", and treating them as the same would suppress
 * a warning the user needs.
 */
export async function readPowerSaveState(): Promise<PowerSaveState> {
  try {
    return (await Battery.isLowPowerModeEnabledAsync()) ? 'on' : 'off'
  } catch (error) {
    // A failed read is honest — `'unknown'` — but never silent in dev: the
    // Metro log says exactly why, so "this phone does not let the app check"
    // in the UI can be checked against a cause.
    if (__DEV__) console.warn('[degradation] power-save read failed', error)
    return 'unknown'
  }
}

/**
 * Reads whether the device is offline.
 *
 * A failed read resolves to `false` — the app does not claim a degraded mode
 * it cannot substantiate. The dialer still opens either way; the offline
 * guidance is an addition, not a gate.
 */
export async function readIsOffline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync()
    return state?.isInternetReachable === false || state?.isConnected === false
  } catch {
    return false
  }
}

/**
 * Reads the whole degraded state.
 *
 * The reads run together — the help action needs the whole picture before it
 * renders its guidance, and a screen that rendered with half the answer would
 * briefly show a warning it then had to take away.
 */
export async function readDegradedState(): Promise<DegradedState> {
  const [powerSave, isOffline] = await Promise.all([readPowerSaveState(), readIsOffline()])
  return {
    powerSaveCapability: BATTERY_SAVER_DETECTION,
    powerSave,
    isOffline,
    isLocationDenied: false,
  }
}

/**
 * The manual-dial guidance for a number.
 *
 * The number appears in **both** Bangla numerals and ASCII digits, so the
 * user can read it and dial it from the keypad without the app. The two
 * renderings are separated by a middot so the user is never in doubt which
 * digits to press.
 */
export function manualDialGuidance(number: string): {
  ascii: string
  bengali: string
  combined: string
} {
  const ascii = number.replace(/[^\d+]/g, '')
  const bengali = ascii.replace(/[0-9]/g, (digit) => {
    const bengaliDigits = '০১২৩৪৫৬৭৮৯'
    return bengaliDigits[Number(digit)] ?? digit
  })
  return { ascii, bengali, combined: `${bengali} · ${ascii}` }
}

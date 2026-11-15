import * as Location from 'expo-location'
import { toPermissionState, type PermissionState } from './permissions'
import { currentPositionWithin } from './positionWithin'

/**
 * The Location Sharing fix — taken **just-in-time**.
 *
 * The Location Sharing screen must **not prompt** when it opens. The
 * permission dialog fires at the moment the user asks for it — the share CTA
 * or the "use my location" button — and nothing before that (FR-PERMS-1). A
 * screen that prompts on mount teaches users that the app asks for things
 * before they have asked for anything.
 *
 * So the prompting fix is a **function**, not a hook, and the screen calls it
 * only from those taps. When the permission was already granted there is
 * nothing to ask, so `takeSilentLocationFix` may run on open to show the
 * user's position in the map preview; it never prompts.
 *
 * The failure modes are all **normal outcomes**, not errors:
 *
 *   * the permission is denied → the caller offers the two fallbacks
 *     (manual coordinate entry and share-without-location);
 *   * the provider is off or the fix times out → the caller offers the same
 *     two fallbacks.
 *
 * The share is never blocked waiting on the fix.
 */

/** The outcome of a just-in-time fix attempt. */
export type FixOutcome =
  /** The fix was taken. */
  | {
      status: 'ready'
      lat: number
      lng: number
      accuracyM: number | null
      /** When the position was measured (ms since epoch), if the source says. */
      takenAt?: number
    }
  /** The user has not granted location access. */
  | { status: 'denied'; permission: PermissionState }
  /** The permission was never determined — the prompt was refused or dismissed. */
  | { status: 'undetermined'; permission: PermissionState }
  /** The provider is off, or the fix timed out. */
  | { status: 'unavailable' }

/**
 * Requests the permission and takes the fix — in that order, and only when
 * the caller asks.
 *
 * The permission is requested **just-in-time**, immediately before the fix
 * is taken, so the dialog appears at the moment the user asked for the
 * share rather than when the screen opened.
 */
export async function takeLocationFix(): Promise<FixOutcome> {
  let permission: PermissionState

  try {
    const response = await Location.requestForegroundPermissionsAsync()
    permission = toPermissionState(response.status)
  } catch {
    // A failed permission query is a denied permission, not a crash. The
    // screen degrades.
    return { status: 'denied', permission: 'denied' }
  }

  if (permission === 'denied') {
    return { status: 'denied', permission }
  }

  if (permission !== 'granted') {
    // The prompt was shown and the user did not grant it — either they
    // refused or they dismissed it. Either way there is no fix.
    return { status: 'undetermined', permission }
  }

  try {
    const position = await currentPositionWithin({
      accuracy: Location.Accuracy.Balanced,
    })

    return {
      status: 'ready',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
    }
  } catch {
    // The provider is disabled, or the fix timed out. The user is offered
    // the manual path; the share is never blocked.
    return { status: 'unavailable' }
  }
}

/**
 * Takes the fix **only if the permission is already granted** — it never
 * prompts. For showing the user's position as soon as the screen opens, when
 * they have already said yes; otherwise the outcome is `denied` or
 * `undetermined` and the caller leaves the prompt to a tap.
 */
export async function takeSilentLocationFix(): Promise<FixOutcome> {
  let permission: PermissionState

  try {
    // `get`, not `request`: this reads the current state and never shows a dialog.
    const response = await Location.getForegroundPermissionsAsync()
    permission = toPermissionState(response.status)
  } catch {
    return { status: 'denied', permission: 'denied' }
  }

  if (permission === 'denied') return { status: 'denied', permission }
  if (permission !== 'granted') return { status: 'undetermined', permission }

  try {
    const position = await currentPositionWithin({
      accuracy: Location.Accuracy.Balanced,
    })

    return {
      status: 'ready',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
    }
  } catch {
    return { status: 'unavailable' }
  }
}

/** The oldest last-known position that is still worth showing: five minutes. */
export const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000

/**
 * The phone's last known position — **instant**, and it never prompts.
 *
 * A brand-new GPS reading can take 10 – 30 seconds on a cold start, which is a
 * long time to look at an empty map. The phone almost always holds a recent
 * position already, so the screen shows this first and refines it with a fresh
 * fix afterwards. The position carries the time it was measured, so a share
 * made later can tell that it is old and retake it.
 */
export async function takeLastKnownFix(
  maxAgeMs: number = LAST_KNOWN_MAX_AGE_MS,
): Promise<FixOutcome> {
  let permission: PermissionState

  try {
    const response = await Location.getForegroundPermissionsAsync()
    permission = toPermissionState(response.status)
  } catch {
    return { status: 'denied', permission: 'denied' }
  }

  if (permission === 'denied') return { status: 'denied', permission }
  if (permission !== 'granted') return { status: 'undetermined', permission }

  try {
    const position = await Location.getLastKnownPositionAsync({
      maxAge: maxAgeMs,
      // A position this coarse would put the pin in the wrong neighbourhood.
      requiredAccuracy: 500,
    })

    if (!position) return { status: 'unavailable' }

    return {
      status: 'ready',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
      takenAt: position.timestamp,
    }
  } catch {
    return { status: 'unavailable' }
  }
}

/** How long a share waits for a fresh fix before it uses the last one. */
export const FIX_REFRESH_TIMEOUT_MS = 4_000

/**
 * Waits for a fresh fix, but only for `timeoutMs`; past that the share uses
 * `fallback` (the last known position) instead.
 *
 * Indoors a GPS reading can take far longer than a person in trouble will
 * wait, and `getCurrentPositionAsync` has no timeout of its own. The first
 * of the two to finish wins and the loser is ignored, so a fix that lands
 * after the timeout cannot change a result already used. The timer is always
 * cleared.
 */
export async function raceFixAgainstTimeout<
  T extends { lat: number | null; lng: number | null; accuracyM: number | null },
>(
  refresh: Promise<FixOutcome>,
  fallback: T | null,
  timeoutMs: number = FIX_REFRESH_TIMEOUT_MS,
): Promise<{
  position: T | { lat: number; lng: number; accuracyM: number | null } | null
  timedOut: boolean
}> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })

  try {
    const first = await Promise.race([refresh, timeout])

    if (first === 'timeout') return { position: fallback, timedOut: true }

    // A refusal or a failed fix keeps the earlier position; it is better than none.
    if (first.status === 'ready') {
      return {
        position: { lat: first.lat, lng: first.lng, accuracyM: first.accuracyM },
        timedOut: false,
      }
    }

    return { position: fallback, timedOut: false }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Validates a manually entered coordinate pair.
 *
 * A manual entry has **no fix accuracy**, so the returned accuracy is
 * `null` — never `0`, and never an estimate. There is no honest accuracy to
 * report for a pair of typed numbers, and a fabricated number is worse than
 * none.
 *
 * The validation is strict on purpose: a latitude outside ±90 or a
 * longitude outside ±180 is rejected rather than clamped, because a clamped
 * coordinate is a different place and the user would not know it moved.
 */
export function parseManualCoordinates(
  latText: string,
  lngText: string,
):
  | { ok: true; lat: number; lng: number; accuracyM: null; outsideBangladesh: boolean }
  | { ok: false; field: 'lat' | 'lng' } {
  const lat = parseCoordinate(latText)
  const lng = parseCoordinate(lngText)

  // The failing field is named so the screen can show the message under it.
  if (lat === null || lat < -90 || lat > 90) return { ok: false, field: 'lat' }
  if (lng === null || lng < -180 || lng > 180) return { ok: false, field: 'lng' }

  // A coordinate of `0` is a real coordinate — the equator and the prime
  // meridian — and is never treated as absent.
  return { ok: true, lat, lng, accuracyM: null, outsideBangladesh: !isInsideBangladesh(lat, lng) }
}

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯'

/**
 * Reads one typed coordinate, or `null` when it is not a number.
 *
 * A Bangla keyboard types `২৩.৭৮`, and a comma is the decimal mark in many
 * locales; both name a real place, so both are read instead of rejected with a
 * "range" message. `Number()` alone would also accept `0x10` and `1e2`, so the
 * text is matched against a plain decimal first.
 */
function parseCoordinate(text: string): number | null {
  const normalised = text
    .trim()
    .replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)))
    .replace(',', '.')

  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalised)) return null

  return Number(normalised)
}

/**
 * A rough bounding box around Bangladesh. It only drives a warning — a point
 * outside it is still accepted — so a coarse box is the honest tool.
 */
export function isInsideBangladesh(lat: number, lng: number): boolean {
  const BOUNDS = { latMin: 20.5, latMax: 26.7, lngMin: 88, lngMax: 92.8 }
  const clampedLat = Math.min(Math.max(lat, BOUNDS.latMin), BOUNDS.latMax)
  const clampedLng = Math.min(Math.max(lng, BOUNDS.lngMin), BOUNDS.lngMax)
  return clampedLat === lat && clampedLng === lng
}

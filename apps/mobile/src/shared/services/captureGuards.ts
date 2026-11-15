import type { PermissionState } from './permissions'

/**
 * Small decisions the Capture screen makes, kept out of the component so each
 * one can be tested without rendering it.
 */

/** What the citizen has entered on the form so far. */
export interface CaptureInput {
  hasMedia: boolean
  description: string
  placeDetail: string
  category: string | null
  areaId: string | null
}

/**
 * Whether leaving the screen would throw something away.
 *
 * Whitespace alone is not worth a prompt; a chosen category or area is, because
 * it took taps to set.
 */
export function hasCaptureInput(input: CaptureInput): boolean {
  return (
    input.hasMedia ||
    input.description.trim().length > 0 ||
    input.placeDetail.trim().length > 0 ||
    input.category !== null ||
    input.areaId !== null
  )
}

/**
 * Whether a change in the location permission should start a new fix.
 *
 * Only a not-granted to granted change does: the citizen turned location on in
 * Settings. Refreshing on every render where the permission is granted and the
 * fix is `unavailable` (the phone's location switch is off) retried forever.
 * `previous` is `null` until the first read, which is not a change.
 */
export function shouldRefreshFixOnPermission(
  previous: PermissionState | null,
  next: PermissionState | undefined,
): boolean {
  return previous !== null && previous !== 'granted' && next === 'granted'
}

/**
 * How long to wait after the sheet is dismissed before launching the camera or
 * gallery. iOS cannot present a picker while the sheet's modal is still
 * animating out and fails without an error; Android has no such limit.
 */
export function pickerLaunchDelayMs(os: string): number {
  return os === 'ios' ? 350 : 0
}

/** The longest a send waits for a GPS fix before it goes without one. */
export const SEND_FIX_WAIT_MS = 5_000

/**
 * A wait that ends on its own after `ms`, or sooner on `skip()`. It resolves
 * `null` either way, so it can sit in a `Promise.race` against the fix.
 * `clear()` drops the timer once the race is over.
 */
export function createFixWait(ms: number): {
  promise: Promise<null>
  skip: () => void
  clear: () => void
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  let finish: (value: null) => void = () => {}
  const promise = new Promise<null>((resolve) => {
    finish = resolve
    timer = setTimeout(() => resolve(null), ms)
  })

  return {
    promise,
    skip: () => finish(null),
    clear: () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    },
  }
}

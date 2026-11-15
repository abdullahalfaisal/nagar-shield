import * as Location from 'expo-location'

/** How long the app waits for a fresh GPS reading before it gives up: ten seconds. */
export const FIX_TIMEOUT_MS = 10_000

/** The oldest last-known position that stands in for a reading that took too long. */
const STAND_IN_MAX_AGE_MS = 10 * 60_000

/**
 * `Location.getCurrentPositionAsync`, but it never waits longer than `timeoutMs`.
 *
 * The native call has no timeout of its own: indoors, or with a weak signal, it
 * can run for minutes, and every screen that shows "finding your location"
 * would stay on it. Past the limit the phone's last known position stands in
 * for the reading if it is recent; otherwise this throws, which callers already
 * treat as "location unavailable".
 */
export async function currentPositionWithin(
  options: Location.LocationOptions,
  timeoutMs: number = FIX_TIMEOUT_MS,
): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('The location reading took too long.')), timeoutMs)
  })

  try {
    return await Promise.race([Location.getCurrentPositionAsync(options), timeout])
  } catch (error) {
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: STAND_IN_MAX_AGE_MS })
      if (lastKnown) return lastKnown
    } catch {
      // No stand-in: the original failure is the answer.
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

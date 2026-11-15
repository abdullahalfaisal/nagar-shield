import { useCallback, useEffect, useState } from 'react'
import * as Location from 'expo-location'
import { currentPositionWithin } from './positionWithin'
import { LAST_KNOWN_MAX_AGE_MS } from './locationFix'

/**
 * The single foreground GPS fix.
 *
 * The fix is requested **just-in-time** — when the Capture screen opens, when
 * the History screen opens, when the thana line opens. It is never requested
 * at app open and never on the panic path: the dial path must complete with no
 * location fix at all (FR-PERMS-2).
 */
export interface Fix {
  lat: number
  lng: number
  accuracyM: number | null
}

export type FixState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; fix: Fix }
  | { status: 'denied' }
  | { status: 'unavailable' }

export interface UseCurrentFixOptions {
  /** Requests the fix as soon as the hook mounts. */
  enabled?: boolean
  /**
   * `precise` asks for the GPS (`Accuracy.High`). The default, `Balanced`, is
   * answered on Android from Wi-Fi and cell towers, which can be a kilometre or
   * more off — near enough to sort a list by distance, not to name the area a
   * report is filed in.
   */
  precise?: boolean
  /**
   * Asks the system for the location permission when it has not been decided.
   * Home passes `false`: it only names the area when the permission is already
   * granted, and never raises a prompt of its own. Defaults to `true`.
   */
  requestPermission?: boolean
}

/** Two readings closer than this are the same place for a list sorted by distance. */
const SAME_PLACE_M = 150

/** The distance in metres between two points, on a sphere. Good to a few metres at city scale. */
function distanceMetres(a: Fix, b: Fix): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * Requests one fix and returns it.
 *
 * A denied permission is a **normal** outcome, not an error: the caller
 * degrades to a manual origin and never blocks the user.
 */
export function useCurrentFix(options: UseCurrentFixOptions = {}): {
  state: FixState
  refresh: () => void
} {
  const enabled = options.enabled ?? true
  const precise = options.precise ?? false
  const requestPermission = options.requestPermission ?? true
  const [state, setState] = useState<FixState>({ status: 'idle' })
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => {
    setNonce((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const resolve = async () => {
      setState({ status: 'loading' })

      try {
        const permission = requestPermission
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync()

        if (cancelled) return

        if (permission.status !== Location.PermissionStatus.GRANTED) {
          setState({ status: 'denied' })
          return
        }

        // A list sorted by distance does not need the exact spot, so the
        // phone's last known position is used at once and the fresh reading only
        // replaces it when the phone has really moved. A fresh GPS reading can
        // take many seconds; waiting for it left every screen on "locating".
        // A screen that files a report (`precise`) still waits for the real fix.
        let shown: Fix | null = null
        if (!precise) {
          try {
            const known = await Location.getLastKnownPositionAsync({
              maxAge: LAST_KNOWN_MAX_AGE_MS,
              requiredAccuracy: 500,
            })
            if (cancelled) return
            if (known) {
              shown = {
                lat: known.coords.latitude,
                lng: known.coords.longitude,
                accuracyM: known.coords.accuracy ?? null,
              }
              setState({ status: 'ready', fix: shown })
            }
          } catch {
            // No stand-in: wait for the fresh reading.
          }
        }

        const position = await currentPositionWithin({
          accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
        })

        if (cancelled) return

        const fresh: Fix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy ?? null,
        }

        // The same place, give or take: keep what is on screen, so the lists
        // built from it are not fetched twice.
        if (shown && distanceMetres(shown, fresh) < SAME_PLACE_M) return

        setState({ status: 'ready', fix: fresh })
      } catch {
        // A fresh reading that failed after a last known position was shown
        // leaves that position in place.
        if (!cancelled)
          setState((current) => (current.status === 'ready' ? current : { status: 'unavailable' }))
      }
    }

    void resolve()

    return () => {
      cancelled = true
    }
  }, [enabled, nonce, precise, requestPermission])

  return { state, refresh }
}

/**
 * The Dhaka fallback origin.
 *
 * Used when the permission is denied or the fix fails, so the History list and
 * the station lookup stay usable. The coordinate is the centre of Dhaka.
 */
export const DHAKA_FALLBACK_ORIGIN: Fix = {
  lat: 23.7806,
  lng: 90.4066,
  accuracyM: null,
}

/** The origin to use for a given fix state. */
export function resolveOrigin(state: FixState): { origin: Fix; isFallback: boolean } {
  if (state.status === 'ready') {
    return { origin: state.fix, isFallback: false }
  }
  return { origin: DHAKA_FALLBACK_ORIGIN, isFallback: true }
}

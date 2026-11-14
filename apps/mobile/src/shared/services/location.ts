import { useCallback, useEffect, useState } from 'react'
import * as Location from 'expo-location'

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
        const permission = await Location.requestForegroundPermissionsAsync()

        if (cancelled) return

        if (permission.status !== Location.PermissionStatus.GRANTED) {
          setState({ status: 'denied' })
          return
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })

        if (cancelled) return

        setState({
          status: 'ready',
          fix: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy ?? null,
          },
        })
      } catch {
        if (!cancelled) setState({ status: 'unavailable' })
      }
    }

    void resolve()

    return () => {
      cancelled = true
    }
  }, [enabled, nonce])

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

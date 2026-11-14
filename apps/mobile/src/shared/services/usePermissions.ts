import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  RESTRICTED_PERMISSIONS,
  entryPointAvailability,
  readPermissions,
  type EntryPointAvailability,
  type PermissionSnapshot,
} from './permissions'

/**
 * The live permission state.
 *
 * The state is **read, never assumed**. The hook re-reads it whenever the
 * app returns to the foreground, so a permission the citizen revoked while
 * the app was backgrounded is reflected the next time the screen renders.
 * There is no cached "granted" flag that can go stale — a stale flag would
 * offer an entry point that no longer works.
 *
 * The read **never prompts**. The prompts fire just-in-time, at the moment
 * the user taps the entry point that needs them.
 */
export interface UsePermissionsResult {
  /** The four permissions' states. `null` until the first read lands. */
  permissions: PermissionSnapshot | null
  /** Which entry points the Capture screen may offer. */
  availability: EntryPointAvailability
  /** Re-reads the permissions now. */
  refresh: () => void
}

export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<PermissionSnapshot | null>(null)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => {
    setNonce((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const read = async () => {
      const snapshot = await readPermissions()
      if (!cancelled) setPermissions(snapshot)
    }

    void read()

    return () => {
      cancelled = true
    }
  }, [nonce])

  // A revocation while the app was backgrounded has to be picked up. The
  // screen is re-read on every foreground, not only on mount.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return
      refresh()
    })

    return () => subscription.remove()
  }, [refresh])

  return {
    permissions,
    // Until the first read lands, the most restricted reading is used. The
    // entry points appear once the state is known — a card that flickers
    // into view and then out is worse than one that arrives a moment late.
    availability: entryPointAvailability(permissions ?? RESTRICTED_PERMISSIONS),
    refresh,
  }
}

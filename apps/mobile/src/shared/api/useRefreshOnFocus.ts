import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'

/** How old a list may be, when its screen comes back into view, before it is refreshed. */
export const FOCUS_REFRESH_AFTER_MS = 30_000

/**
 * Refreshes a list when its screen comes back into view.
 *
 * A screen in the stack stays mounted while another opens over it, so coming
 * back to it is neither a mount nor a window focus: nothing told the list it had
 * been away. Anything that changed meanwhile — a report someone else filed, a
 * flag that hid one — stayed out of sight until the next poll or a pull. This
 * refreshes the list when the screen is shown again and the data is older than
 * `staleMs`; the first showing is left to the query's own load.
 */
export function useRefreshOnFocus(
  refetch: () => unknown,
  dataUpdatedAt: number,
  staleMs: number = FOCUS_REFRESH_AFTER_MS,
) {
  const shownBefore = useRef(false)
  const latest = useRef({ refetch, dataUpdatedAt })
  latest.current = { refetch, dataUpdatedAt }

  useFocusEffect(
    useCallback(() => {
      if (!shownBefore.current) {
        shownBefore.current = true
        return
      }

      if (Date.now() - latest.current.dataUpdatedAt > staleMs) void latest.current.refetch()
    }, [staleMs]),
  )
}

import { useCallback, useRef } from 'react'

/** How long a pressable ignores a second press. */
export const PRESS_GUARD_MS = 600

/**
 * Wraps a press handler so a double or triple tap runs it once.
 *
 * Navigation has its own guard (`useSafeRouter`); this one covers the actions
 * that are not navigation — a share, a send, a save, a delete — where a second
 * tap before the first finishes would do the thing twice. The primitives that
 * take an `onPress` (Button, cards, rows, banners) use it, so a screen does not
 * have to remember to.
 *
 * Each component instance has its own window, so tapping two different buttons
 * in a row is not affected.
 */
export function usePressGuard<Args extends unknown[]>(
  handler: ((...args: Args) => void) | undefined,
  windowMs: number = PRESS_GUARD_MS,
): ((...args: Args) => void) | undefined {
  const lastAt = useRef(0)
  const latest = useRef(handler)
  latest.current = handler

  const guarded = useCallback(
    (...args: Args) => {
      const now = Date.now()
      if (now - lastAt.current < windowMs) return
      lastAt.current = now
      latest.current?.(...args)
    },
    [windowMs],
  )

  return handler ? guarded : undefined
}

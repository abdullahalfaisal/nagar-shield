import { useMemo } from 'react'
import { useRouter as useExpoRouter } from 'expo-router'

/**
 * A router that ignores a repeated tap.
 *
 * `router.push` runs every time it is called, so three quick taps on a card
 * opened the screen three times — and Back then had to be pressed three times
 * to get home. The same thing happens to Back itself (two taps leave two
 * screens), and to `replace`.
 *
 * Two rules, applied to every navigation in the app because every screen gets
 * its router from here:
 *
 *   * **One navigation at a time.** After any push, replace or back, further
 *     ones are ignored for `LOCK_MS`: long enough to swallow a double or triple
 *     tap, short enough that a deliberate second step is never blocked.
 *   * **Never the same place twice in a row.** The same destination is ignored
 *     for `SAME_TARGET_MS`, which covers a slow, jittery tap or a screen that
 *     is slow to appear.
 *
 * The lock is module-wide, not per screen: the screen being left and the one
 * arriving are different components, and the second tap often lands on the
 * old one.
 */
export const LOCK_MS = 500
export const SAME_TARGET_MS = 1200

interface NavState {
  at: number
  key: string
}

let last: NavState = { at: 0, key: '' }

/** Whether a navigation to `key` may go ahead now; records it when it may. */
export function allowNavigation(key: string, now: number = Date.now()): boolean {
  const since = now - last.at

  if (since < LOCK_MS) return false
  if (key === last.key && since < SAME_TARGET_MS) return false

  last = { at: now, key }
  return true
}

/** Forgets the last navigation. For tests. */
export function resetNavigationGuard(): void {
  last = { at: 0, key: '' }
}

function keyOf(action: string, target: unknown): string {
  try {
    return `${action}:${typeof target === 'string' ? target : JSON.stringify(target)}`
  } catch {
    return `${action}:?`
  }
}

type ExpoRouter = ReturnType<typeof useExpoRouter>

/** Same API as expo-router's `useRouter`; push, replace, navigate and back are guarded. */
export function useRouter(): ExpoRouter {
  const router = useExpoRouter()

  return useMemo<ExpoRouter>(
    () => ({
      ...router,
      push: (href, options) => {
        if (allowNavigation(keyOf('push', href))) router.push(href, options)
      },
      replace: (href, options) => {
        if (allowNavigation(keyOf('replace', href))) router.replace(href, options)
      },
      navigate: (href, options) => {
        if (allowNavigation(keyOf('navigate', href))) router.navigate(href, options)
      },
      back: () => {
        if (allowNavigation('back')) router.back()
      },
    }),
    [router],
  )
}

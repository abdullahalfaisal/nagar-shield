import { act, renderHook, waitFor } from '@testing-library/react'
import { useRefreshGuard, type AppStateSource } from './refreshGuard'

/**
 * The refresh guard's **live** pause check.
 *
 * `guard.isPaused` is React state: it describes the last **render**. A native
 * `appStateDidChange` event that has not been committed yet is invisible to
 * it — so a request issued in that window would go out after the app was
 * already backgrounded.
 *
 * `isPausedNow()` reads the app state source **directly**, so it sees the
 * backgrounding the moment the native event arrives. That is what makes it
 * different from `isPaused`, and the difference is the whole point.
 *
 * These tests live in a `.dom.test.ts` file because `renderHook` needs a DOM.
 * The **pure** rules — which condition pauses, and which reason wins — are in
 * `refreshGuard.test.ts`, where a boundary can be pinned exactly.
 */

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(async () => 1),
}))

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}))

/**
 * An app state source the test drives directly.
 *
 * `currentState` is a **getter**, and `emit` fires the listeners **without**
 * committing — the point is to model a native event that has arrived but has
 * not yet reached React.
 */
function fakeSource(initial: string) {
  let state = initial
  const listeners = new Set<(state: string) => void>()

  const source: AppStateSource = {
    get currentState() {
      return state
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }

  return {
    source,
    /** The native event arrives; React has not committed it. */
    emit: (next: string) => {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

describe('the live pause check', () => {
  it('is false on a healthy foregrounded device', async () => {
    const { source } = fakeSource('active')

    const { result } = renderHook(() => useRefreshGuard(15_000, source))

    await waitFor(() => expect(result.current.isPausedNow()).toBe(false))
  })

  it('sees a backgrounding that React has not committed', async () => {
    const { source, emit } = fakeSource('active')

    const { result } = renderHook(() => useRefreshGuard(15_000, source))

    await waitFor(() => expect(result.current.isPausedNow()).toBe(false))

    // The native event arrives. React has not re-rendered, so the React state
    // still says "foregrounded"…
    emit('background')

    // …but the live check sees it. This is the whole reason it exists.
    expect(result.current.isPausedNow()).toBe(true)

    // And the React state has not caught up yet — that is the hazard the live
    // check exists for, so the test asserts the hazard is real.
    expect(result.current.isForeground).toBe(true)
  })

  it('agrees with the rendered state once React has committed', async () => {
    const { source, emit } = fakeSource('active')

    const { result } = renderHook(() => useRefreshGuard(15_000, source))

    await waitFor(() => expect(result.current.isPausedNow()).toBe(false))

    await act(async () => {
      emit('background')
    })

    // Both surfaces agree once the commit has happened.
    await waitFor(() => expect(result.current.isForeground).toBe(false))
    expect(result.current.isPaused).toBe(true)
    expect(result.current.isPausedNow()).toBe(true)
  })

  it('sees a foregrounding that React has not committed', async () => {
    const { source, emit } = fakeSource('background')

    const { result } = renderHook(() => useRefreshGuard(15_000, source))

    await waitFor(() => expect(result.current.isPausedNow()).toBe(true))

    // Back to the foreground, mid-commit.
    emit('active')

    expect(result.current.isPausedNow()).toBe(false)
  })
})

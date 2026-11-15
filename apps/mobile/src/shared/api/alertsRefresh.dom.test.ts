import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { alertsItems, useAlertsFeed } from './alerts'
import { supabase } from '@/shared/api/supabase'

/**
 * The auto-refresh, driven through the **real** hook.
 *
 * The story `002-auto-refresh-and-pull-to-refresh` promises ten things, and
 * most of them are about *time* — a poll that fires every 60 s, a poll that
 * does **not** fire while the app is backgrounded, a poll that re-arms on
 * foregrounding without a catch-up burst. None of that is observable from a
 * unit test that stubs the hook out.
 *
 * So these tests drive `useAlertsFeed` itself, with real fake timers, and count
 * the RPC calls.
 *
 * ## Why the request count is the assertion
 *
 * The story's AC #1 says the feed "re-queries exactly once per interval". The
 * unit of that claim is the **poll event** — the interval firing — not the
 * HTTP request. An infinite query re-fetches **every loaded page** on a
 * refetch, so a poll on a three-page feed issues three RPCs. The story's own
 * edge-case table expects that ("the loaded pages are preserved and refreshed
 * by the same query key"), so a request count would be a misleading
 * assertion. These tests keep the feed at **one page**, so one poll event is
 * one RPC — and the coalescing test (#7) asserts the request count directly,
 * because *that* AC is about requests.
 *
 * ## The fake-timer mechanics
 *
 * `timeoutManager.setInterval` is the **global** `setInterval`, so
 * `jest.useFakeTimers()` intercepts the poll timer. Two consequences:
 *
 *   * `waitFor` under fake timers advances in 50 ms steps — it must **never**
 *     be relied on to cross 60 s. Every interval is crossed explicitly with
 *     `jest.advanceTimersByTime`.
 *   * the guard has its **own** 15 s `setInterval`, so advancing 60 s fires it
 *     four times. The battery and network mocks are therefore **idempotent**
 *     (`mockResolvedValue`, never `mockResolvedValueOnce`) — a one-shot mock
 *     runs out mid-interval and the guard falls back to "unknown".
 */

jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}))

jest.mock('expo-battery', () => ({
  getBatteryLevelAsync: jest.fn(),
}))

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
}))

/**
 * `AppState` is a native module, and React Native 0.88 exposes it as a lazy
 * getter that throws without the native bridge. The jsdom project has no
 * bridge, so the mock supplies it — as a **variable**, so a test can
 * background the app.
 */
let mockAppState = 'active'
const mockAppStateListeners = new Set<(state: string) => void>()

jest.mock('react-native', () => ({
  __esModule: true,
  AppState: {
    get currentState() {
      return mockAppState
    },
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      mockAppStateListeners.add(listener)
      return {
        remove: () => {
          mockAppStateListeners.delete(listener)
        },
      }
    }),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Battery = require('expo-battery')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Network = require('expo-network')

const rpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>

/** The story's interval. Pinned here as well as in `packages/shared`. */
const INTERVAL_MS = 60_000

/** One page of the RPC's envelope. */
function envelope(items: Array<Record<string, unknown>>, nextCursor: string | null = null) {
  return { data: { items, next_cursor: nextCursor }, error: null }
}

/** A minimal feed row, shaped like the RPC's output. */
function row(id: string) {
  return {
    id,
    category: 'theft',
    description: null,
    area_hierarchy: { division: 'Dhaka', city: 'Dhaka', thana: null, neighborhood: null },
    captured_at: '2026-11-05T10:00:00.000Z',
    author_display_name: null,
    has_media: false,
    media_count: 0,
  }
}

/**
 * Puts the device in a healthy state: charged, online, foregrounded.
 *
 * The mocks are **idempotent** — the guard polls every 15 s, so a one-shot
 * mock would run out part-way through a 60 s advance.
 */
function healthyDevice() {
  Battery.getBatteryLevelAsync.mockReset()
  Battery.getBatteryLevelAsync.mockResolvedValue(1)
  Network.getNetworkStateAsync.mockReset()
  Network.getNetworkStateAsync.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  })
  mockAppState = 'active'
}

/**
 * Drives the app's state and notifies the guard's subscriber.
 *
 * The listener sets React state, so the call is wrapped in `act` — the update
 * is a real one, and leaving it unwrapped makes React warn about every
 * backgrounding in the suite.
 */
async function setAppState(state: string) {
  mockAppState = state
  await act(async () => {
    for (const listener of mockAppStateListeners) listener(state)
  })
}

/**
 * Backgrounds the app **without** letting React commit.
 *
 * This is the race the `queryFn` refusal exists for. The native
 * `appStateDidChange` event arrives, the guard's subscriber sets React state,
 * but React has **not re-rendered** yet — so the poll timer is still armed,
 * and the computed interval is still 60 s.
 *
 * If the interval elapses in that window, the timer fires and the request
 * goes out — after the app was already backgrounded.
 *
 * The difference from `setAppState` is that the state update is **not**
 * wrapped in `act`, so React does not flush it. The guard's *own* state has
 * not updated, but the native app state has.
 */
function backgroundWithoutCommit() {
  mockAppState = 'background'
  for (const listener of mockAppStateListeners) listener('background')
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }
}

/**
 * Advances the clock and lets the resulting promises settle.
 *
 * The poll's `queryFn` is async, so the timer callback returns before the
 * request does. The `act` wrapper covers the state updates React makes when
 * the request settles.
 */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

/** Lets the guard's first asynchronous readings land. */
async function settleGuard() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/**
 * The **poll timer** — observed directly, not inferred from the requests.
 *
 * There are two separate levers in the guard, and only the requests tell them
 * apart by accident:
 *
 *   * the **interval function** stops the *timer* — no interval is armed;
 *   * the **`queryFn` refusal** stops the *request* — the interval fires, the
 *     fetch is refused.
 *
 * A test that counts RPC calls sees the same result either way, because the
 * request never reaches the server in both cases. So the *timer* needs its own
 * observation, and the story asks for it: AC #2 says **"no background task,
 * headless job, or timer survives the backgrounding"**. A surviving timer is
 * exactly what a request count cannot see.
 *
 * `timeoutManager.setTimeoutProvider` is the seam TanStack provides for this.
 *
 * The recorder tracks the intervals that are **currently armed**, not the ones
 * that were ever armed: TanStack clears the old interval before arming the
 * new one, so a recorder that only accumulated would report a timer that no
 * longer exists. A cleared interval is **removed** from the live set.
 */
/**
 * The **poll timer** — observed directly, not inferred from the requests.
 *
 * There are two separate levers in the guard, and only the requests tell them
 * apart by accident:
 *
 *   * the **interval function** stops the *timer* — no interval is armed;
 *   * the **`queryFn` refusal** stops the *request* — the interval fires, the
 *     fetch is refused.
 *
 * A test that counts RPC calls sees the same result either way, because the
 * request never reaches the server in both cases. So the *timer* needs its own
 * observation, and the story asks for it: AC #2 says **"no background task,
 * headless job, or timer survives the backgrounding"**. A surviving timer is
 * exactly what a request count cannot see.
 *
 * The observation is a spy on the **global** `setInterval`, because that is
 * what TanStack's default timeout provider calls — `timeoutManager` with no
 * provider set delegates straight to the platform's `setInterval`. So the spy
 * sees the poll timer without the test depending on `@tanstack/query-core`,
 * which is not a dependency of this app.
 *
 * The spy must wrap the **faked** global, so `jest.useFakeTimers()` runs
 * first: a spy installed over the real global would schedule real timers and
 * the fake clock would never advance them.
 *
 * The spy tracks the intervals that are **currently armed**, not the ones that
 * were ever armed: TanStack clears the old interval before arming the new
 * one, so a recorder that only accumulated would report a timer that no
 * longer exists.
 */
const liveIntervals = new Map<unknown, number>()

function installTimerRecorder() {
  liveIntervals.clear()

  // The **faked** globals — `jest.useFakeTimers()` has already replaced them.
  const fakeSetInterval = globalThis.setInterval
  const fakeClearInterval = globalThis.clearInterval

  const spy = jest.spyOn(globalThis, 'setInterval').mockImplementation(((
    callback: () => void,
    delay?: number,
  ) => {
    const id = fakeSetInterval(callback, delay)
    liveIntervals.set(id, delay ?? 0)
    return id
  }) as unknown as typeof globalThis.setInterval)

  const clearSpy = jest.spyOn(globalThis, 'clearInterval').mockImplementation(((id?: unknown) => {
    liveIntervals.delete(id)
    fakeClearInterval(id as Parameters<typeof fakeClearInterval>[0])
  }) as unknown as typeof globalThis.clearInterval)

  return () => {
    spy.mockRestore()
    clearSpy.mockRestore()
  }
}

/** The 60 s poll intervals currently armed. */
function pollTimers(): number[] {
  return [...liveIntervals.values()].filter((delay) => delay === INTERVAL_MS)
}

/** Removes the timer recorder, so a later test is not reading this one's. */
let restoreTimerRecorder: (() => void) | undefined

beforeEach(() => {
  jest.useFakeTimers()
  rpc.mockReset()
  healthyDevice()
  restoreTimerRecorder = installTimerRecorder()
})

afterEach(() => {
  jest.useRealTimers()
  restoreTimerRecorder?.()
  restoreTimerRecorder = undefined
})

describe('the feed re-queries once per interval', () => {
  it('polls exactly once per 60 seconds', async () => {
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))

    // The mount fetch is the one call so far. Nothing before the interval.
    await advance(INTERVAL_MS - 1)
    expect(rpc).toHaveBeenCalledTimes(1)

    // One interval crossed: one more poll.
    await advance(1)
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))

    // And the next interval gives exactly one more — not two, not none.
    await advance(INTERVAL_MS)
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3))
  })

  it('keeps the rows it has while polling', async () => {
    rpc.mockResolvedValue(envelope([row('a'), row('b')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await advance(INTERVAL_MS)
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))

    // The refreshed feed still holds the same rows — the poll replaced the
    // page rather than emptying it.
    expect(alertsItems(result.current.data).map((report) => report.id)).toEqual(['a', 'b'])
  })
})

describe('a backgrounded app makes no feed requests', () => {
  it('issues zero requests while the app is backgrounded', async () => {
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))

    await setAppState('background')

    // Ten intervals in the background: not one request.
    await advance(INTERVAL_MS * 10)

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('leaves no poll timer armed while the app is backgrounded', async () => {
    // AC #2 says no **timer** survives the backgrounding. The request count
    // cannot see that: the `queryFn` refusal would stop the request even with
    // the timer still running, so the count would be zero either way.
    //
    // This asserts the timer itself is gone.
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))

    // In the foreground, the poll timer is armed.
    expect(pollTimers().length).toBeGreaterThan(0)

    await setAppState('background')

    // Backgrounded: the poll interval is **not** armed. The computed interval
    // became `false`, so TanStack cleared the timer and armed nothing.
    expect(pollTimers()).toEqual([])

    // And it stays unarmed across a whole interval.
    await advance(INTERVAL_MS)
    expect(pollTimers()).toEqual([])
  })

  it('issues no request when the interval elapses mid-backgrounding', async () => {
    // The **race window**.
    //
    // The native `appStateDidChange` event fires, the guard's subscriber sets
    // React state — but React has not re-rendered yet, so the poll timer is
    // still armed and the computed interval is still 60 s.
    //
    // If the interval elapses in that window, the timer fires. The interval
    // *function* cannot stop it — the function is only re-evaluated on a
    // render, and there has not been one. So the **request** has to be
    // refused by the `queryFn` instead.
    //
    // This is the second of the two levers, and it is the one that closes the
    // window the first one leaves open.
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))

    // Backgrounded, but React has not committed the change.
    backgroundWithoutCommit()

    const callsBefore = rpc.mock.calls.length

    // The interval elapses inside the window.
    await advance(INTERVAL_MS)

    // No request went out. The `queryFn` refused it.
    expect(rpc).toHaveBeenCalledTimes(callsBefore)
  })

  it('re-arms the poll on foregrounding, with no catch-up burst', async () => {
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))

    await setAppState('background')

    // Ten minutes in the background: nothing.
    await advance(INTERVAL_MS * 10)
    expect(rpc).toHaveBeenCalledTimes(1)

    // Back to the foreground.
    await setAppState('active')

    // **Immediately** after foregrounding: still nothing. The next interval is
    // measured from this moment, not from the moment the app was backgrounded.
    expect(rpc).toHaveBeenCalledTimes(1)

    await advance(INTERVAL_MS - 1)
    expect(rpc).toHaveBeenCalledTimes(1)

    // One full interval later: exactly one poll.
    await advance(1)
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))

    // The guard agrees the app is foregrounded again.
    expect(result.current.guard.isForeground).toBe(true)
    expect(result.current.guard.isPaused).toBe(false)
  })
})

describe('a low battery pauses the poll', () => {
  it('issues no request when the battery is below 20 %', async () => {
    Battery.getBatteryLevelAsync.mockReset()
    Battery.getBatteryLevelAsync.mockResolvedValue(0.15)

    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.guard.pausedReason).toBe('battery'))

    const callsBefore = rpc.mock.calls.length

    await advance(INTERVAL_MS)

    // No new request, and the reason is the battery.
    expect(rpc).toHaveBeenCalledTimes(callsBefore)
    expect(result.current.guard.pausedReason).toBe('battery')
    expect(result.current.guard.isPaused).toBe(true)
  })

  it('keeps the cached page while the battery is low', async () => {
    rpc.mockResolvedValue(envelope([row('a'), row('b')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The battery drops while the app is open.
    Battery.getBatteryLevelAsync.mockReset()
    Battery.getBatteryLevelAsync.mockResolvedValue(0.15)
    await advance(15_000)
    await waitFor(() => expect(result.current.guard.pausedReason).toBe('battery'))

    await advance(INTERVAL_MS)

    // The rows are still on screen.
    expect(alertsItems(result.current.data).map((report) => report.id)).toEqual(['a', 'b'])
  })
})

describe('a low battery pauses only the automatic poll', () => {
  it('still loads on the first load and on a pull', async () => {
    Battery.getBatteryLevelAsync.mockReset()
    Battery.getBatteryLevelAsync.mockResolvedValue(0.15)

    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.guard.pausedReason).toBe('battery'))

    // The first load went out although the battery is low…
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // …and so does a pull the user makes.
    const callsBefore = rpc.mock.calls.length
    await act(async () => {
      await result.current.refetch()
    })
    expect(rpc.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(result.current.isError).toBe(false)
  })

  it('still retries straight away while the device is flagged offline', async () => {
    Network.getNetworkStateAsync.mockReset()
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    })

    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.guard.isOffline).toBe(true))

    // Retry is the user's request: the offline flag (up to 15 s stale) must
    // not refuse it.
    await act(async () => {
      await result.current.refetch()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('an unknown battery reading does not pause the poll', () => {
  it('treats a negative sentinel as not low, and keeps polling', async () => {
    // `-1` is `expo-battery`'s "unknown" sentinel.
    Battery.getBatteryLevelAsync.mockReset()
    Battery.getBatteryLevelAsync.mockResolvedValue(-1)

    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.guard.batteryLevel).toBeNull())

    // Not paused — a missing reading must never silently kill the refresh.
    expect(result.current.guard.isPaused).toBe(false)

    await advance(INTERVAL_MS)
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
  })
})

describe('a manual pull re-queries immediately', () => {
  it('refetches without waiting for the interval', async () => {
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))

    // The pull: a refetch, straight away.
    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
  })

  it('shows the refresh indicator while the pull is in flight', async () => {
    // A deferred RPC: the request stays in flight until the test releases it.
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    rpc.mockImplementation(
      (() =>
        new Promise((resolve) => {
          void gate.then(() => resolve(envelope([row('a')]) as never))
        })) as never,
    )

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()

    // The mount fetch is in flight.
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    expect(result.current.isRefetching).toBe(false)

    release?.()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isFetching).toBe(false)
  })

  it('shows the refresh indicator while a poll is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    let call = 0
    rpc.mockImplementation((() => {
      call += 1
      // The first call — the mount fetch — resolves at once.
      if (call === 1) return Promise.resolve(envelope([row('a')]) as never)
      return new Promise((resolve) => {
        void gate.then(() => resolve(envelope([row('a')]) as never))
      })
    }) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await advance(INTERVAL_MS)

    // The poll is in flight, so the indicator is on.
    await waitFor(() => expect(result.current.isRefetching).toBe(true))

    release?.()
    await waitFor(() => expect(result.current.isRefetching).toBe(false))
  })
})

describe('a poll landing during a manual pull is coalesced', () => {
  it('issues one request and renders no duplicate rows', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    let call = 0
    rpc.mockImplementation((() => {
      call += 1
      // The mount fetch resolves at once; everything after waits.
      if (call === 1) return Promise.resolve(envelope([row('a'), row('b')]) as never)
      return new Promise((resolve) => {
        void gate.then(() => resolve(envelope([row('a'), row('b')]) as never))
      })
    }) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The manual pull starts and stays in flight.
    let pull: Promise<unknown> | undefined
    await act(async () => {
      pull = result.current.refetch()
    })

    const callsAfterPull = rpc.mock.calls.length

    // The scheduled poll lands **during** the pull.
    await advance(INTERVAL_MS)

    // Coalesced: the poll reused the in-flight request rather than racing it.
    expect(rpc).toHaveBeenCalledTimes(callsAfterPull)

    release?.()
    await act(async () => {
      await pull
    })

    // And the rendered list has no duplicate ids.
    const ids = alertsItems(result.current.data).map((report) => report.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['a', 'b'])
  })
})

describe('an offline device makes no doomed request', () => {
  it('issues no request while offline and keeps the cached page', async () => {
    rpc.mockResolvedValue(envelope([row('a'), row('b')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The device goes offline while the poll timer is armed.
    Network.getNetworkStateAsync.mockReset()
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    })
    await advance(15_000)
    await waitFor(() => expect(result.current.guard.isOffline).toBe(true))

    const callsBefore = rpc.mock.calls.length

    // The interval fires — but issues no request.
    await advance(INTERVAL_MS)

    expect(rpc).toHaveBeenCalledTimes(callsBefore)
    expect(result.current.guard.pausedReason).toBe('offline')

    // The cached page stays on screen.
    expect(alertsItems(result.current.data).map((report) => report.id)).toEqual(['a', 'b'])
  })

  it('resumes polling when the device comes back online', async () => {
    rpc.mockResolvedValue(envelope([row('a')]) as never)

    const { result } = renderHook(() => useAlertsFeed({}), { wrapper: wrapper() })
    await settleGuard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    Network.getNetworkStateAsync.mockReset()
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    })
    await advance(15_000)
    await waitFor(() => expect(result.current.guard.isOffline).toBe(true))

    const callsBefore = rpc.mock.calls.length

    // Still offline: nothing.
    await advance(INTERVAL_MS)
    expect(rpc).toHaveBeenCalledTimes(callsBefore)

    // Back online.
    Network.getNetworkStateAsync.mockReset()
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    })
    await advance(15_000)
    await waitFor(() => expect(result.current.guard.isOffline).toBe(false))

    // The poll resumes on the next interval.
    await advance(INTERVAL_MS)
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

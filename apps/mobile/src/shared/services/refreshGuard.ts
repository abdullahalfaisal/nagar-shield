import { useEffect, useState } from 'react'
import * as Battery from 'expo-battery'
import * as Network from 'expo-network'
import { AppState, type AppStateStatus } from 'react-native'
import { ALERTS_BATTERY_PAUSE_THRESHOLD } from '@nagar-shield/shared'

/**
 * The auto-refresh guards.
 *
 * The feed polls every 60 s while the app is **foregrounded** and the device is
 * healthy. It pauses when:
 *
 *   * the battery is below 20 % (FR-ALERTS-2)
 *   * the app is backgrounded — a backgrounded app performs no feed requests
 *   * the device is offline — no doomed request every minute
 *
 * The battery reading can be **unknown** on some devices and emulators. An
 * unknown reading is treated as "not low": a missing reading must never
 * silently kill the refresh.
 */

export type RefreshPauseReason = 'battery' | 'background' | 'offline' | null

export interface RefreshGuard {
  /** `true` when the polling must not run. */
  isPaused: boolean
  pausedReason: RefreshPauseReason
  /** The battery level between 0 and 1, or `null` when it is unknown. */
  batteryLevel: number | null
  /** `true` when the device has no usable network connection. */
  isOffline: boolean
  /** `true` while the app is in the foreground. */
  isForeground: boolean
  /**
   * Whether the refresh is paused **right now**, read live.
   *
   * The fields above are React state, so they describe the last **render**.
   * A native `appStateDidChange` event that has not been committed yet is
   * invisible to them — and a request issued in that window would go out after
   * the app was already backgrounded.
   *
   * So the guard also carries a **live** check, which reads the app state
   * source directly. The source's `currentState` is a getter, not a value, so
   * it is read at the moment of the call.
   *
   * The feed's `queryFn` uses this rather than `isPaused`, which is what closes
   * the race window between the native event and React's commit.
   */
  isPausedNow: () => boolean
  /**
   * Whether the app is backgrounded **right now**, read live.
   *
   * The `queryFn` refuses only on this. A low battery or a dropped connection
   * pauses the *automatic* poll, but a refresh the user asks for (first load,
   * pull, Retry, "Load more") must still go out — the foreground check is
   * enough to keep a backgrounded app from issuing requests.
   */
  isBackgroundedNow: () => boolean
}

/**
 * Whether a battery level counts as low. An unknown level never does.
 *
 * The threshold is **20 %**, and the comparison is **strictly less than**: a
 * reading of exactly 20 % is not low. The boundary is a product decision, so
 * it is pinned by a test rather than inferred.
 */
export function isLowBattery(level: number | null): boolean {
  if (level === null) return false
  return level * 100 < ALERTS_BATTERY_PAUSE_THRESHOLD
}

/**
 * Why the refresh is paused — the **one** place the three conditions are
 * OR-ed.
 *
 * The order matters: **background wins**. A backgrounded app is backgrounded
 * whether or not its battery is also low, and the reason the header shows is
 * the one that will change first when the app comes back.
 */
export function refreshPauseReason(input: {
  isForeground: boolean
  isLowBattery: boolean
  isOffline: boolean
}): RefreshPauseReason {
  if (!input.isForeground) return 'background'
  if (input.isLowBattery) return 'battery'
  if (input.isOffline) return 'offline'
  return null
}

/**
 * Thrown when a fetch is refused because the refresh guard says it may not run.
 *
 * A **paused** refresh is not a **failed** one. The feed keeps its cached
 * page, and the header says *why* the refresh is paused. Treating the refusal
 * as a failure would put an offline notice over a feed that is not offline —
 * a false claim.
 */
export class RefreshPausedError extends Error {
  readonly reason: RefreshPauseReason

  constructor(reason: RefreshPauseReason) {
    super(`the refresh is paused (${reason ?? 'unknown'})`)
    this.name = 'RefreshPausedError'
    this.reason = reason
  }
}

/**
 * The app-state source — injectable so the tests can drive backgrounding.
 *
 * Without this seam, "background the app" is not expressible in a unit test:
 * React Native's `AppState` is a native module whose event name differs
 * between its internal emitter and its public alias, and mocking it is brittle
 * across React Native upgrades.
 */
export interface AppStateSource {
  /**
   * The current state — `null` before the first native event on some platforms.
   *
   * A **getter**, not a value: the state changes between renders, so reading
   * it once at subscribe time would leave the hook believing in a stale
   * state.
   */
  readonly currentState: string | null
  /** Subscribes to state changes. Returns the unsubscribe function. */
  subscribe: (listener: (state: string) => void) => () => void
}

/** The real app state, from React Native. */
export const nativeAppStateSource: AppStateSource = {
  get currentState() {
    return AppState.currentState as AppStateStatus | null
  },
  subscribe: (listener) => {
    const subscription = AppState.addEventListener('change', (state) =>
      listener(state as AppStateStatus),
    )
    return () => subscription.remove()
  },
}

/**
 * The live refresh guard.
 *
 * Every signal is polled rather than pushed: the battery and network modules
 * fire events inconsistently across Android OEM builds, and a 15 s poll is
 * cheap compared with a missed pause.
 */
export function useRefreshGuard(
  pollMs = 15_000,
  appStateSource: AppStateSource = nativeAppStateSource,
): RefreshGuard {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  // `AppState.currentState` is a bare `string` in React Native 0.88 and is
  // null before the first native event on some platforms. The app is
  // foregrounded in that case.
  const initialState = (appStateSource.currentState as AppStateStatus | null) ?? 'active'
  const [appState, setAppState] = useState<AppStateStatus>(initialState)

  useEffect(() => {
    let cancelled = false

    const readBattery = async () => {
      try {
        const level = await Battery.getBatteryLevelAsync()
        if (cancelled) return
        // `-1` is the module's "unknown" sentinel.
        setBatteryLevel(level < 0 ? null : level)
      } catch {
        if (!cancelled) setBatteryLevel(null)
      }
    }

    const readNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync()
        if (cancelled) return
        setIsOffline(state?.isInternetReachable === false || state?.isConnected === false)
      } catch {
        if (!cancelled) setIsOffline(false)
      }
    }

    void readBattery()
    void readNetwork()

    const timer = setInterval(() => {
      void readBattery()
      void readNetwork()
    }, pollMs)

    const unsubscribe = appStateSource.subscribe((state) => {
      setAppState(state as AppStateStatus)
    })

    return () => {
      cancelled = true
      clearInterval(timer)
      unsubscribe()
    }
  }, [pollMs, appStateSource])

  const isForeground = appState === 'active'
  const lowBattery = isLowBattery(batteryLevel)

  const pausedReason = refreshPauseReason({ isForeground, isLowBattery: lowBattery, isOffline })

  /**
   * The **live** pause check.
   *
   * The battery and the network are read from React state, because they arrive
   * by polling and there is no "arrived but not committed" hazard worth a
   * second mechanism. The **app state** is different: it arrives as a native
   * event, and the window between that event and React's commit is exactly
   * the window a request must not slip through.
   *
   * So this reads the app state source directly. `currentState` is a getter,
   * so the read happens at the moment of the call.
   */
  const isPausedNow = () => {
    const live = (appStateSource.currentState as AppStateStatus | null) ?? 'active'
    return (
      refreshPauseReason({
        isForeground: live === 'active',
        isLowBattery: lowBattery,
        isOffline,
      }) !== null
    )
  }

  const isBackgroundedNow = () =>
    ((appStateSource.currentState as AppStateStatus | null) ?? 'active') !== 'active'

  return {
    isPaused: pausedReason !== null,
    pausedReason,
    batteryLevel,
    isOffline,
    isForeground,
    isPausedNow,
    isBackgroundedNow,
  }
}

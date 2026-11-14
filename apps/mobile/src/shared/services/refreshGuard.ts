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
}

/** Whether a battery level counts as low. An unknown level never does. */
export function isLowBattery(level: number | null): boolean {
  if (level === null) return false
  return level * 100 < ALERTS_BATTERY_PAUSE_THRESHOLD
}

/**
 * The live refresh guard.
 *
 * Every signal is polled rather than pushed: the battery and network modules
 * fire events inconsistently across Android OEM builds, and a 15 s poll is
 * cheap compared with a missed pause.
 */
export function useRefreshGuard(pollMs = 15_000): RefreshGuard {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  // `AppState.currentState` is a bare `string` in React Native 0.88 and is
  // null before the first native event on some platforms. The app is
  // foregrounded in that case.
  const initialState = (AppState.currentState as AppStateStatus | null) ?? 'active'
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

    const subscription = AppState.addEventListener('change', setAppState)

    return () => {
      cancelled = true
      clearInterval(timer)
      subscription.remove()
    }
  }, [pollMs])

  const isForeground = appState === 'active'
  const lowBattery = isLowBattery(batteryLevel)

  const pausedReason: RefreshPauseReason = !isForeground
    ? 'background'
    : lowBattery
      ? 'battery'
      : isOffline
        ? 'offline'
        : null

  return {
    isPaused: pausedReason !== null,
    pausedReason,
    batteryLevel,
    isOffline,
    isForeground,
  }
}

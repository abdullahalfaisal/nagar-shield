import { useCallback, useEffect, useRef, useState } from 'react'
import * as Network from 'expo-network'
import { AppState, type AppStateStatus } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/api/supabase'
import { drainQueue, type DrainResult } from './queueDrain'
import { currentUserId } from './sessionUser'
import { queueSize, savedOnDeviceItems } from './uploadQueue'

/**
 * The drain trigger.
 *
 * The queue drains on the two events the story names:
 *
 *   * **connectivity regain** — a network-state listener;
 *   * **app foreground** — an `AppState` transition to `active`.
 *
 * Neither may block the foreground UI. The drain runs off the render path and
 * is **cancellable**: a second trigger while a drain is already running is
 * ignored rather than queued, so a burst of connectivity events cannot fire a
 * burst of uploads.
 *
 * The hook also reports the queue's state so a screen can surface the "saved
 * on device" notice — which is a **state**, not an error. The evidence is
 * safe, and the user is told the truth about it.
 *
 * It is mounted by the signed-in layout, so the queue empties from whichever
 * screen the user is on when the network returns; the Capture screen mounts it
 * too, for the counts. The drain itself is shared (see `drainQueue`), so two
 * mounts do not upload anything twice.
 */

export interface QueueState {
  /** The number of items still waiting to be sent. */
  pending: number
  /** The number of items that have exhausted their attempt budget. */
  savedOnDevice: number
  /** `true` while a drain is running. */
  isDraining: boolean
  /** The last drain's outcome, or `null` if none has run. */
  lastResult: DrainResult | null
  /** Runs a drain now. */
  drain: () => Promise<void>
}

export function useQueueDrain(): QueueState {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(0)
  const [savedOnDevice, setSavedOnDevice] = useState(0)
  const [isDraining, setIsDraining] = useState(false)
  const [lastResult, setLastResult] = useState<DrainResult | null>(null)

  // The in-flight guard. A ref, not a state — a state update would not be
  // visible to the second trigger before the re-render, so two events in the
  // same tick could both start a drain.
  const draining = useRef(false)

  // Counted for the signed-in user only: another account's unsent reports are
  // not theirs to see, or to be told are "saved on device".
  const refreshCounts = useCallback(async () => {
    const userId = await currentUserId()
    if (!userId) {
      setPending(0)
      setSavedOnDevice(0)
      return
    }
    const [waiting, retained] = await Promise.all([queueSize(userId), savedOnDeviceItems(userId)])
    setPending(waiting)
    setSavedOnDevice(retained.length)
  }, [])

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    setIsDraining(true)

    try {
      const result = await drainQueue()
      setLastResult(result)
      // A queued report that has landed is new to History and the feed; without
      // this they show it only after their staleTime has run out.
      if (result.sent > 0) {
        void queryClient.invalidateQueries({ queryKey: ['history'] })
        void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      }
    } catch {
      // The drain itself failed. The queue is untouched — the items are still
      // on the device, and the next trigger tries again.
    } finally {
      draining.current = false
      setIsDraining(false)
      await refreshCounts()
    }
  }, [queryClient, refreshCounts])

  // The counts are read on mount so a screen opened with a queue already
  // present shows the "saved on device" state immediately — and the queue is
  // tried once, so a report saved while the app could not send it goes out
  // when the screen opens, not only after the network changes or the app
  // comes back from the background.
  useEffect(() => {
    void refreshCounts()
    void drain()
  }, [refreshCounts, drain])

  // --- Connectivity regain --------------------------------------------------
  //
  // `expo-network` reports the **connection type**, not a boolean "is
  // online". The signal that matters is "the connection changed", and the
  // drain itself decides whether the device can actually reach the network —
  // a failed attempt is retried with backoff rather than dropped.
  useEffect(() => {
    let cancelled = false

    const subscription = Network.addNetworkStateListener((state) => {
      if (cancelled) return
      if (!state.isInternetReachable && !state.isConnected) return

      void drain()
    })

    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [drain])

  // --- Sign-in ----------------------------------------------------------------
  //
  // A different account may sign in while this hook is mounted (the signed-in
  // layout outlives a sign-out and sign-in only when the app is not left). The
  // counts and the drain follow the new user.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return
      void refreshCounts()
      if (event === 'SIGNED_IN') void drain()
    })

    return () => data.subscription.unsubscribe()
  }, [drain, refreshCounts])

  // --- App foreground -------------------------------------------------------
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return
      void drain()
    })

    return () => subscription.remove()
  }, [drain])

  return { pending, savedOnDevice, isDraining, lastResult, drain }
}

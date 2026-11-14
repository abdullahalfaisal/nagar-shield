import { useCallback, useEffect, useState } from 'react'
import {
  readDegradedState,
  needsManualDialGuidance,
  powerSaveWarningIsUseful,
  UNKNOWN_DEGRADED_STATE,
  type DegradedState,
} from './degradation'
import { openDialer } from './dialer'

/**
 * The degraded-mode help flow.
 *
 * Story `003-help-seek / 004-graceful-degradation`. This hook is the shared
 * behaviour behind the manual-dial guidance, so every help entry point — the
 * Police / Medical / Fire cards, the hotline rows, the thana line — reacts to
 * the device state in exactly the same way.
 *
 * ## The dial path makes zero network requests
 *
 * The whole flow is client-only: the number comes from the bundled dataset
 * and the intent goes straight to the OS. The **only** thing this hook reads
 * is the device state, and it reads it from the OS — never from the server.
 * A citizen with no signal still reaches help.
 *
 * ## What the hook never claims
 *
 * `openDialer` returns whether the OS dialler was reached. It does not tell us
 * a call was placed, connected, or delivered — the app never learns that, and
 * C-1 forbids asking. So the guidance this hook drives says only what is
 * true: *this is the number, dial it yourself*.
 */
export interface UseDegradedHelpResult {
  /** The device state. The unknown state until the first read lands. */
  degraded: DegradedState
  /**
   * The number to show in the manual-dial guidance, or `null` when there is
   * nothing to guide the user towards.
   */
  guidanceNumber: string | null
  /** Whether the manual-dial guidance should be visible. */
  showGuidance: boolean
  /** Whether the battery-saver warning should appear alongside it. */
  showPowerSaveWarning: boolean
  /** Whether the offline notice should appear alongside it. */
  showOfflineNotice: boolean
  /**
   * Dials a number and updates the guidance.
   *
   * Returns whether the OS dialler was reached. A `false` return means the
   * guidance is now visible — never an unhandled error.
   */
  dial: (number: string) => Promise<boolean>
}

export function useDegradedHelp(): UseDegradedHelpResult {
  const [degraded, setDegraded] = useState<DegradedState>(UNKNOWN_DEGRADED_STATE)
  const [guidanceNumber, setGuidanceNumber] = useState<string | null>(null)
  const [dialerOpened, setDialerOpened] = useState(true)

  // The device state is read **once per mount** of the help surface, not
  // cached across sessions: the story requires the warning to reflect the
  // state at the moment the help action is opened.
  useEffect(() => {
    let cancelled = false

    void readDegradedState().then((state) => {
      if (!cancelled) setDegraded(state)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const dial = useCallback(async (number: string) => {
    const opened = await openDialer(number)
    setDialerOpened(opened)
    // The guidance shows the number **always** once a dial has been
    // attempted, because the app cannot know whether the user actually
    // pressed call — and a number on screen costs nothing.
    setGuidanceNumber(number)
    return opened
  }, [])

  const showGuidance = guidanceNumber !== null && needsManualDialGuidance(degraded, dialerOpened)

  return {
    degraded,
    guidanceNumber,
    showGuidance,
    showPowerSaveWarning: showGuidance && powerSaveWarningIsUseful(degraded),
    showOfflineNotice: showGuidance && degraded.isOffline,
    dial,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
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
 *
 * ## The state is read fresh, not pinned
 *
 * The read runs on mount and again on every return to the foreground. A
 * single read pinned for the whole visit would be wrong twice: the state can
 * change while the app is away (the dialer is such an absence), and a mount
 * read that failed once would pin `'unknown'` — which the warning treats as
 * "worth warning about" — for the rest of the visit.
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
  // The generation of the in-flight read. A foreground bounce (dialer → app)
  // triggers a re-read while a mount read may still be in flight; only the
  // newest read is allowed to land, so a slower older read can never overwrite
  // a fresher one.
  const readGeneration = useRef(0)

  const readState = useCallback(() => {
    const generation = ++readGeneration.current
    void readDegradedState().then((state) => {
      if (readGeneration.current === generation) setDegraded(state)
    })
  }, [])

  // The device state is read when the help surface mounts, and **again every
  // time the app returns to the foreground** — the reads are OS calls, cost
  // nothing, and the state can change while the app is away. The dialer is
  // exactly such an absence: the user leaves for it and comes back, and the
  // warning they see must reflect the state at that return, not a value a
  // mount-time read happened to catch (or failed to catch — a single failed
  // read would otherwise pin `'unknown'`, and `'unknown'` is treated as
  // "worth warning about", for the rest of the visit).
  useEffect(() => {
    readState()
  }, [readState])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') readState()
    })
    return () => subscription.remove()
  }, [readState])

  const dial = useCallback(async (number: string) => {
    const opened = await openDialer(number)
    setDialerOpened(opened)
    // The number is remembered once a dial has been attempted; **whether** the
    // guidance renders is the gate in `needsManualDialGuidance`. A healthy
    // dial — dialer opened, online, power saving off — leaves the screen
    // quiet; a degraded one (or an unresolved intent) puts the number in
    // front of the user.
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

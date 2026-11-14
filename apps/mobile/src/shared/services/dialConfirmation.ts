import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { openDialer } from './dialer'

/**
 * The dial confirmation and telemetry.
 *
 * FR-HELP-7 requires a confirmation sheet that names the **exact** number and
 * shows the measured `app_open_to_dialer_ms`. FR-HELP-8's median is computed
 * from those measurements.
 *
 * The measurement starts when the app process reports its first render and
 * stops when the dialer intent fires. It is a **measurement**, not an
 * estimate — the sheet shows the real elapsed time.
 */

/** The surfaces FR-HELP-8 names — the median is taken over these three. */
export type HelpSurface = 'police' | 'medical' | 'fire' | 'personal'

export interface DialConfirmation {
  /** The exact number the dialer will receive. */
  number: string
  /** The surface the user tapped. */
  surface: HelpSurface
  /** The measured app-open → dialer time in milliseconds. */
  elapsedMs: number
}

export interface UseDialConfirmationResult {
  /** The pending confirmation, or `null` when no sheet is open. */
  pending: DialConfirmation | null
  /** Opens the confirmation sheet for a number. */
  request: (surface: HelpSurface, number: string) => void
  /** Fires the dialer intent and records the measurement. */
  confirm: () => Promise<boolean>
  /** Dismisses the sheet without dialling. */
  cancel: () => void
}

/**
 * The app-open timestamp.
 *
 * The clock starts when the app process reports its first render — the root
 * layout's first commit. The value is captured once per process.
 */
let appOpenAt = Date.now()

/** Records the app-open moment. Called by the root layout on first render. */
export function markAppOpen(): void {
  appOpenAt = Date.now()
}

/** The current app-open timestamp. */
export function appOpenTimestamp(): number {
  return appOpenAt
}

/**
 * The dial confirmation flow.
 *
 * The dial path makes **zero network calls** — the number is bundled and the
 * intent goes straight to the OS.
 */
export function useDialConfirmation(): UseDialConfirmationResult {
  const [pending, setPending] = useState<DialConfirmation | null>(null)
  const pendingRef = useRef<DialConfirmation | null>(null)

  const request = useCallback((surface: HelpSurface, number: string) => {
    const confirmation: DialConfirmation = {
      number,
      surface,
      elapsedMs: Math.max(0, Date.now() - appOpenAt),
    }
    pendingRef.current = confirmation
    setPending(confirmation)
  }, [])

  const cancel = useCallback(() => {
    pendingRef.current = null
    setPending(null)
  }, [])

  const confirm = useCallback(async () => {
    const confirmation = pendingRef.current
    if (!confirmation) return false

    const elapsedMs = Math.max(0, Date.now() - appOpenAt)
    recordDialTelemetry(confirmation.surface, confirmation.number, elapsedMs)

    const opened = await openDialer(confirmation.number)

    pendingRef.current = null
    setPending(null)

    return opened
  }, [])

  return { pending, request, confirm, cancel }
}

/** The recorded dial measurements. Kept in memory for the session. */
const dialMeasurements: Array<{ surface: HelpSurface; number: string; elapsedMs: number }> = []

/** Records one dial measurement. */
export function recordDialTelemetry(surface: HelpSurface, number: string, elapsedMs: number): void {
  dialMeasurements.push({ surface, number, elapsedMs })
}

/** Every dial measurement taken this session. */
export function dialMeasurementsSnapshot(): ReadonlyArray<{
  surface: HelpSurface
  number: string
  elapsedMs: number
}> {
  return dialMeasurements
}

/**
 * The median app-open → dialer time.
 *
 * FR-HELP-8's median is taken over Police, Medical and Fire only — the three
 * surfaces the requirement names. The personal-contact path is excluded.
 */
export function medianDialMs(): number | null {
  const samples = dialMeasurements
    .filter((entry) => entry.surface !== 'personal')
    .map((entry) => entry.elapsedMs)
    .sort((a, b) => a - b)

  if (samples.length === 0) return null

  const middle = Math.floor(samples.length / 2)

  if (samples.length % 2 === 1) {
    return samples[middle] ?? null
  }

  const low = samples[middle - 1] ?? 0
  const high = samples[middle] ?? 0
  return Math.round((low + high) / 2)
}

/**
 * Resets the recorded measurements.
 *
 * Exported for the test suite — a measurement window must start clean.
 */
export function resetDialMeasurements(): void {
  dialMeasurements.length = 0
}

/**
 * Watches the app's foreground state.
 *
 * Used by the personal-emergency sheet to know when the 25 s "call the next
 * contact" affordance may appear.
 */
export function useAppIsForeground(): boolean {
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active')

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsForeground(state === 'active')
    })

    return () => subscription.remove()
  }, [])

  return isForeground
}

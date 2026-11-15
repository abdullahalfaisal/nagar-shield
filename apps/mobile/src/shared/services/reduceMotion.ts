import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * The reduce-motion preference.
 *
 * Story `006-alerts / 002-auto-refresh-and-pull-to-refresh`, criterion #10:
 *
 * > **Given** the operating system's **reduce-motion** setting is **on**, **When**
 * > the feed header renders, **Then** the pulsing dot does **not** animate — the
 * > dot and its label are still shown, and the label text is unchanged
 *
 * React Native **0.88** ships both the reader and the change event, so this
 * costs **no new dependency**:
 *
 *   * `AccessibilityInfo.isReduceMotionEnabled()` — the current reading;
 *   * the `reduceMotionChanged` event — fired when the user flips the
 *     setting while the app is running.
 *
 * The reading starts **`false`**. An unreadable setting is not a request to
 * reduce motion: guessing "on" would silently freeze the app for a user who
 * never asked for it.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let cancelled = false

    const read = async () => {
      try {
        const enabled = await AccessibilityInfo.isReduceMotionEnabled()
        if (cancelled) return
        setReduceMotion(enabled)
      } catch {
        // A setting that cannot be read is not a request to reduce motion.
        if (!cancelled) setReduceMotion(false)
      }
    }

    void read()

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled)
    })

    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])

  return reduceMotion
}

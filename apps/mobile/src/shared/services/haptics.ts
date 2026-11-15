/**
 * Haptic feedback, behind one helper.
 *
 * `expo-haptics` needs a native module that is missing under Jest and on some
 * devices, so it is required lazily and every call is allowed to fail: a
 * haptic is a nicety and must never take a screen down.
 */
import type * as ExpoHaptics from 'expo-haptics'

export type HapticKind = 'tap' | 'success' | 'warning' | 'error'

type HapticsModule = typeof ExpoHaptics

function load(): HapticsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-haptics')
  } catch {
    return null
  }
}

/** Swallows a failed haptic: the native call can reject after the sync part returned. */
function ignore(result: Promise<unknown>): void {
  result.catch(() => undefined)
}

export function haptic(kind: HapticKind): void {
  const Haptics = load()
  if (!Haptics) return

  try {
    switch (kind) {
      case 'tap':
        ignore(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
        break
      case 'success':
        ignore(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
        break
      case 'warning':
        ignore(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))
        break
      case 'error':
        ignore(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
        break
    }
  } catch {
    // A failed haptic is not worth reporting.
  }
}

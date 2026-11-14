import { Linking } from 'react-native'

/**
 * Opens the device dialler for a number.
 *
 * This is a **zero-network, client-only** path. The app never places a call,
 * never observes call state, and never learns whether a call was answered
 * (constraint C-1, FR-HELP-2). `Linking.openURL('tel:…')` hands the number to
 * the OS dialler and the user presses call.
 *
 * If the device has no tel: handler the function resolves `false` so the
 * caller can show a fallback.
 */
export async function openDialer(number: string): Promise<boolean> {
  const normalized = number.replace(/[^\d+]/g, '')
  try {
    const supported = await Linking.canOpenURL(`tel:${normalized}`)
    if (!supported) return false
    await Linking.openURL(`tel:${normalized}`)
    return true
  } catch {
    return false
  }
}

/** Emergency numbers are dialled as bare digits — `tel:999`, not `tel:+880999`. */
export function dialTarget(number: string): string {
  return number.replace(/[^\d+]/g, '')
}

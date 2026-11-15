import * as SMS from 'expo-sms'
import type { OsShareOutcome } from '@/shared/services/osShare'

/**
 * One message to many people.
 *
 * Opens the phone's own message composer with **every** recipient and the text
 * already filled in. The user taps Send once — the app never sends an SMS
 * itself, because neither iOS nor (for this kind of app) Google Play lets an
 * app do that silently.
 *
 * Like the OS share sheet, this is **fire and stop**: the composer belongs to
 * the OS. On Android the result is always "unknown", so anything other than an
 * explicit cancel counts as handed over — never as delivered.
 *
 * `unavailable` means the device has no message app (a tablet, a simulator);
 * the caller falls back to the share sheet.
 */
export async function fireSmsShare(addresses: string[], message: string): Promise<OsShareOutcome> {
  if (addresses.length === 0 || message.trim().length === 0) {
    return { status: 'unavailable' }
  }

  try {
    if (!(await SMS.isAvailableAsync())) return { status: 'unavailable' }

    const { result } = await SMS.sendSMSAsync(addresses, message)

    return result === 'cancelled' ? { status: 'dismissed' } : { status: 'shared' }
  } catch {
    return { status: 'unavailable' }
  }
}

import { Platform, Share } from 'react-native'
import * as Sharing from 'expo-sharing'

/**
 * The OS share sheet.
 *
 * **Fire and stop.** `fireOsShare` presents the sheet and returns. The app
 * has no visibility into the target the user picked, and no visibility into
 * what happened next — the targets (SMS, WhatsApp, …) and the delivery
 * outcome belong to the OS and the carrier, entirely outside the app.
 *
 * That is exactly why the confirmation copy says **shared** / **sent** and
 * never **delivered** / **read** / **seen** (ADR-005). A delivery claim
 * would be a fabrication, and the app has no way to earn one.
 *
 * **The path needs no network.** The sheet is an OS intent: the payload is
 * handed over and the OS takes it from there. This is the strong path — the
 * in-app audit write needs a connection, this one does not.
 *
 * **The payload is plain text.** The same `message` that
 * `buildSnapshotPayload` produces: the `geo:` URI, the Google Maps URL, and
 * the human-readable timestamp. Never HTML, never a rendered view.
 */

/** What happened when the sheet was presented. */
export type OsShareOutcome =
  /** The sheet was presented and resolved. It may or may not have been sent. */
  | { status: 'shared' }
  /** The user dismissed the sheet without picking a target. Nothing was sent. */
  | { status: 'dismissed' }
  /** The OS refused to present the sheet. Nothing was sent. */
  | { status: 'unavailable' }

/**
 * Presents the OS share sheet with the given message.
 *
 * The message is the **whole** payload — all three parts, never truncated
 * away to fit. A payload without a timestamp fails the story's contract,
 * and the three parts together are what makes the snapshot usable on a
 * device with no maps app and no `geo:` handler.
 *
 * `expo-sharing` is preferred; the React Native `Share` module is the
 * fallback. Both are thin intent wrappers, and neither reports a delivery
 * outcome — the RN `Share` API's resolved action only tells us the sheet was
 * dismissed.
 */
export async function fireOsShare(message: string): Promise<OsShareOutcome> {
  if (message.trim().length === 0) {
    return { status: 'unavailable' }
  }

  // `expo-sharing` is the preferred path on both platforms.
  try {
    const available = await Sharing.isAvailableAsync()

    if (available) {
      await Sharing.shareAsync(message, {
        mimeType: 'text/plain',
        dialogTitle: undefined,
        UTI: 'public.plain-text',
      })
      return { status: 'shared' }
    }
  } catch {
    // Fall through to the React Native `Share` module. A device where
    // `expo-sharing` refuses is exactly the device where the fallback is
    // needed.
  }

  // The fallback. It is a thin intent wrapper of its own.
  try {
    const result = await Share.share(
      { message },
      // Android's `Share.share` resolves with the dismissed action when the
      // user backs out of the sheet. It never reports a delivery.
      { dialogTitle: undefined },
    )

    if (result.action === Share.dismissedAction) {
      return { status: 'dismissed' }
    }

    return { status: 'shared' }
  } catch {
    // The OS threw — there is no app that can receive a shared text, or the
    // sheet could not be presented. Nothing was sent, and the caller must
    // say so plainly.
    return { status: 'unavailable' }
  }
}

/**
 * Whether the device can present a share sheet at all.
 *
 * The screen uses it to decide whether to offer the OS path at all. It is
 * a best-effort probe: a failure answers `false`, and the app falls back
 * to the in-app path.
 */
export async function canShare(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      return await Sharing.isAvailableAsync()
    }

    return true
  } catch {
    return false
  }
}

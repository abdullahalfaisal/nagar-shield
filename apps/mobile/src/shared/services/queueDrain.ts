import { File } from 'expo-file-system'
import * as Network from 'expo-network'
import { AppError } from '@nagar-shield/shared'
import {
  QUEUE_MAX_ATTEMPTS,
  claimUnowned,
  deleteDraftMedia,
  dueItems,
  isOwnedBy,
  markAttemptFailed,
  readQueue,
  removeFromQueue,
  type QueuedUpload,
} from './uploadQueue'
import { currentUserId } from './sessionUser'
import { submitCapture } from './submitCapture'

/**
 * The offline queue's drain.
 *
 * A queued report is **evidence**. It stays on the device until it has
 * actually landed, and it is retried on the two events the story names:
 * connectivity regain and app foreground. The drain runs off the render path,
 * so the user is never waiting behind it.
 *
 * Three rules shape everything here:
 *
 *   * **Idempotency.** The item's `clientRequestId` was fixed when it was
 *     enqueued, so a retry of a submit whose response was lost in transit
 *     returns the **original** `report_id` rather than creating a second
 *     report. A duplicate report is a privacy problem as much as a data
 *     problem, so this is not an optimisation.
 *   * **The attempt count is incremented before the attempt is recorded.**
 *     An attempt interrupted by the OS killing the app must not be retried
 *     forever as a free attempt, so the count moves first.
 *   * **A non-retryable error drops the item.** Retrying an invalid payload
 *     cannot succeed, so the item is dropped and the user is told.
 *
 * Three more rules keep the queue honest:
 *
 *   * **Only the author's session sends an item.** The queue is shared by
 *     everyone who uses the phone. A report is the author's evidence, so
 *     another account that signs in leaves it alone — it would otherwise be
 *     filed in that account's history.
 *   * **An offline phone does not spend attempts.** The three-attempt budget
 *     is for a network that is there and failing, not for one that is absent;
 *     counting an airplane-mode launch as a failure used up the budget before
 *     the signal ever came back.
 *   * **One drain at a time.** The drain is started from the signed-in layout
 *     and from the Capture screen; they share one run rather than uploading
 *     the same item twice.
 */

/** The result code for a queued item whose file has gone from the phone. */
export const MEDIA_MISSING = 'MEDIA_MISSING'

/** What the drain did with one item. */
export type DrainOutcome =
  | { status: 'sent'; reportId: string }
  | { status: 'retry'; attempts: number; savedOnDevice: boolean }
  | { status: 'rejected'; code: string }
  | { status: 'skipped' }

export interface DrainResult {
  sent: number
  retried: number
  rejected: number
  savedOnDevice: number
}

/**
 * The errors a retry cannot fix.
 *
 * A transport failure is retried. A rate limit is retried — it is not a
 * media or validation failure, and the item is simply retried later. A
 * validation or media rejection is **not** retried: the payload is invalid,
 * so every attempt would fail the same way.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof AppError)) return true

  switch (error.code) {
    // The network. The whole point of the queue.
    case 'INTERNAL':
      return true
    // A rate limit is a server-side throttle, not a bad payload.
    case 'CAPTURE_RATE_LIMIT':
      return true
    // A session problem resolves on the next foreground.
    case 'AUTH_REQUIRED':
      return true
    // Everything else — a validation failure, a media cap, a forbidden write
    // — would fail identically on every retry.
    default:
      return false
  }
}

/**
 * Retries one queued item.
 *
 * The attempt count moves **before** the attempt is made, so an attempt
 * interrupted by the OS cannot be retried forever as a free attempt.
 */
export async function drainItem(item: QueuedUpload): Promise<DrainOutcome> {
  // A queued file the OS has removed can never be sent. Trying would burn the
  // attempts and then leave an item that holds a place in the queue for good,
  // so it is written off at once.
  if (!draftExists(item.mediaUri)) {
    await removeFromQueue(item.clientRequestId)
    return { status: 'rejected', code: MEDIA_MISSING }
  }

  // The attempt is recorded first, and it is recorded **once**. If the app
  // dies mid-upload, the count has already moved, so the next launch
  // continues from the persisted count rather than treating the interrupted
  // attempt as free. Recording it a second time after a failure would burn
  // two attempts on one failure.
  const attempted = await markAttemptFailed(item.clientRequestId)
  const attempts = attempted?.attempts ?? item.attempts + 1

  try {
    const result = await submitCapture({
      clientRequestId: item.clientRequestId,
      media: {
        uri: item.mediaUri,
        mediaType: item.mediaType,
        byteSize: item.byteSize,
        durationSeconds: item.durationSeconds,
        width: item.width,
        height: item.height,
        contentType: item.contentType,
        extension: item.extension,
      },
      lat: item.lat,
      lng: item.lng,
      capturedAt: item.capturedAt,
      description: item.description,
      publicVisibility: item.publicVisibility,
      category: item.category ?? null,
      areaId: item.areaId ?? null,
      placeDetail: item.placeDetail ?? null,
    })

    // The report landed. The item leaves the queue and its draft is deleted.
    await removeFromQueue(item.clientRequestId)
    await deleteDraftMedia(item.mediaUri)

    return { status: 'sent', reportId: result.reportId }
  } catch (error) {
    if (!isRetryable(error)) {
      // The payload is invalid — retrying cannot succeed. The item leaves the
      // queue and the user is told it was rejected.
      await removeFromQueue(item.clientRequestId)
      await deleteDraftMedia(item.mediaUri)

      const code = error instanceof AppError ? error.code : 'INTERNAL'
      return { status: 'rejected', code }
    }

    // A transport failure. The item keeps its place — the attempt was already
    // counted above — and waits for the next drain.
    return {
      status: 'retry',
      attempts,
      savedOnDevice: attempts >= QUEUE_MAX_ATTEMPTS,
    }
  }
}

function draftExists(uri: string): boolean {
  try {
    return new File(uri).exists
  } catch {
    // A file that cannot even be looked up is treated as present: the upload
    // will fail on its own and be retried, which is safer than deleting it.
    return true
  }
}

/** Whether the phone reports no network, so a drain could only fail. */
async function isOffline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync()
    return state.isConnected === false || state.isInternetReachable === false
  } catch {
    // Not knowing is not offline: let the attempt find out.
    return false
  }
}

const EMPTY_RESULT: DrainResult = { sent: 0, retried: 0, rejected: 0, savedOnDevice: 0 }

let running: Promise<DrainResult> | null = null

/**
 * Drains the signed-in user's due items, one at a time.
 *
 * A call while a drain is running returns that drain's result instead of
 * starting another.
 */
export function drainQueue(now: number = Date.now()): Promise<DrainResult> {
  if (running) return running

  running = runDrain(now).finally(() => {
    running = null
  })
  return running
}

/**
 * The drain is **sequential**: the items go in order, each one waits for the
 * previous to finish. A parallel drain would fire a burst of uploads the
 * moment the signal came back, which is exactly what the backoff schedule
 * exists to avoid.
 */
async function runDrain(now: number): Promise<DrainResult> {
  const userId = await currentUserId()
  if (!userId) return { ...EMPTY_RESULT }

  if (await isOffline()) return { ...EMPTY_RESULT }

  await claimUnowned(userId)

  const queue = await readQueue()
  const due = dueItems(
    queue.filter((item) => !item.authorId || isOwnedBy(item, userId)),
    now,
  )

  const result: DrainResult = { ...EMPTY_RESULT }

  for (const item of due) {
    const outcome = await drainItem(item)

    switch (outcome.status) {
      case 'sent':
        result.sent += 1
        break
      case 'retry':
        result.retried += 1
        if (outcome.savedOnDevice) result.savedOnDevice += 1
        break
      case 'rejected':
        result.rejected += 1
        break
      case 'skipped':
        break
    }
  }

  return result
}

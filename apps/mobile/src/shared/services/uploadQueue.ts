import { Directory, File, Paths } from 'expo-file-system'
import type { PublicVisibility, ReportCategory } from '@nagar-shield/shared'
import type { PreparedMedia } from './mediaPipeline'

/**
 * The offline upload queue.
 *
 * A failed upload must never trap the user. The item is written to the app
 * sandbox, the user can start the next capture immediately, and the queue
 * drains with exponential backoff up to **3 attempts** before the item is
 * retained as "saved on device".
 *
 * The queue lives in the app sandbox — never in AsyncStorage, and never
 * alongside the session token.
 *
 * It lives in the **document** directory, not the cache. The OS may empty the
 * cache whenever storage runs low, and a queued report is evidence the citizen
 * has not yet delivered — losing it silently is not acceptable. A draft moves
 * out of the cache into the same directory when it is queued, so the file and
 * the entry that points at it survive together.
 *
 * Every entry records **who** queued it (`authorId`). The queue is shared by
 * everyone who uses the phone, but an entry is only ever sent by its author's
 * session: another account that signs in finds it untouched and unseen, and it
 * is still there when its author returns. Signing out therefore does not
 * discard it.
 *
 * Every change to the queue file runs through `withQueueLock`, one at a time.
 * Each change is a read followed by a write, and two of them interleaving —
 * a drain removing a sent report while the user queues a new one — would let
 * the later write drop the other's change.
 */

/** The maximum number of queued items. */
export const QUEUE_MAX_ITEMS = 20

/** The maximum number of attempts before the item is kept on the device. */
export const QUEUE_MAX_ATTEMPTS = 3

/**
 * How long an item kept on the device waits before it is tried again.
 *
 * Keeping an item is not giving up on it. The banner says it will be sent when
 * the network returns, so it keeps being tried — slowly, since the quick
 * retries have already failed.
 */
export const SAVED_RETRY_MS = 6 * 60 * 60 * 1000

export interface QueuedUpload {
  clientRequestId: string
  /**
   * The user who queued it. Entries saved before this field existed have none;
   * the first user to drain them takes them over (see `claimUnowned`).
   */
  authorId?: string | null
  mediaUri: string
  mediaType: 'photo' | 'video' | 'file'
  byteSize: number
  durationSeconds: number | null
  width: number | null
  height: number | null
  contentType: string
  extension: string
  lat: number
  lng: number
  capturedAt: string
  description: string | null
  publicVisibility: PublicVisibility
  /** Optional: entries saved before the incident type existed have none. */
  category?: ReportCategory | null
  areaId?: string | null
  placeDetail?: string | null
  attempts: number
  /** The epoch millisecond before which no attempt may run. */
  nextAttemptAt: number
  /** `true` once the attempt budget is exhausted. */
  savedOnDevice: boolean
}

/** The directory the queue and its drafts live in. Not cleared by the OS. */
function queueDirectory(): Directory {
  const directory = new Directory(Paths.document, 'nagar-shield-queue')
  if (!directory.exists) {
    directory.create({ intermediates: true })
  }
  return directory
}

/** The queue file. A JSON document in the app sandbox. */
function queueFile(): File {
  const file = new File(queueDirectory(), 'upload-queue.json')
  if (!file.exists) moveLegacyQueue(file)
  return file
}

/**
 * Carries a queue written by an earlier build, which kept it in the cache,
 * over to the document directory — once, the first time the queue is read.
 */
function moveLegacyQueue(target: File): void {
  try {
    const legacy = new File(new Directory(Paths.cache, 'nagar-shield-media'), 'upload-queue.json')
    if (!legacy.exists) return
    target.write(legacy.textSync())
    legacy.delete()
  } catch {
    // Nothing to carry over, or the old file is unreadable — start empty.
  }
}

/**
 * Moves a prepared draft out of the cache into the queue directory, and
 * returns where it now lives. If the move fails the draft stays where it is:
 * the upload still works, it is only exposed to a cache clear again.
 */
function keepDraft(uri: string): string {
  try {
    const source = new File(uri)
    if (!source.exists) return uri
    const name = uri.split('/').pop() ?? `draft-${Date.now()}`
    const target = new File(queueDirectory(), name)
    source.move(target)
    return target.uri
  } catch {
    return uri
  }
}

/** Reads the queue. A missing or corrupt file reads as an empty queue. */
export async function readQueue(): Promise<QueuedUpload[]> {
  const file = queueFile()

  if (!file.exists) return []

  try {
    const parsed = JSON.parse(await file.text()) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueuedUpload)
  } catch {
    return []
  }
}

let queueTail: Promise<unknown> = Promise.resolve()

/** Runs a queue change after every change before it has finished. */
function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(task, task)
  queueTail = run.catch(() => undefined)
  return run
}

/** Writes the queue, bounded to `QUEUE_MAX_ITEMS`. */
export async function writeQueue(items: QueuedUpload[]): Promise<void> {
  const file = queueFile()
  const bounded = items.slice(0, QUEUE_MAX_ITEMS)
  file.write(JSON.stringify(bounded))
}

/** The enqueue input. */
export interface EnqueueInput {
  clientRequestId: string
  /** The signed-in user, so only their session sends the report. */
  authorId?: string | null
  media: PreparedMedia
  lat: number
  lng: number
  capturedAt: string
  description: string | null
  publicVisibility: PublicVisibility
  category?: ReportCategory | null
  areaId?: string | null
  placeDetail?: string | null
}

/** Builds the queue entry for a capture. */
function toQueuedUpload(input: EnqueueInput): QueuedUpload {
  return {
    clientRequestId: input.clientRequestId,
    authorId: input.authorId ?? null,
    mediaUri: keepDraft(input.media.uri),
    mediaType: input.media.mediaType,
    byteSize: input.media.byteSize,
    durationSeconds: input.media.durationSeconds,
    width: input.media.width,
    height: input.media.height,
    contentType: input.media.contentType,
    extension: input.media.extension,
    lat: input.lat,
    lng: input.lng,
    capturedAt: input.capturedAt,
    description: input.description,
    publicVisibility: input.publicVisibility,
    category: input.category ?? null,
    areaId: input.areaId ?? null,
    placeDetail: input.placeDetail ?? null,
    attempts: 0,
    nextAttemptAt: 0,
    savedOnDevice: false,
  }
}

/**
 * Adds a capture to the queue.
 *
 * The item **keeps** the `clientRequestId` of the attempt that failed. That
 * key is the idempotency guarantee: the retry sends the same key, so
 * `finalize_capture` returns the **original** `report_id` instead of
 * creating a second report. Generating a fresh key here would break that
 * guarantee — a submit whose response was lost in transit would land twice.
 */
export async function enqueueUpload(input: EnqueueInput): Promise<QueuedUpload> {
  return withQueueLock(async () => {
    const item = toQueuedUpload(input)

    const queue = await readQueue()
    queue.unshift(item)
    await writeQueue(queue)

    return item
  })
}

/**
 * Enqueues and reports what the bound cost.
 *
 * The queue holds at most `QUEUE_MAX_ITEMS`. The 21st item evicts the
 * **oldest**, and the eviction is reported — silently deleting a citizen's
 * evidence is not acceptable, so the caller surfaces a warning.
 *
 * The eviction is detected **here**, before the queue is written, rather than
 * being inferred from the truncation `writeQueue` performs. Inferring it
 * after the fact would mean reading back a queue that has already lost its
 * oldest item — the eviction would never be reported, and the user would
 * never learn that a report was dropped.
 */
export async function enqueueUploadBounded(
  input: EnqueueInput,
): Promise<{ item: QueuedUpload; dropped: QueuedUpload | null }> {
  return withQueueLock(async () => {
    const queue = await readQueue()

    // The queue is newest-first, so the tail is the oldest item.
    const dropped = queue.length >= QUEUE_MAX_ITEMS ? (queue[queue.length - 1] ?? null) : null

    const item = toQueuedUpload(input)
    queue.unshift(item)
    await writeQueue(queue)

    return { item, dropped }
  })
}

/**
 * The exponential-backoff schedule.
 *
 * The first retry waits 30 s, the second 2 minutes, the third 8 minutes.
 * The wait grows with the attempt count so a failing network is not hammered.
 */
export function backoffDelayMs(attempts: number): number {
  const base = 30_000
  return base * Math.pow(4, Math.max(0, attempts - 1))
}

/**
 * The items that are due for another attempt.
 *
 * An item whose attempt budget is exhausted is kept on the device as "saved on
 * device". It is not given up on: it comes due again every `SAVED_RETRY_MS`.
 *
 * **The backoff is a floor, not a wall.** The schedule keeps a failing
 * network from being hammered, but a device with a wrong clock — set days
 * ahead — would otherwise strand every queued report until the clock caught
 * up. A report waiting longer than `BACKOFF_CEILING_MS` is therefore treated
 * as due regardless of its stored `nextAttemptAt`. The evidence must not be
 * held hostage by a bad timestamp.
 */
export function dueItems(items: QueuedUpload[], now: number = Date.now()): QueuedUpload[] {
  return items.filter((item) => {
    if (item.nextAttemptAt <= now) return true

    // The stored timestamp sits in the future — far enough ahead that the
    // device clock is wrong rather than the backoff merely pending. A kept
    // item legitimately waits much longer than a backing-off one.
    const ceiling = item.savedOnDevice ? SAVED_RETRY_MS + BACKOFF_CEILING_MS : BACKOFF_CEILING_MS
    return item.nextAttemptAt - now >= ceiling
  })
}

/**
 * The longest a backoff may hold an item.
 *
 * The schedule itself tops out at 8 minutes (the third retry), so a ceiling
 * of 30 minutes is generous: it only ever fires for a timestamp that is
 * genuinely unreachable, never for a legitimate backoff.
 */
export const BACKOFF_CEILING_MS = 30 * 60 * 1000

/**
 * Records a failed attempt.
 *
 * After `QUEUE_MAX_ATTEMPTS` failures the item is kept on the device.
 *
 * The count moves **before** the attempt is made, so an attempt interrupted by
 * the OS killing the app cannot be retried forever as a free attempt. This
 * function is therefore the *only* place the counter moves — the drain calls
 * it once per attempt, before the upload, and never a second time after a
 * failure. Calling it twice would burn two attempts on one failure and the
 * item would hit the 3-attempt cut-off after one and a half real attempts.
 */
export async function markAttemptFailed(
  clientRequestId: string,
  now: number = Date.now(),
): Promise<QueuedUpload | null> {
  return withQueueLock(async () => {
    const queue = await readQueue()
    const index = queue.findIndex((item) => item.clientRequestId === clientRequestId)

    if (index < 0) return null

    const item = queue[index]
    if (!item) return null

    const attempts = item.attempts + 1
    const savedOnDevice = attempts >= QUEUE_MAX_ATTEMPTS

    queue[index] = {
      ...item,
      attempts,
      savedOnDevice,
      nextAttemptAt: now + (savedOnDevice ? SAVED_RETRY_MS : backoffDelayMs(attempts)),
    }

    await writeQueue(queue)
    return queue[index] ?? null
  })
}

/** Removes a successfully uploaded item from the queue. */
export async function removeFromQueue(clientRequestId: string): Promise<void> {
  await withQueueLock(async () => {
    const queue = await readQueue()
    await writeQueue(queue.filter((item) => item.clientRequestId !== clientRequestId))
  })
}

/**
 * Gives entries that have no author to `authorId`.
 *
 * Entries saved before the queue recorded an author cannot say whose they are.
 * They are handed to the first user who drains the queue — the phone's user at
 * the time they were saved — rather than stranded, which would lose evidence
 * that was never sent. Nothing queued after this change is ever unowned.
 */
export async function claimUnowned(authorId: string): Promise<number> {
  return withQueueLock(async () => {
    const queue = await readQueue()
    let claimed = 0

    const next = queue.map((item) => {
      if (item.authorId) return item
      claimed += 1
      return { ...item, authorId }
    })

    if (claimed > 0) await writeQueue(next)
    return claimed
  })
}

/**
 * Discards queued reports, deleting each one's draft media with it.
 *
 * With an `authorId`, only that user's reports go; without one, all of them.
 * Signing out does **not** call this — a report is kept for its author. It is
 * for when its author is gone: a deleted account has no one to send for.
 * The drafts go too: an orphaned file in the sandbox is a copy of evidence
 * nobody can reach.
 *
 * The number of discarded items is returned.
 */
export async function clearQueue(authorId?: string): Promise<number> {
  return withQueueLock(async () => {
    const queue = await readQueue()
    const doomed = authorId ? queue.filter((item) => item.authorId === authorId) : queue
    if (doomed.length === 0) return 0

    for (const item of doomed) {
      await deleteDraftMedia(item.mediaUri)
    }

    await writeQueue(authorId ? queue.filter((item) => item.authorId !== authorId) : [])
    return doomed.length
  })
}

/** Whether a queued item belongs to this user. */
export function isOwnedBy(item: QueuedUpload, authorId: string): boolean {
  return item.authorId === authorId
}

/**
 * Deletes a draft media file.
 *
 * A failure to delete is not fatal — the bytes are in the app sandbox, and
 * the queue item that referenced them is already gone, so nothing dangles.
 */
export async function deleteDraftMedia(uri: string): Promise<void> {
  try {
    const { File } = await import('expo-file-system')
    const file = new File(uri)
    if (file.exists) file.delete()
  } catch {
    // The draft could not be removed. It is device-local and orphaned.
  }
}

/**
 * The number of items still waiting on the device.
 *
 * With an `authorId`, only that user's — one person must not see, or be told
 * about, another person's unsent reports.
 */
export async function queueSize(authorId?: string): Promise<number> {
  const queue = await readQueue()
  return queue.filter((item) => !item.savedOnDevice && (!authorId || isOwnedBy(item, authorId)))
    .length
}

/** The items kept on the device after the quick retries failed. */
export async function savedOnDeviceItems(authorId?: string): Promise<QueuedUpload[]> {
  const queue = await readQueue()
  return queue.filter((item) => item.savedOnDevice && (!authorId || isOwnedBy(item, authorId)))
}

/** How many reports this user has waiting or kept, for the sign-out notice. */
export async function ownQueueCount(authorId: string): Promise<number> {
  const queue = await readQueue()
  return queue.filter((item) => isOwnedBy(item, authorId)).length
}

function isQueuedUpload(value: unknown): value is QueuedUpload {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<QueuedUpload>
  return (
    typeof item.clientRequestId === 'string' &&
    typeof item.mediaUri === 'string' &&
    typeof item.attempts === 'number'
  )
}

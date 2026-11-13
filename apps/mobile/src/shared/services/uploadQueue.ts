import { Directory, File, Paths } from 'expo-file-system';
import type { PublicVisibility } from '@nagar-shield/shared';
import type { PreparedMedia } from './mediaPipeline';

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
 */

/** The maximum number of queued items. */
export const QUEUE_MAX_ITEMS = 20;

/** The maximum number of attempts before the item is kept on the device. */
export const QUEUE_MAX_ATTEMPTS = 3;

export interface QueuedUpload {
  clientRequestId: string;
  mediaUri: string;
  mediaType: 'photo' | 'video' | 'file';
  byteSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  contentType: string;
  extension: string;
  lat: number;
  lng: number;
  capturedAt: string;
  description: string | null;
  publicVisibility: PublicVisibility;
  attempts: number;
  /** The epoch millisecond before which no attempt may run. */
  nextAttemptAt: number;
  /** `true` once the attempt budget is exhausted. */
  savedOnDevice: boolean;
}

/** The queue file. A JSON document in the app sandbox. */
function queueFile(): File {
  const directory = new Directory(Paths.cache, 'nagar-shield-media');
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return new File(directory, 'upload-queue.json');
}

/** Reads the queue. A missing or corrupt file reads as an empty queue. */
export async function readQueue(): Promise<QueuedUpload[]> {
  const file = queueFile();

  if (!file.exists) return [];

  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedUpload);
  } catch {
    return [];
  }
}

/** Writes the queue, bounded to `QUEUE_MAX_ITEMS`. */
export async function writeQueue(items: QueuedUpload[]): Promise<void> {
  const file = queueFile();
  const bounded = items.slice(0, QUEUE_MAX_ITEMS);
  file.write(JSON.stringify(bounded));
}

/** The enqueue input. */
export interface EnqueueInput {
  clientRequestId: string;
  media: PreparedMedia;
  lat: number;
  lng: number;
  capturedAt: string;
  description: string | null;
  publicVisibility: PublicVisibility;
}

/** Builds the queue entry for a capture. */
function toQueuedUpload(input: EnqueueInput): QueuedUpload {
  return {
    clientRequestId: input.clientRequestId,
    mediaUri: input.media.uri,
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
    attempts: 0,
    nextAttemptAt: 0,
    savedOnDevice: false,
  };
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
  const item = toQueuedUpload(input);

  const queue = await readQueue();
  queue.unshift(item);
  await writeQueue(queue);

  return item;
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
  const queue = await readQueue();

  // The queue is newest-first, so the tail is the oldest item.
  const dropped = queue.length >= QUEUE_MAX_ITEMS ? queue[queue.length - 1] ?? null : null;

  const item = toQueuedUpload(input);
  queue.unshift(item);
  await writeQueue(queue);

  return { item, dropped };
}

/**
 * The exponential-backoff schedule.
 *
 * The first retry waits 30 s, the second 2 minutes, the third 8 minutes.
 * The wait grows with the attempt count so a failing network is not hammered.
 */
export function backoffDelayMs(attempts: number): number {
  const base = 30_000;
  return base * Math.pow(4, Math.max(0, attempts - 1));
}

/**
 * The items that are due for another attempt.
 *
 * An item whose attempt budget is exhausted is **not** due — it stays on the
 * device as "saved on device" and the user decides what happens to it.
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
    if (item.savedOnDevice) return false;
    if (item.nextAttemptAt <= now) return true;

    // The stored timestamp sits in the future — far enough ahead that the
    // device clock is wrong rather than the backoff merely pending.
    return item.nextAttemptAt - now >= BACKOFF_CEILING_MS;
  });
}

/**
 * The longest a backoff may hold an item.
 *
 * The schedule itself tops out at 8 minutes (the third retry), so a ceiling
 * of 30 minutes is generous: it only ever fires for a timestamp that is
 * genuinely unreachable, never for a legitimate backoff.
 */
export const BACKOFF_CEILING_MS = 30 * 60 * 1000;

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
  const queue = await readQueue();
  const index = queue.findIndex((item) => item.clientRequestId === clientRequestId);

  if (index < 0) return null;

  const item = queue[index];
  if (!item) return null;

  const attempts = item.attempts + 1;
  const savedOnDevice = attempts >= QUEUE_MAX_ATTEMPTS;

  queue[index] = {
    ...item,
    attempts,
    savedOnDevice,
    nextAttemptAt: savedOnDevice ? item.nextAttemptAt : now + backoffDelayMs(attempts),
  };

  await writeQueue(queue);
  return queue[index] ?? null;
}

/** Removes a successfully uploaded item from the queue. */
export async function removeFromQueue(clientRequestId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.clientRequestId !== clientRequestId));
}

/**
 * Discards the whole queue, deleting each item's draft media with it.
 *
 * This runs on **sign-out**. A queued item is scoped to the session that
 * created it, so it must never be uploaded under another account — a citizen's
 * evidence from one session landing in another account's history is a privacy
 * failure, not a data glitch. The drafts go too: an orphaned file in the
 * sandbox is a copy of evidence nobody can reach.
 *
 * The number of discarded items is returned so the caller can warn the user.
 */
export async function clearQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  for (const item of queue) {
    await deleteDraftMedia(item.mediaUri);
  }

  await writeQueue([]);
  return queue.length;
}

/**
 * Deletes a draft media file.
 *
 * A failure to delete is not fatal — the bytes are in the app sandbox, and
 * the queue item that referenced them is already gone, so nothing dangles.
 */
export async function deleteDraftMedia(uri: string): Promise<void> {
  try {
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The draft could not be removed. It is device-local and orphaned.
  }
}

/** The number of items still waiting on the device. */
export async function queueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.filter((item) => !item.savedOnDevice).length;
}

/** The items that will not be retried automatically. */
export async function savedOnDeviceItems(): Promise<QueuedUpload[]> {
  const queue = await readQueue();
  return queue.filter((item) => item.savedOnDevice);
}

function isQueuedUpload(value: unknown): value is QueuedUpload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<QueuedUpload>;
  return (
    typeof item.clientRequestId === 'string' &&
    typeof item.mediaUri === 'string' &&
    typeof item.attempts === 'number'
  );
}

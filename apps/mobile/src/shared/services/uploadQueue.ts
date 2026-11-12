import { Directory, File, Paths } from 'expo-file-system';
import type { PublicVisibility } from '@nagar-shield/shared';
import type { PreparedMedia } from './mediaPipeline';
import { newClientRequestId } from './mediaPipeline';

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

/**
 * Adds a capture to the queue.
 *
 * The item keeps its `clientRequestId`, so a later drain reuses the same
 * idempotency key and a retry never creates a duplicate report.
 */
export async function enqueueUpload(input: {
  media: PreparedMedia;
  lat: number;
  lng: number;
  capturedAt: string;
  description: string | null;
  publicVisibility: PublicVisibility;
}): Promise<QueuedUpload> {
  const item: QueuedUpload = {
    clientRequestId: newClientRequestId(),
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

  const queue = await readQueue();
  queue.unshift(item);
  await writeQueue(queue);

  return item;
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
 */
export function dueItems(items: QueuedUpload[], now: number = Date.now()): QueuedUpload[] {
  return items.filter(
    (item) => !item.savedOnDevice && item.nextAttemptAt <= now,
  );
}

/**
 * Records a failed attempt.
 *
 * After `QUEUE_MAX_ATTEMPTS` failures the item is kept on the device.
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

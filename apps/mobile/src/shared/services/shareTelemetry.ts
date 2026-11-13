import { Directory, File, Paths } from 'expo-file-system';
import type { ShareChannel } from './snapshotPayload';

/**
 * The `location_share_intent_ms` telemetry.
 *
 * This measures **our** work and nothing else: the elapsed milliseconds from
 * the user's confirm tap to the share intent firing or the `location_shares`
 * audit row being written. Carrier delivery and recipient open time are
 * outside our control, are never measured, and are never claimed
 * (FR-LOC-2 / waiver W-4 / ADR-005).
 *
 * **The payload carries no PII.** It is exactly three fields: the elapsed
 * ms, the share channel, and the recipient count. No coordinate, no phone
 * number, no contact name, no recipient id. The coding standard is explicit:
 * *"Never log raw GPS coordinates, media payloads, passwords, or tokens."*
 * Coordinates are treated the same way, and a phone number is not carried at
 * all.
 *
 * **The buffer never blocks the share.** One event per share, flushed
 * opportunistically. A flush failure drops the event rather than failing,
 * delaying, or rolling back a share.
 */

/** The maximum number of buffered events. */
export const TELEMETRY_MAX_EVENTS = 100;

/**
 * One telemetry event.
 *
 * The shape is deliberately minimal. A new field here is a new PII risk, so
 * adding one is a deliberate decision and not an accident.
 */
export interface ShareIntentEvent {
  /** The measured elapsed milliseconds. */
  elapsedMs: number;
  /** The channel the share went out over. */
  channel: ShareChannel;
  /** How many recipients the share reached. */
  recipientCount: number;
}

/** The telemetry buffer file. A JSON document in the app sandbox. */
function telemetryFile(): File {
  const directory = new Directory(Paths.cache, 'nagar-shield-media');
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return new File(directory, 'share-telemetry.json');
}

/** Reads the buffer. A missing or corrupt file reads as an empty buffer. */
export async function readTelemetryBuffer(): Promise<ShareIntentEvent[]> {
  const file = telemetryFile();

  if (!file.exists) return [];

  try {
    const raw = file.textSync();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ShareIntentEvent[];
  } catch {
    return [];
  }
}

/**
 * Buffers an event.
 *
 * The event is dropped when the buffer is full — the oldest is evicted. The
 * share itself is never affected: the metric is a measurement, not a
 * deliverable.
 */
export async function bufferShareIntent(event: ShareIntentEvent): Promise<void> {
  try {
    const events = await readTelemetryBuffer();

    events.push(event);

    // The newest first, so the oldest is the tail and the eviction is a
    // simple slice.
    const trimmed = events.slice(Math.max(0, events.length - TELEMETRY_MAX_EVENTS));

    telemetryFile().write(JSON.stringify(trimmed));
  } catch {
    // The buffer is a convenience. A device that cannot write it still
    // shares fine.
  }
}

/**
 * Empties the buffer and returns what was in it.
 *
 * The events are removed **before** they are flushed, so a failed flush
 * loses the events rather than re-sending them forever. A duplicate metric
 * would be worse than a missing one.
 */
export async function takeBufferedEvents(): Promise<ShareIntentEvent[]> {
  const events = await readTelemetryBuffer();

  if (events.length > 0) {
    try {
      telemetryFile().write('[]');
    } catch {
      // The events are returned anyway; a failure to clear the file means
      // they may be sent twice, which the flush must tolerate.
    }
  }

  return events;
}

/**
 * Records a share intent.
 *
 * The clock starts at the user's confirm tap and stops when the share intent
 * fires or the audit row is written — whichever is the terminal event for
 * that channel.
 *
 * The event is **buffered, not sent**: the share does not wait on a
 * telemetry flush, and a flush failure never fails the share.
 */
export async function recordShareIntent(input: {
  /** The epoch millisecond of the user's confirm tap. */
  startedAt: number;
  /** The channel the share went out over. */
  channel: ShareChannel;
  /** How many recipients the share reached. */
  recipientCount: number;
  /** The epoch millisecond the intent fired. Defaults to now. */
  finishedAt?: number;
}): Promise<ShareIntentEvent> {
  const finishedAt = input.finishedAt ?? Date.now();
  const elapsedMs = Math.max(0, Math.round(finishedAt - input.startedAt));

  const event: ShareIntentEvent = {
    elapsedMs,
    channel: input.channel,
    recipientCount: input.recipientCount,
  };

  await bufferShareIntent(event);

  return event;
}

/**
 * The median elapsed time across a set of events.
 *
 * The median is what FR-LOC-2 compares against the 5,000 ms threshold. A
 * single slow run is never discarded to flatter it — the median of the real
 * distribution is the honest number.
 */
export function medianElapsedMs(events: ShareIntentEvent[]): number | null {
  if (events.length === 0) return null;

  const sorted = events.map((event) => event.elapsedMs).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  // An even count averages the two middle values.
  if (sorted.length % 2 === 0) {
    const lower = sorted[middle - 1] ?? 0;
    const upper = sorted[middle] ?? lower;
    return Math.round((lower + upper) / 2);
  }

  return sorted[middle] ?? null;
}

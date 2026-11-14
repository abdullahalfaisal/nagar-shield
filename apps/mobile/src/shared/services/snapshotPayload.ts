/**
 * The location snapshot payload.
 *
 * One payload, both channels: the in-app path stores the structured values
 * and the OS share path carries the `message` text. The same fix produces the
 * same payload for every recipient in a fan-out — the payload is built **once
 * per share**, not once per recipient. Re-taking the fix per recipient could
 * produce inconsistent coordinates inside a single share.
 *
 * The message carries **three** parts, and none of them is optional:
 *
 *   1. the `geo:` URI — `geo:<lat>,<lng>?q=<lat>,<lng>`;
 *   2. the Google Maps URL — `https://maps.google.com/?q=<lat>,<lng>`;
 *   3. a human-readable timestamp.
 *
 * A recipient on a device with no maps app still gets the tappable URL; a
 * recipient on a device with no `geo:` handler still gets the URL. The
 * timestamp is what tells the recipient how fresh the position is — dropping
 * it is a product defect, not a payload simplification.
 */

/** The coordinate precision the payload is rendered at. */
const COORDINATE_PRECISION = 5

/** The channel a snapshot was shared over. */
export type ShareChannel = 'app' | 'os_share_sheet'

/**
 * The payload.
 *
 * `accuracyM` is `null` for a manual coordinate entry and for a degraded
 * fix — there is no honest accuracy to report, and a fabricated number (or a
 * `0` masquerading as a real accuracy) is worse than none.
 */
export interface SnapshotPayload {
  /** The plain-text message the OS share sheet carries. */
  message: string
  /** The `geo:` URI. */
  geoUri: string
  /** The Google Maps URL. */
  mapsUrl: string
  lat: number
  lng: number
  /** The fix accuracy in metres, or `null` when there is none. */
  accuracyM: number | null
  /** The ISO-8601 instant the snapshot was captured. */
  capturedAt: string
}

/**
 * Rounds a coordinate to the payload's fixed precision.
 *
 * The `geo:` URI and the Maps URL are built from the **same** rounded value,
 * so they never disagree with each other or with the stored `lat` / `lng`.
 *
 * A coordinate of `0` is a **valid** coordinate — the equator and the prime
 * meridian — so the rounding never treats it as absent.
 */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION))
}

/**
 * Builds the `geo:` URI for a coordinate pair.
 *
 * The form is `geo:<lat>,<lng>?q=<lat>,<lng>`.
 */
export function buildGeoUri(lat: number, lng: number): string {
  const latText = String(roundCoordinate(lat))
  const lngText = String(roundCoordinate(lng))
  return `geo:${latText},${lngText}?q=${latText},${lngText}`
}

/**
 * Builds the Google Maps URL for a coordinate pair.
 *
 * The form is `https://maps.google.com/?q=<lat>,<lng>`.
 */
export function buildMapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${roundCoordinate(lat)},${roundCoordinate(lng)}`
}

/**
 * Formats the capture moment for a human reader.
 *
 * The form is the active locale's own date-and-time format — a Bangla
 * locale reads a Bangla date, an English locale reads an English one. The
 * `geo:` URI and the Maps URL are locale-independent.
 */
export function formatCapturedAt(iso: string, locale: string): string {
  const captured = new Date(iso)
  if (Number.isNaN(captured.getTime())) return ''

  try {
    return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(captured)
  } catch {
    // A runtime without the locale data falls back to the ISO form, which is
    // still a parseable timestamp — never an empty one.
    return captured.toISOString()
  }
}

/**
 * Builds the snapshot payload for a fix.
 *
 * The payload has **no** `mode` parameter. The column exists in the schema
 * as the Phase-2 streaming hook, but the client has no path that could
 * produce a streaming payload, and the server-side CHECK rejects anything
 * but `'snapshot'` regardless.
 */
export function buildSnapshotPayload(input: {
  lat: number
  lng: number
  accuracyM: number | null
  capturedAt: string
  locale?: string
}): SnapshotPayload {
  const lat = roundCoordinate(input.lat)
  const lng = roundCoordinate(input.lng)

  const geoUri = buildGeoUri(lat, lng)
  const mapsUrl = buildMapsUrl(lat, lng)
  const capturedAt = formatCapturedAt(input.capturedAt, input.locale ?? 'en')

  // The accuracy line is only present when there is a real accuracy. A
  // manual entry has none, and reporting `±0 m` would be a fabrication.
  const accuracyLine =
    input.accuracyM === null || input.accuracyM === undefined
      ? null
      : `±${Math.round(input.accuracyM)} m`

  const lines = [
    'Nagar Shield — my current location',
    capturedAt ? `Taken: ${capturedAt}` : null,
    accuracyLine ? `Accuracy: ${accuracyLine}` : null,
    geoUri,
    mapsUrl,
  ].filter((line): line is string => line !== null)

  return {
    message: lines.join('\n'),
    geoUri,
    mapsUrl,
    lat,
    lng,
    accuracyM: input.accuracyM ?? null,
    capturedAt: input.capturedAt,
  }
}

/**
 * Builds the payload for a share with **no** location.
 *
 * The snapshot still carries a timestamp and still says what it is — it just
 * does not claim a position the app does not have. No coordinate is
 * fabricated to fill the gap.
 */
export function buildPayloadWithoutLocation(input: {
  capturedAt: string
  locale?: string
  note: string
}): SnapshotPayload {
  const capturedAt = formatCapturedAt(input.capturedAt, input.locale ?? 'en')

  const lines = [
    'Nagar Shield — location sharing',
    capturedAt ? `Taken: ${capturedAt}` : null,
    input.note,
  ].filter((line): line is string => line !== null)

  return {
    message: lines.join('\n'),
    geoUri: '',
    mapsUrl: '',
    lat: 0,
    lng: 0,
    accuracyM: null,
    capturedAt: input.capturedAt,
  }
}

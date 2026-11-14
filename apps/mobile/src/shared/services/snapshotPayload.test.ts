import {
  buildGeoUri,
  buildMapsUrl,
  buildPayloadWithoutLocation,
  buildSnapshotPayload,
  formatCapturedAt,
  roundCoordinate,
} from './snapshotPayload'

/**
 * The snapshot payload.
 *
 * The payload has **three mandatory parts** — the `geo:` URI, the Google
 * Maps URL, and the human-readable timestamp. A recipient on a device with
 * no maps app still gets the tappable URL; a recipient on a device with no
 * `geo:` handler still gets the URL. Dropping any one of them is a product
 * defect, and the timestamp is what tells the recipient how fresh the
 * position is.
 *
 * The accuracy line is present **only** when there is a real accuracy. A
 * manual coordinate entry has none, and reporting `±0 m` would be a
 * fabrication.
 */

describe('roundCoordinate', () => {
  it('rounds to five decimal places', () => {
    expect(roundCoordinate(23.780612345)).toBe(23.78061)
  })

  it('keeps a coordinate of zero — it is the equator, not an absent value', () => {
    expect(roundCoordinate(0)).toBe(0)
  })

  it('keeps a negative coordinate', () => {
    expect(roundCoordinate(-33.8688)).toBe(-33.8688)
  })
})

describe('buildGeoUri', () => {
  it('uses the geo:<lat>,<lng>?q=<lat>,<lng> form', () => {
    expect(buildGeoUri(23.7806, 90.4066)).toBe('geo:23.7806,90.4066?q=23.7806,90.4066')
  })

  it('rounds both coordinates the same way the Maps URL does', () => {
    const uri = buildGeoUri(23.780612345, 90.406698765)
    expect(uri).toBe('geo:23.78061,90.4067?q=23.78061,90.4067')
  })
})

describe('buildMapsUrl', () => {
  it('uses the https://maps.google.com/?q=<lat>,<lng> form', () => {
    expect(buildMapsUrl(23.7806, 90.4066)).toBe('https://maps.google.com/?q=23.7806,90.4066')
  })

  it('renders the same rounded coordinates the geo URI carries', () => {
    const uri = buildGeoUri(23.780612345, 90.406698765)
    const url = buildMapsUrl(23.780612345, 90.406698765)
    expect(url).toContain('23.78061,90.4067')
    expect(uri).toContain('23.78061,90.4067')
  })
})

describe('formatCapturedAt', () => {
  const iso = '2026-11-04T10:30:00.000Z'

  it('renders a human-readable timestamp for the English locale', () => {
    const formatted = formatCapturedAt(iso, 'en')
    expect(formatted).not.toBe('')
    expect(formatted).not.toBe(iso)
  })

  it('renders a Bangla timestamp for the Bangla locale', () => {
    const formatted = formatCapturedAt(iso, 'bn')
    expect(formatted).not.toBe('')
  })

  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatCapturedAt('not-a-date', 'en')).toBe('')
  })
})

describe('buildSnapshotPayload', () => {
  const base = {
    lat: 23.7806,
    lng: 90.4066,
    accuracyM: 12,
    capturedAt: '2026-11-04T10:30:00.000Z',
  }

  it('carries all three mandatory parts in the message', () => {
    const payload = buildSnapshotPayload(base)

    expect(payload.message).toContain(payload.geoUri)
    expect(payload.message).toContain(payload.mapsUrl)
    expect(payload.message).toContain(formatCapturedAt(base.capturedAt, 'en'))
  })

  it('carries the geo URI in its exact form', () => {
    const payload = buildSnapshotPayload(base)
    expect(payload.geoUri).toBe('geo:23.7806,90.4066?q=23.7806,90.4066')
  })

  it('carries the Google Maps URL in its exact form', () => {
    const payload = buildSnapshotPayload(base)
    expect(payload.mapsUrl).toBe('https://maps.google.com/?q=23.7806,90.4066')
  })

  it('carries the accuracy when there is one', () => {
    const payload = buildSnapshotPayload(base)
    expect(payload.message).toContain('±12 m')
    expect(payload.accuracyM).toBe(12)
  })

  it('omits the accuracy line when there is no honest accuracy', () => {
    const payload = buildSnapshotPayload({ ...base, accuracyM: null })

    expect(payload.message).not.toContain('Accuracy')
    expect(payload.message).not.toContain('±0')
    expect(payload.accuracyM).toBeNull()
  })

  it('keeps a coordinate of zero as a real coordinate', () => {
    const payload = buildSnapshotPayload({ ...base, lat: 0, lng: 0 })

    expect(payload.lat).toBe(0)
    expect(payload.lng).toBe(0)
    expect(payload.geoUri).toContain('0,0')
  })

  it('rounds the stored coordinates to the payload precision', () => {
    const payload = buildSnapshotPayload({ ...base, lat: 23.780612345 })

    expect(payload.lat).toBe(23.78061)
    // The URI, the URL, and the stored value can never disagree.
    expect(payload.geoUri).toContain('23.78061')
    expect(payload.mapsUrl).toContain('23.78061')
  })

  it('takes no mode parameter — the client has no streaming path', () => {
    const payload = buildSnapshotPayload(base)
    expect(Object.keys(payload)).not.toContain('mode')
  })
})

describe('buildPayloadWithoutLocation', () => {
  it('carries the timestamp and the note that the location is unavailable', () => {
    const payload = buildPayloadWithoutLocation({
      capturedAt: '2026-11-04T10:30:00.000Z',
      note: 'The location is unavailable.',
    })

    expect(payload.message).toContain('The location is unavailable.')
    expect(payload.message).toContain(formatCapturedAt('2026-11-04T10:30:00.000Z', 'en'))
  })

  it('fabricates no coordinate — there is no geo URI and no Maps URL', () => {
    const payload = buildPayloadWithoutLocation({
      capturedAt: '2026-11-04T10:30:00.000Z',
      note: 'The location is unavailable.',
    })

    expect(payload.geoUri).toBe('')
    expect(payload.mapsUrl).toBe('')
    expect(payload.message).not.toContain('geo:')
    expect(payload.message).not.toContain('maps.google.com')
  })

  it('reports no accuracy rather than a fabricated one', () => {
    const payload = buildPayloadWithoutLocation({
      capturedAt: '2026-11-04T10:30:00.000Z',
      note: 'The location is unavailable.',
    })

    expect(payload.accuracyM).toBeNull()
  })
})

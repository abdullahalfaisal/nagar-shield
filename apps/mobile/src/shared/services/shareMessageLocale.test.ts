import { bn } from '@/shared/i18n/bn'
import { en } from '@/shared/i18n/en'
import { formatCoordinates } from '@/shared/api/geocode'
import {
  DEFAULT_SNAPSHOT_LABELS,
  buildPayloadWithoutLocation,
  buildSnapshotPayload,
  type SnapshotLabels,
} from './snapshotPayload'

/**
 * The message a contact receives follows the app's language. It used to be
 * English whatever the user had chosen, with only the date in Bangla.
 */
function labelsFrom(copy: typeof en.location): SnapshotLabels {
  return {
    title: copy.shareMessageTitle,
    titleNoLocation: copy.shareMessageTitleNoLocation,
    taken: copy.shareMessageTaken,
    accuracy: copy.shareMessageAccuracy,
    meterUnit: copy.meterUnit,
  }
}

const INPUT = {
  lat: 23.81,
  lng: 90.41,
  accuracyM: 12.4,
  capturedAt: '2026-11-15T10:30:00.000Z',
}

describe('the share message', () => {
  it('is English by default, exactly as before', () => {
    const { message } = buildSnapshotPayload({ ...INPUT, locale: 'en' })

    expect(message).toContain(DEFAULT_SNAPSHOT_LABELS.title)
    expect(message).toContain("I'm sharing my current location with you")
    expect(message).toContain('check on me')
    expect(message).toContain('Accuracy: ±12 m')
  })

  it('is Bangla, labels and digits, for a Bangla user', () => {
    const { message } = buildSnapshotPayload({
      ...INPUT,
      locale: 'bn',
      labels: labelsFrom(bn.location),
    })

    expect(message).toContain('আমি আপনাকে আমার বর্তমান লোকেশন পাঠাচ্ছি')
    expect(message).toContain('দয়া করে আমার খোঁজ নিন')
    expect(message).toContain('নির্ভুলতা: ±১২ মিটার')
    expect(message).not.toContain('Accuracy')
    expect(message).not.toContain('Taken')
  })

  it('keeps the map links locale-independent', () => {
    const payload = buildSnapshotPayload({
      ...INPUT,
      locale: 'bn',
      labels: labelsFrom(bn.location),
    })

    expect(payload.geoUri).toMatch(/^geo:23\.81/)
    expect(payload.mapsUrl).toContain('maps.google.com')
    expect(payload.message).toContain(payload.geoUri)
  })

  it('names a share without a location in Bangla too', () => {
    const { message } = buildPayloadWithoutLocation({
      capturedAt: INPUT.capturedAt,
      locale: 'bn',
      labels: labelsFrom(bn.location),
      note: bn.location.shareWithoutLocationNote,
    })

    expect(message).toContain('আমার লোকেশন পাওয়া যায়নি')
    expect(message).toContain('বিপদে আছি')
    expect(message).toContain(bn.location.shareWithoutLocationNote)
  })
})

describe('the Bangla and English copy for the screen', () => {
  it('has the share-message words in both languages', () => {
    for (const copy of [en.location, bn.location]) {
      for (const word of Object.values(labelsFrom(copy))) expect(word.length).toBeGreaterThan(0)
    }
  })

  it('has no English left in the Bangla location copy, apart from the coordinate placeholders', () => {
    const values = Object.entries(bn.location)
      .filter(([key]) => !/Placeholder$/.test(key))
      .map(([, value]) => String(value))

    // "Latitude" / "Longitude" glosses were the only English; the rest is Bangla.
    for (const value of values) {
      expect(value).not.toMatch(/\b(Auto|detected|primary|contact|share)\b/i)
    }
  })

  it('uses one word for location through the Bangla screen', () => {
    const joined = Object.values(bn.location).join(' ')

    expect(joined).not.toContain('অবস্থান')
  })

  it('carries the contact count into the toggle line', () => {
    expect(en.location.shareAllPrimaries).toContain('{{number}}')
    expect(bn.location.shareAllPrimaries).toContain('{{number}}')
  })
})

describe('formatCoordinates', () => {
  it('prints Latin digits by default', () => {
    expect(formatCoordinates(23.7806, 90.4066)).toBe('23.7806° N, 90.4066° E')
  })

  it('prints Bangla digits for a Bangla user', () => {
    expect(formatCoordinates(23.7806, 90.4066, 'bn')).toBe('২৩.৭৮০৬° N, ৯০.৪০৬৬° E')
  })
})

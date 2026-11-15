import {
  exceedsVideoCap,
  normalizeMimeType,
  pickerDurationSeconds,
  videoBitrateFor,
} from './mediaPipeline'

describe('pickerDurationSeconds', () => {
  it('turns the picker’s milliseconds into seconds', () => {
    expect(pickerDurationSeconds(5000)).toBe(5)
    expect(pickerDurationSeconds(29_400)).toBe(29.4)
  })

  it('keeps a short clip under the 30 s cap — it was read as 5,000 s before', () => {
    expect(exceedsVideoCap(pickerDurationSeconds(5000))).toBe(false)
    expect(exceedsVideoCap(pickerDurationSeconds(45_000))).toBe(true)
  })

  it('answers null for a missing duration', () => {
    expect(pickerDurationSeconds(null)).toBeNull()
    expect(pickerDurationSeconds(undefined)).toBeNull()
    expect(pickerDurationSeconds(Number.NaN)).toBeNull()
  })
})

describe('normalizeMimeType', () => {
  it('keeps a type the picker gave', () => {
    expect(normalizeMimeType('image/jpeg', 'file:///a.jpg')).toBe('image/jpeg')
    expect(normalizeMimeType('video/mp4', 'file:///a.mp4')).toBe('video/mp4')
  })

  it('maps the aliases some phones use to the canonical name', () => {
    expect(normalizeMimeType('image/jpg', 'file:///a.jpg')).toBe('image/jpeg')
    expect(normalizeMimeType('image/heif', 'file:///a.heif')).toBe('image/heic')
    expect(normalizeMimeType('IMAGE/JPEG', 'file:///a.jpg')).toBe('image/jpeg')
  })

  it('reads a missing type from the file name, then the uri', () => {
    expect(normalizeMimeType(null, 'file:///cache/x', 'IMG_1.JPG')).toBe('image/jpeg')
    expect(normalizeMimeType(undefined, 'file:///cache/clip.mov')).toBe('video/quicktime')
    expect(normalizeMimeType(null, 'file:///cache/clip.3gp')).toBe('video/3gpp')
  })

  it('answers null when nothing says what the file is', () => {
    expect(normalizeMimeType(null, 'file:///cache/blob')).toBeNull()
    expect(normalizeMimeType(null, 'file:///cache/a.exe')).toBeNull()
  })
})

describe('videoBitrateFor', () => {
  const CAP_BITS = 10 * 1024 * 1024 * 8
  const AUDIO = 128_000

  it('keeps a full 30-second clip under the 10 MB cap, with headroom', () => {
    const bitrate = videoBitrateFor(30)

    expect((bitrate + AUDIO) * 30).toBeLessThanOrEqual(CAP_BITS * 0.8)
    expect(bitrate).toBeGreaterThan(1_500_000)
  })

  it('does not spend more on a short clip than 720p can use', () => {
    expect(videoBitrateFor(3)).toBe(2_500_000)
    expect((videoBitrateFor(3) + AUDIO) * 3).toBeLessThan(CAP_BITS)
  })

  it('treats an unknown length as the longest the app accepts', () => {
    expect(videoBitrateFor(null)).toBe(videoBitrateFor(30))
    expect(videoBitrateFor(0)).toBe(videoBitrateFor(30))
  })

  it('never plans for more than the 30-second cap', () => {
    expect(videoBitrateFor(600)).toBe(videoBitrateFor(30))
  })
})

import { scrubVideoMetadata, type VideoBytes } from './videoMetadata'

/** One ISO box: a 4-byte size, a 4-byte type, then the body. */
function box(type: string, ...body: Uint8Array[]): Uint8Array {
  const length = 8 + body.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  new DataView(out.buffer).setUint32(0, length)
  out.set(ascii(type), 4)
  let at = 8
  for (const part of body) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  return box('____', ...parts).subarray(8)
}

/** An in-memory file, so the real walk and the real writes are exercised. */
function memory(bytes: Uint8Array): VideoBytes & { bytes: Uint8Array } {
  const data = bytes.slice()
  return {
    bytes: data,
    size: data.length,
    read: async (offset, length) => data.slice(offset, offset + length),
    write: async (offset, chunk) => {
      data.set(chunk, offset)
    },
  }
}

function contains(haystack: Uint8Array, needle: string): boolean {
  return Buffer.from(haystack).includes(Buffer.from(ascii(needle)))
}

const ANDROID_LOCATION = '+23.8069+090.3687/'
const IPHONE_LOCATION = '+23.7461+090.3774+012.000/'

/** A fast-start file: `moov` before `mdat`, as a phone camera writes it. */
function cameraFile(): Uint8Array {
  return concat(
    box('ftyp', ascii('isom'), new Uint8Array(4)),
    box(
      'moov',
      box('mvhd', new Uint8Array(20)),
      box('trak', box('tkhd', new Uint8Array(20)), box('udta', box('name', ascii('VideoHandle')))),
      box('udta', box('©xyz', ascii(ANDROID_LOCATION))),
      box(
        'meta',
        box('keys', ascii('com.apple.quicktime.location.ISO6709')),
        ascii(IPHONE_LOCATION),
      ),
    ),
    box('mdat', ascii('frames-and-sound')),
  )
}

describe('scrubVideoMetadata', () => {
  it('removes the location Android and iPhone cameras write', async () => {
    const file = memory(cameraFile())

    const result = await scrubVideoMetadata(file)

    expect(result).toEqual({ isMovie: true, scrubbed: 3 })
    expect(contains(file.bytes, ANDROID_LOCATION)).toBe(false)
    expect(contains(file.bytes, IPHONE_LOCATION)).toBe(false)
    expect(contains(file.bytes, 'ISO6709')).toBe(false)
  })

  it('moves nothing, so the frames stay where the sample table points', async () => {
    const original = cameraFile()
    const file = memory(original)

    await scrubVideoMetadata(file)

    expect(file.bytes.length).toBe(original.length)
    expect(contains(file.bytes, 'frames-and-sound')).toBe(true)
    expect(contains(file.bytes, 'mvhd')).toBe(true)
    expect(contains(file.bytes, 'tkhd')).toBe(true)
    expect(Buffer.from(file.bytes).indexOf('mdat')).toBe(Buffer.from(original).indexOf('mdat'))
  })

  it('leaves blanked boxes a player skips', async () => {
    const file = memory(cameraFile())

    await scrubVideoMetadata(file)

    expect(contains(file.bytes, 'udta')).toBe(false)
    expect(contains(file.bytes, 'free')).toBe(true)
  })

  it('removes an XMP block an editor added, and only that uuid box', async () => {
    const xmpId = Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex')
    const otherId = new Uint8Array(16).fill(7)
    const file = memory(
      concat(
        box('ftyp', ascii('isom')),
        box('moov', box('mvhd', new Uint8Array(8))),
        box('uuid', xmpId, ascii('<exif:GPSLatitude>23,48N')),
        box('uuid', otherId, ascii('vendor-data')),
        box('mdat', ascii('frames')),
      ),
    )

    const result = await scrubVideoMetadata(file)

    expect(result.scrubbed).toBe(1)
    expect(contains(file.bytes, 'GPSLatitude')).toBe(false)
    expect(contains(file.bytes, 'vendor-data')).toBe(true)
  })

  it('reads a 64-bit box size and a box that runs to the end of the file', async () => {
    const largeMdat = new Uint8Array(16 + 6)
    const view = new DataView(largeMdat.buffer)
    view.setUint32(0, 1)
    largeMdat.set(ascii('mdat'), 4)
    view.setUint32(8, 0)
    view.setUint32(12, largeMdat.length)
    largeMdat.set(ascii('frames'), 16)

    const toEnd = box('moov', box('udta', ascii(ANDROID_LOCATION)))
    new DataView(toEnd.buffer).setUint32(0, 0)

    const file = memory(concat(box('ftyp', ascii('isom')), largeMdat, toEnd))

    const result = await scrubVideoMetadata(file)

    expect(result).toEqual({ isMovie: true, scrubbed: 1 })
    expect(contains(file.bytes, ANDROID_LOCATION)).toBe(false)
  })

  it('reports a file with no movie box as not a video', async () => {
    const file = memory(ascii('this is not a video at all, only text'))

    await expect(scrubVideoMetadata(file)).resolves.toEqual({ isMovie: false, scrubbed: 0 })
  })

  it('stops at a box that claims to run past the end of the file', async () => {
    const broken = box('moov', box('udta', ascii(ANDROID_LOCATION)))
    new DataView(broken.buffer).setUint32(0, broken.length + 100)

    const result = await scrubVideoMetadata(memory(concat(box('ftyp', ascii('isom')), broken)))

    expect(result.isMovie).toBe(false)
  })
})

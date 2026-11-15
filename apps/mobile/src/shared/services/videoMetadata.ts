/**
 * Removes the descriptive metadata — the recording location above all — from
 * an MP4, MOV or 3GP file, in place, without re-encoding it.
 *
 * All three formats are ISO base media files: a sequence of boxes, each a
 * 4-byte size, a 4-byte type and a body. The camera writes the location into
 * the movie's user-data and metadata boxes (`moov/udta` with `©xyz` on
 * Android, `moov/meta` with `com.apple.quicktime.location.ISO6709` on iOS),
 * and some editors add an XMP `uuid` box. None of them is needed to play the
 * video.
 *
 * Each such box is turned into a `free` box of the **same size** and its body
 * is zeroed. Nothing moves, so the sample offsets in `stco` / `co64` stay
 * valid and the video plays exactly as before — the location bytes are simply
 * no longer there. Removing the boxes instead would shift `mdat` in a
 * fast-start file and break playback.
 *
 * What this does not reach: a timed metadata track inside `mdat` (an iPhone
 * Live Photo or Cinematic clip can carry one). An ordinary camera recording
 * has none.
 */

/** Byte access to the file being scrubbed. */
export interface VideoBytes {
  size: number
  read(offset: number, length: number): Promise<Uint8Array>
  write(offset: number, bytes: Uint8Array): Promise<void>
}

export interface ScrubResult {
  /** `false` when the file has no `moov` box — it is not a playable video. */
  isMovie: boolean
  /** How many metadata boxes were blanked. */
  scrubbed: number
}

/** The boxes that only describe the recording, by the box they sit in. */
const METADATA_BOXES: Record<string, ReadonlySet<string>> = {
  file: new Set(['udta', 'meta']),
  moov: new Set(['udta', 'meta']),
  trak: new Set(['udta', 'meta']),
}

/** The boxes whose children are walked, by the box they sit in. */
const CONTAINERS: Record<string, ReadonlySet<string>> = {
  file: new Set(['moov']),
  moov: new Set(['trak']),
}

/** The XMP packet's `uuid` box, where editors write a GPS block. */
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac'

const ZERO_CHUNK = 64 * 1024

export async function scrubVideoMetadata(file: VideoBytes): Promise<ScrubResult> {
  const result: ScrubResult = { isMovie: false, scrubbed: 0 }
  await walk(file, 0, file.size, 'file', result)
  return result
}

async function walk(
  file: VideoBytes,
  start: number,
  end: number,
  parent: string,
  result: ScrubResult,
): Promise<void> {
  let offset = start

  while (offset + 8 <= end) {
    const header = await file.read(offset, Math.min(32, end - offset))
    if (header.length < 8) return

    const size32 = readUint32(header, 0)
    const type = readType(header, 4)
    let headerLength = 8
    let size = size32

    if (size32 === 1) {
      if (header.length < 16) return
      size = readUint32(header, 8) * 2 ** 32 + readUint32(header, 12)
      headerLength = 16
    } else if (size32 === 0) {
      // The box runs to the end of its parent.
      size = end - offset
    }

    // A box that does not fit its parent: the rest cannot be trusted.
    if (size < headerLength || offset + size > end) return

    if (type === 'moov') result.isMovie = true

    if (METADATA_BOXES[parent]?.has(type) || (type === 'uuid' && isXmp(header, headerLength))) {
      await blank(file, offset, size, headerLength)
      result.scrubbed += 1
    } else if (CONTAINERS[parent]?.has(type)) {
      await walk(file, offset + headerLength, offset + size, type, result)
    }

    offset += size
  }
}

/** Renames the box to `free` and zeroes its body. The size is untouched. */
async function blank(
  file: VideoBytes,
  offset: number,
  size: number,
  headerLength: number,
): Promise<void> {
  await file.write(offset + 4, new Uint8Array([0x66, 0x72, 0x65, 0x65]))

  const end = offset + size
  for (let at = offset + headerLength; at < end; at += ZERO_CHUNK) {
    await file.write(at, new Uint8Array(Math.min(ZERO_CHUNK, end - at)))
  }
}

function isXmp(header: Uint8Array, headerLength: number): boolean {
  if (header.length < headerLength + 16) return false
  let hex = ''
  for (let i = headerLength; i < headerLength + 16; i += 1) {
    hex += (header[i] ?? 0).toString(16).padStart(2, '0')
  }
  return hex === XMP_UUID
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] ?? 0) * 0x1000000 +
    ((bytes[at + 1] ?? 0) << 16) +
    ((bytes[at + 2] ?? 0) << 8) +
    (bytes[at + 3] ?? 0)
  )
}

function readType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] ?? 0,
    bytes[at + 1] ?? 0,
    bytes[at + 2] ?? 0,
    bytes[at + 3] ?? 0,
  )
}

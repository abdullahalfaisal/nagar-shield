import {
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_VIDEO_SECONDS,
  type MediaType,
} from '@nagar-shield/shared'

/**
 * The media pipeline — the device side of the capture write path.
 *
 * Every rule here is enforced **before** the bytes leave the handset:
 *
 *   * a photo's EXIF block (and with it the embedded GPS) is dropped by the
 *     re-encode, and the app-supplied coordinates are the record (FR-CAPTURE-2)
 *   * only photos and videos are accepted — evidence is something seen
 *   * photos are re-encoded down to the 1080p cap
 *   * videos are limited to the 30 s cap and are compressed to fit 10 MB
 *     (in Expo Go, which has no compressor, they must already fit), and their
 *     metadata boxes (the recorded location) are blanked
 *
 * The server re-checks every cap in `finalize-capture`; this layer is the UX
 * affordance, not the enforcement point.
 */

export interface PreparedMedia {
  /** The local file URI of the sanitised asset. */
  uri: string
  mediaType: MediaType
  byteSize: number
  durationSeconds: number | null
  width: number | null
  height: number | null
  /** The MIME type sent with the upload. */
  contentType: string
  /** The file extension used in the storage path. */
  extension: string
}

/** The MIME types the photo / video entry points accept. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/3gpp'] as const

/**
 * The largest photo the app will open, before it is re-encoded.
 *
 * The re-encode brings any photo down to 1080p and well under the 10 MB upload
 * cap, so this limit is about the phone, not the server: decoding a 40 MB RAW
 * export is slow and can run a low-end phone out of memory.
 */
export const MEDIA_MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024

/**
 * The largest video the app will compress.
 *
 * Thirty seconds of 4K from a phone camera is about 200 MB. Past this the
 * re-encode is slow and the clip is almost certainly not a camera recording.
 * It applies only where the compressor exists; without it the source itself
 * must fit the 10 MB upload cap.
 */
export const MEDIA_MAX_SOURCE_VIDEO_BYTES = 300 * 1024 * 1024

/** The longest side a compressed video keeps: 720p. */
export const VIDEO_COMPRESS_MAX_SIDE = 1280

/** The share of the upload cap the video track may fill. The rest is headroom. */
const VIDEO_BUDGET = 0.8
const AUDIO_BITS_PER_SECOND = 128_000
const VIDEO_BITRATE_CEILING = 2_500_000
const VIDEO_BITRATE_FLOOR = 400_000

/**
 * The video bitrate, in bits per second, that brings a clip of this length
 * under the upload cap.
 *
 * The budget is the cap less a fifth — an encoder overshoots its target and
 * the container adds its own bytes — less the sound track. A short clip does
 * not get more than 720p can use; an unknown length is treated as the longest
 * the app accepts.
 */
export function videoBitrateFor(durationSeconds: number | null): number {
  const seconds =
    durationSeconds !== null && durationSeconds > 0
      ? Math.min(durationSeconds, MEDIA_MAX_VIDEO_SECONDS)
      : MEDIA_MAX_VIDEO_SECONDS
  const bitrate = (MEDIA_MAX_FILE_BYTES * 8 * VIDEO_BUDGET) / seconds - AUDIO_BITS_PER_SECOND

  return Math.round(Math.min(VIDEO_BITRATE_CEILING, Math.max(VIDEO_BITRATE_FLOOR, bitrate)))
}

/** The caps, re-exported so the UI and the pipeline agree on one source. */
export const MEDIA_CAPS = {
  maxDimension: MEDIA_MAX_DIMENSION,
  maxVideoSeconds: MEDIA_MAX_VIDEO_SECONDS,
  maxFileBytes: MEDIA_MAX_FILE_BYTES,
  maxSourcePhotoBytes: MEDIA_MAX_SOURCE_PHOTO_BYTES,
} as const

/** Bytes as whole megabytes, for the messages. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}

/**
 * Why a picked photo or video was refused, for the message the citizen sees.
 * Carried as the `details` of the `AppError`.
 */
export type MediaRejection =
  | { kind: 'photo' | 'video'; reason: 'format' }
  | { kind: 'photo' | 'video'; reason: 'size'; maxMb: number }
  | { kind: 'video'; reason: 'duration'; maxSeconds: number }

/**
 * The 1080p resize.
 *
 * The longest edge is capped at 1080 and the other edge follows the source
 * aspect ratio, so a portrait photo is not squashed.
 */
export function resizeTarget(
  width: number,
  height: number,
  maxDimension: number = MEDIA_MAX_DIMENSION,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxDimension, height: maxDimension }
  }

  const longestEdge = Math.max(width, height)

  if (longestEdge <= maxDimension) {
    return { width, height }
  }

  const scale = maxDimension / longestEdge

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Whether a video is within the duration cap.
 *
 * The trim itself is done by the native module; this is the check that decides
 * whether the asset has to be trimmed before the upload.
 */
export function exceedsVideoCap(durationSeconds: number | null): boolean {
  if (durationSeconds === null) return false
  return durationSeconds > MEDIA_MAX_VIDEO_SECONDS
}

/**
 * The image picker's video length, in seconds.
 *
 * `expo-image-picker` reports `duration` in **milliseconds**. Read as seconds,
 * a 5 s clip looked like 5,000 s, so every video was refused as over the 30 s
 * cap before it left the phone.
 */
export function pickerDurationSeconds(milliseconds: number | null | undefined): number | null {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) return null
  return Math.round(milliseconds / 100) / 10
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
}

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/heif': 'image/heic',
}

/**
 * A picked asset's MIME type, made dependable.
 *
 * Some Android cameras hand back no `mimeType` at all, and some name a JPEG
 * `image/jpg` or a HEIC `image/heif`; each of those was refused as an
 * unsupported file. The type the picker gives is used when it is one of ours,
 * an alias is mapped to its canonical name, and a missing type is read from the
 * file's extension. Anything else is left as it is, for the allow-list to
 * refuse.
 */
export function normalizeMimeType(
  mimeType: string | null | undefined,
  uri: string,
  fileName?: string | null,
): string | null {
  const given = mimeType ? mimeType.toLowerCase() : null
  if (given) return MIME_ALIASES[given] ?? given

  const name = (fileName || uri).split('?')[0] ?? ''
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined
  return (extension && MIME_BY_EXTENSION[extension]) || null
}

/** Whether a file is within the 10 MB cap. */
export function exceedsFileCap(byteSize: number): boolean {
  return byteSize > MEDIA_MAX_FILE_BYTES
}

/** Whether a MIME type may be uploaded as a photo. */
export function isAllowedImageType(contentType: string | null): boolean {
  if (!contentType) return false
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)
}

/** Whether a MIME type may be uploaded as a video. */
export function isAllowedVideoType(contentType: string | null): boolean {
  if (!contentType) return false
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(contentType)
}

/** The storage file extension for a MIME type. */
export function extensionFor(contentType: string | null, mediaType: MediaType): string {
  switch (contentType) {
    case 'image/png':
      return 'png'
    case 'image/heic':
      return 'heic'
    case 'image/webp':
      return 'webp'
    case 'video/quicktime':
      return 'mov'
    case 'video/3gpp':
      return '3gp'
    case 'video/mp4':
      return 'mp4'
    default:
      return mediaType === 'photo' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'bin'
  }
}

/**
 * The storage path for one upload.
 *
 * The shape is fixed by the server contract:
 *
 *   reports/<author_token>/<client_request_id>/<file>
 *
 * The first segment is the literal `reports`, the second is the uploader's
 * **author token**, and the third is the idempotency key. The Storage policy
 * and the `finalize-capture` ownership check both read this shape.
 *
 * The author token is a **one-way hash of the uploader's user id**, not the
 * id itself. The id used to sit here in the clear, and that was a leak: the
 * public alert detail returns the media path to any signed-in citizen so the
 * client can mint a short-lived signed URL, and a path carrying the author's
 * uuid hands every reader a stable, cross-referenceable handle on the author
 * — the exact thing FR-DATA-3 and the `006-alerts / 009-alert-detail-screen`
 * story forbid ("no author identity of any kind … no author id").
 *
 * The hash keeps the upload-time ownership check working: the author can
 * compute the token for their **own** id, and nobody else can invert the
 * token to recover the id.
 */
export function buildStoragePath(input: {
  authorId: string
  clientRequestId: string
  fileName: string
  /** The hash of the uploader's id — the second path segment. */
  authorToken: string
}): string {
  return `reports/${input.authorToken}/${input.clientRequestId}/${input.fileName}`
}

/**
 * The idempotency key for one capture.
 *
 * A retry of a submit whose response was lost must reuse the same key, so the
 * server returns the original report instead of creating a duplicate.
 */
export function newClientRequestId(): string {
  // `crypto.randomUUID` is available in Hermes via `expo-crypto`'s polyfill
  // and in every test environment Node runs.
  const cryptoRef = globalThis.crypto as Crypto | undefined

  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }

  // A deterministic fallback — four random 32-bit blocks formatted as a uuid.
  const hex = () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0')
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-a${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`
}

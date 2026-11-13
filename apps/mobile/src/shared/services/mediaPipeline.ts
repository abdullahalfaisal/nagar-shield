import {
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_VIDEO_SECONDS,
  type MediaType,
} from '@nagar-shield/shared';

/**
 * The media pipeline — the device side of the capture write path.
 *
 * Every rule here is enforced **before** the bytes leave the handset:
 *
 *   * the EXIF block (and with it the embedded GPS) is dropped by the
 *     re-encode, and the app-supplied coordinates are the record (FR-CAPTURE-2)
 *   * photos are re-encoded down to the 1080p cap
 *   * videos are trimmed to the 30 s cap
 *   * files are limited to PDF / DOC and to 10 MB
 *
 * The server re-checks every cap in `finalize-capture`; this layer is the UX
 * affordance, not the enforcement point.
 */

export interface PreparedMedia {
  /** The local file URI of the sanitised asset. */
  uri: string;
  mediaType: MediaType;
  byteSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** The MIME type sent with the upload. */
  contentType: string;
  /** The file extension used in the storage path. */
  extension: string;
}

/** The MIME types the file entry point accepts. */
export const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword'] as const;

/** The MIME types the photo / video entry points accept. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/3gpp'] as const;

/** The caps, re-exported so the UI and the pipeline agree on one source. */
export const MEDIA_CAPS = {
  maxDimension: MEDIA_MAX_DIMENSION,
  maxVideoSeconds: MEDIA_MAX_VIDEO_SECONDS,
  maxFileBytes: MEDIA_MAX_FILE_BYTES,
} as const;

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
    return { width: maxDimension, height: maxDimension };
  }

  const longestEdge = Math.max(width, height);

  if (longestEdge <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longestEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Whether a video is within the duration cap.
 *
 * The trim itself is done by the native module; this is the check that decides
 * whether the asset has to be trimmed before the upload.
 */
export function exceedsVideoCap(durationSeconds: number | null): boolean {
  if (durationSeconds === null) return false;
  return durationSeconds > MEDIA_MAX_VIDEO_SECONDS;
}

/** Whether a file is within the 10 MB cap. */
export function exceedsFileCap(byteSize: number): boolean {
  return byteSize > MEDIA_MAX_FILE_BYTES;
}

/** Whether a MIME type may be uploaded as a document. */
export function isAllowedFileType(contentType: string | null): boolean {
  if (!contentType) return false;
  return (ALLOWED_FILE_TYPES as readonly string[]).includes(contentType);
}

/** Whether a MIME type may be uploaded as a photo. */
export function isAllowedImageType(contentType: string | null): boolean {
  if (!contentType) return false;
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType);
}

/** Whether a MIME type may be uploaded as a video. */
export function isAllowedVideoType(contentType: string | null): boolean {
  if (!contentType) return false;
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(contentType);
}

/** The storage file extension for a MIME type. */
export function extensionFor(contentType: string | null, mediaType: MediaType): string {
  switch (contentType) {
    case 'application/pdf':
      return 'pdf';
    case 'application/msword':
      return 'doc';
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/webp':
      return 'webp';
    case 'video/quicktime':
      return 'mov';
    case 'video/3gpp':
      return '3gp';
    case 'video/mp4':
      return 'mp4';
    default:
      return mediaType === 'photo' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'bin';
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
  authorId: string;
  clientRequestId: string;
  fileName: string;
  /** The hash of the uploader's id — the second path segment. */
  authorToken: string;
}): string {
  return `reports/${input.authorToken}/${input.clientRequestId}/${input.fileName}`;
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
  const cryptoRef = globalThis.crypto as Crypto | undefined;

  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  // A deterministic fallback — four random 32-bit blocks formatted as a uuid.
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-a${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`;
}

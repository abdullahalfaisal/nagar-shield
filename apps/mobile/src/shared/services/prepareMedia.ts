import { Directory, File, FileMode, Paths } from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { AppError, MEDIA_MAX_FILE_BYTES, MEDIA_MAX_VIDEO_SECONDS } from '@nagar-shield/shared'
import {
  MEDIA_MAX_SOURCE_PHOTO_BYTES,
  MEDIA_MAX_SOURCE_VIDEO_BYTES,
  exceedsFileCap,
  exceedsVideoCap,
  extensionFor,
  isAllowedImageType,
  isAllowedVideoType,
  megabytes,
  resizeTarget,
  videoBitrateFor,
  type MediaRejection,
  type PreparedMedia,
} from './mediaPipeline'
import { loadVideoCompressor, type VideoCompressor } from './videoCompressor'
import { scrubVideoMetadata, type ScrubResult } from './videoMetadata'

/** A refused photo or video, with the reason the message names. */
function rejected(rejection: MediaRejection): AppError {
  return new AppError(
    rejection.reason === 'format' ? 'UNSUPPORTED_MEDIA' : 'MEDIA_TOO_LARGE',
    rejection,
  )
}

/**
 * The device-side media preparation.
 *
 * The pipeline runs entirely on the handset, and the two kinds are treated
 * differently:
 *
 *   * a **photo** is re-encoded (which is the reliable EXIF strip), so its
 *     original bytes — with their embedded GPS — never leave the device;
 *   * a **video** is re-encoded to fit the upload cap where the binary has
 *     the compressor (`videoCompressor.ts`), and copied as it is in Expo Go.
 *     In both cases the metadata boxes of the file that is uploaded — where
 *     the camera writes the location — are blanked in place
 *     (`videoMetadata.ts`).
 */

export interface PickedAsset {
  uri: string
  mimeType: string | null
  fileName: string | null
  fileSize: number | null
  width: number | null
  height: number | null
  duration: number | null
}

/** The directory the sanitised media drafts live in. */
function draftDirectory(): Directory {
  return new Directory(Paths.cache, 'nagar-shield-media')
}

function ensureDraftDirectory(): Directory {
  const directory = draftDirectory()
  if (!directory.exists) {
    directory.create({ intermediates: true })
  }
  return directory
}

/**
 * Prepares a picked photo.
 *
 * The re-encode is the EXIF strip: the output JPEG carries no metadata block,
 * so the embedded GPS cannot leak.
 */
export async function preparePhoto(asset: PickedAsset): Promise<PreparedMedia> {
  if (!isAllowedImageType(asset.mimeType)) {
    throw rejected({ kind: 'photo', reason: 'format' })
  }

  if (asset.fileSize !== null && asset.fileSize > MEDIA_MAX_SOURCE_PHOTO_BYTES) {
    throw rejected({
      kind: 'photo',
      reason: 'size',
      maxMb: megabytes(MEDIA_MAX_SOURCE_PHOTO_BYTES),
    })
  }

  const width = asset.width ?? MEDIA_DEFAULT_DIMENSION
  const height = asset.height ?? MEDIA_DEFAULT_DIMENSION
  const target = resizeTarget(width, height)

  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri)
  context.resize({ width: target.width, height: target.height })
  const rendered = await context.renderAsync()
  // `renderAsync` resolves with a native image reference; `saveAsync` writes
  // the re-encoded JPEG into the cache directory and returns its URI. The
  // re-encode is what strips the EXIF block (and the embedded GPS with it).
  const image = await rendered.saveAsync({
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  })

  const file = new File(ensureDraftDirectory(), `photo-${Date.now()}.jpg`)
  const source = new File(image.uri)
  await source.copy(file, { overwrite: true })

  const info = file.info()

  if (info.exists && exceedsFileCap(info.size ?? 0)) {
    throw rejected({ kind: 'photo', reason: 'size', maxMb: megabytes(MEDIA_MAX_FILE_BYTES) })
  }

  return {
    uri: file.uri,
    mediaType: 'photo',
    byteSize: info.size ?? 0,
    durationSeconds: null,
    width: target.width,
    height: target.height,
    contentType: 'image/jpeg',
    extension: 'jpg',
  }
}

/**
 * Prepares a picked video.
 *
 * Where the binary carries the compressor (a development or release build),
 * the clip is re-encoded to 720p at a bitrate that fits the 10 MB upload cap,
 * so an ordinary 30-second recording is accepted. In Expo Go there is no
 * compressor: the clip is copied as it is and must already fit the cap.
 *
 * Either way a video over a cap is **refused** here, with the limit it broke,
 * rather than uploaded for the server to reject, and the metadata boxes of
 * the file that will be uploaded are blanked.
 *
 * The scrub fails **closed**: a copy whose metadata cannot be blanked is
 * deleted and refused, never uploaded with its location still in it.
 */
export async function prepareVideo(
  asset: PickedAsset,
  onProgress?: (progress: number) => void,
): Promise<PreparedMedia> {
  if (!isAllowedVideoType(asset.mimeType)) {
    throw rejected({ kind: 'video', reason: 'format' })
  }

  if (exceedsVideoCap(asset.duration)) {
    throw rejected({ kind: 'video', reason: 'duration', maxSeconds: MEDIA_MAX_VIDEO_SECONDS })
  }

  const compressor = loadVideoCompressor()
  const sourceCap = compressor ? MEDIA_MAX_SOURCE_VIDEO_BYTES : MEDIA_MAX_FILE_BYTES

  // Checked before any work, so a clip that cannot be accepted is refused at
  // once rather than after it has been copied or re-encoded.
  if (asset.fileSize !== null && asset.fileSize > sourceCap) {
    throw rejected({ kind: 'video', reason: 'size', maxMb: megabytes(sourceCap) })
  }

  const compressedUri = compressor ? await compressToCap(compressor, asset, onProgress) : null
  const extension = compressedUri ? 'mp4' : extensionFor(asset.mimeType, 'video')

  const file = new File(ensureDraftDirectory(), `video-${Date.now()}.${extension}`)
  const source = new File(compressedUri ?? asset.uri)
  await source.copy(file, { overwrite: true })
  if (compressedUri) discard(source)

  const info = file.info()

  if (info.exists && exceedsFileCap(info.size ?? 0)) {
    file.delete()
    throw rejected({ kind: 'video', reason: 'size', maxMb: megabytes(MEDIA_MAX_FILE_BYTES) })
  }

  const scrub = await scrubDraftVideo(file).catch(() => null)
  if (!scrub?.isMovie) {
    file.delete()
    throw rejected({ kind: 'video', reason: 'format' })
  }

  // A re-encoded clip has the compressor's frame size, not the camera's.
  const frame = compressedUri
    ? ((await compressor?.frameSize(file.uri)) ?? null)
    : { width: asset.width ?? 0, height: asset.height ?? 0 }

  return {
    uri: file.uri,
    mediaType: 'video',
    byteSize: info.size ?? 0,
    durationSeconds: asset.duration,
    width: frame && frame.width > 0 ? frame.width : null,
    height: frame && frame.height > 0 ? frame.height : null,
    contentType: compressedUri ? 'video/mp4' : (asset.mimeType ?? 'video/mp4'),
    extension,
  }
}

/**
 * Re-encodes the clip until it fits the upload cap, and returns the output.
 *
 * An encoder treats its bitrate as a target, not a limit, and a busy scene
 * can overshoot it. One overshoot is answered with a second pass at a lower
 * bitrate, rather than by telling the citizen their video is too large when
 * the app itself made it that size.
 *
 * When the compressor fails outright, a source that already fits the cap is
 * used as it is (`null`), and a larger one is refused.
 */
async function compressToCap(
  compressor: VideoCompressor,
  asset: PickedAsset,
  onProgress?: (progress: number) => void,
): Promise<string | null> {
  let bitrate = videoBitrateFor(asset.duration)

  try {
    for (let pass = 0; pass < 2; pass += 1) {
      const output = new File(await compressor.compress(asset.uri, bitrate, onProgress))
      if (!exceedsFileCap(output.info().size ?? 0)) return output.uri

      discard(output)
      bitrate = Math.round(bitrate * 0.6)
    }
  } catch {
    if (asset.fileSize !== null && !exceedsFileCap(asset.fileSize)) return null
  }

  throw rejected({ kind: 'video', reason: 'size', maxMb: megabytes(MEDIA_MAX_FILE_BYTES) })
}

/** Deletes a temporary file. One left behind is in the cache, and harmless. */
function discard(file: File): void {
  try {
    if (file.exists) file.delete()
  } catch {
    // The cache is cleared by the OS.
  }
}

/** Blanks the metadata boxes of the draft copy, through a file handle. */
async function scrubDraftVideo(file: File): Promise<ScrubResult> {
  const handle = file.open(FileMode.ReadWrite)
  try {
    return await scrubVideoMetadata({
      size: handle.size ?? 0,
      read: (offset, length) => {
        handle.offset = offset
        return handle.readBytes(length)
      },
      write: (offset, bytes) => {
        handle.offset = offset
        return handle.writeBytes(bytes)
      },
    })
  } finally {
    handle.close()
  }
}

/** The fallback dimension when the picker reports no geometry. */
const MEDIA_DEFAULT_DIMENSION = 1080

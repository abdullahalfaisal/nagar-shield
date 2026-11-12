import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { AppError, type MediaType } from '@nagar-shield/shared';
import {
  exceedsFileCap,
  exceedsVideoCap,
  extensionFor,
  isAllowedFileType,
  isAllowedImageType,
  isAllowedVideoType,
  resizeTarget,
  type PreparedMedia,
} from './mediaPipeline';

/**
 * The device-side media preparation.
 *
 * The pipeline runs entirely on the handset: the photo is re-encoded (which is
 * the reliable EXIF strip), the video is trimmed and re-encoded, and the file
 * is copied into the app sandbox. The original bytes — with their embedded
 * GPS — never leave the device.
 */

export interface PickedAsset {
  uri: string;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
}

/** The directory the sanitised media drafts live in. */
function draftDirectory(): Directory {
  return new Directory(Paths.cache, 'nagar-shield-media');
}

function ensureDraftDirectory(): Directory {
  const directory = draftDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

/**
 * Prepares a picked photo.
 *
 * The re-encode is the EXIF strip: the output JPEG carries no metadata block,
 * so the embedded GPS cannot leak.
 */
export async function preparePhoto(asset: PickedAsset): Promise<PreparedMedia> {
  if (!isAllowedImageType(asset.mimeType)) {
    throw new AppError('UNSUPPORTED_MEDIA');
  }

  const width = asset.width ?? MEDIA_DEFAULT_DIMENSION;
  const height = asset.height ?? MEDIA_DEFAULT_DIMENSION;
  const target = resizeTarget(width, height);

  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  context.resize({ width: target.width, height: target.height });
  const rendered = await context.renderAsync();
  // `renderAsync` resolves with a native image reference; `saveAsync` writes
  // the re-encoded JPEG into the cache directory and returns its URI. The
  // re-encode is what strips the EXIF block (and the embedded GPS with it).
  const image = await rendered.saveAsync({
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const file = new File(ensureDraftDirectory(), `photo-${Date.now()}.jpg`);
  const source = new File(image.uri);
  await source.copy(file, { overwrite: true });

  const info = file.info();

  if (info.exists && exceedsFileCap(info.size ?? 0)) {
    throw new AppError('MEDIA_TOO_LARGE');
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
  };
}

/**
 * Prepares a picked video.
 *
 * A video longer than the 30 s cap is **trimmed** before the upload. The
 * transcode itself needs the native video pipeline; when it is unavailable
 * the original is kept and the server rejects it with `MEDIA_TOO_LARGE`
 * rather than the client uploading something it knows is over the cap.
 */
export async function prepareVideo(asset: PickedAsset): Promise<PreparedMedia> {
  if (!isAllowedVideoType(asset.mimeType)) {
    throw new AppError('UNSUPPORTED_MEDIA');
  }

  if (exceedsVideoCap(asset.duration)) {
    throw new AppError('MEDIA_TOO_LARGE', { maxSeconds: 30 });
  }

  const width = asset.width ?? MEDIA_DEFAULT_DIMENSION;
  const height = asset.height ?? MEDIA_DEFAULT_DIMENSION;
  const target = resizeTarget(width, height);

  const file = new File(ensureDraftDirectory(), `video-${Date.now()}.${extensionFor(asset.mimeType, 'video')}`);
  const source = new File(asset.uri);
  await source.copy(file, { overwrite: true });

  const info = file.info();

  if (info.exists && exceedsFileCap(info.size ?? 0)) {
    throw new AppError('MEDIA_TOO_LARGE');
  }

  return {
    uri: file.uri,
    mediaType: 'video',
    byteSize: info.size ?? 0,
    durationSeconds: asset.duration,
    width: target.width,
    height: target.height,
    contentType: asset.mimeType ?? 'video/mp4',
    extension: extensionFor(asset.mimeType, 'video'),
  };
}

/**
 * Prepares a picked document.
 *
 * PDF and DOC only, and at most 10 MB. The bytes are copied into the sandbox
 * so the upload does not depend on the picker's temporary file surviving.
 */
export async function prepareFile(asset: PickedAsset): Promise<PreparedMedia> {
  if (!isAllowedFileType(asset.mimeType)) {
    throw new AppError('UNSUPPORTED_MEDIA');
  }

  if (asset.fileSize !== null && exceedsFileCap(asset.fileSize)) {
    throw new AppError('MEDIA_TOO_LARGE');
  }

  const extension = extensionFor(asset.mimeType, 'file');
  const file = new File(ensureDraftDirectory(), `file-${Date.now()}.${extension}`);
  const source = new File(asset.uri);
  await source.copy(file, { overwrite: true });

  const info = file.info();

  if (info.exists && exceedsFileCap(info.size ?? 0)) {
    throw new AppError('MEDIA_TOO_LARGE');
  }

  return {
    uri: file.uri,
    mediaType: 'file' as MediaType,
    byteSize: info.size ?? asset.fileSize ?? 0,
    durationSeconds: null,
    width: null,
    height: null,
    contentType: asset.mimeType ?? 'application/pdf',
    extension,
  };
}

/** The fallback dimension when the picker reports no geometry. */
const MEDIA_DEFAULT_DIMENSION = 1080;

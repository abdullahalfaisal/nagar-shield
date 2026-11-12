import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AppError, MEDIA_MAX_VIDEO_SECONDS } from '@nagar-shield/shared';
import type { PickedAsset } from './prepareMedia';

/**
 * The three media entry points.
 *
 * Each one returns a **picked asset** — the raw, unsanitised file. The
 * sanitising happens in `prepareMedia`, so the picker state, the permission
 * state and the media pipeline stay three separate concerns.
 *
 * A denied permission is a **normal outcome**, not an error: the caller
 * degrades to a different entry point instead of trapping the user.
 */

/**
 * Picks a photo or a video from the gallery.
 *
 * The picker is limited to the media types the server accepts, so an
 * unsupported file is never even offered.
 */
export async function pickFromGallery(
  mediaTypes: ImagePicker.MediaType[] = ['images'],
): Promise<PickedAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (permission.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'mediaLibrary' });
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    quality: 1,
    // The EXIF block is never read on the device — the re-encode is what
    // strips it, and the picker does not need to hand it over.
    exif: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
  };
}

/**
 * Records a photo with the camera.
 *
 * The camera permission is requested **just-in-time** — when the user taps the
 * entry point, never at app open.
 */
export async function capturePhoto(): Promise<PickedAsset | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (permission.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'camera' });
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: null,
  };
}

/**
 * Records a video with the camera.
 *
 * The 30 s cap is enforced by the **camera itself** through
 * `videoMaxDuration`, so the user is stopped at the cap rather than after it.
 */
export async function captureVideo(): Promise<PickedAsset | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (permission.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'camera' });
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    quality: 1,
    videoMaxDuration: MEDIA_MAX_VIDEO_SECONDS,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
  };
}

/**
 * Picks a document.
 *
 * PDF and DOC only — the same MIME allow-list the server enforces.
 */
export async function pickDocument(): Promise<PickedAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/msword'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.name ?? null,
    fileSize: asset.size ?? null,
    width: null,
    height: null,
    duration: null,
  };
}

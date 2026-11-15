import * as Camera from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { AppError, MEDIA_MAX_VIDEO_SECONDS } from '@nagar-shield/shared'
import { normalizeMimeType, pickerDurationSeconds } from './mediaPipeline'
import type { PickedAsset } from './prepareMedia'

/**
 * The media entry points: a photo or a video, from the camera or the gallery.
 * Documents are not evidence and are not offered.
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
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

  if (permission.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'mediaLibrary' })
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    quality: 1,
    // The EXIF block is never read on the device — the re-encode is what
    // strips it, and the picker does not need to hand it over.
    exif: false,
  })

  if (result.canceled) return null

  const asset = result.assets[0]
  if (!asset) return null

  return {
    uri: asset.uri,
    mimeType: normalizeMimeType(asset.mimeType, asset.uri, asset.fileName),
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: pickerDurationSeconds(asset.duration),
  }
}

/**
 * Records a photo with the camera.
 *
 * The camera permission is requested **just-in-time** — when the user taps the
 * entry point, never at app open.
 */
export async function capturePhoto(): Promise<PickedAsset | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()

  if (permission.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'camera' })
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  })

  if (result.canceled) return null

  const asset = result.assets[0]
  if (!asset) return null

  return {
    uri: asset.uri,
    mimeType: normalizeMimeType(asset.mimeType, asset.uri, asset.fileName),
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: null,
  }
}

/**
 * Records a video with the camera.
 *
 * A video capture needs **two** permissions: the camera and the microphone.
 * A silent video is not the evidence a citizen is trying to file, so the
 * microphone is requested alongside the camera, just-in-time, and the
 * recording starts only if both are granted.
 *
 * The 30 s cap is enforced by the **camera itself** through
 * `videoMaxDuration`, so the user is stopped at the cap rather than after it.
 */
export async function captureVideo(): Promise<PickedAsset | null> {
  const [camera, microphone] = await Promise.all([
    ImagePicker.requestCameraPermissionsAsync(),
    Camera.Camera.requestMicrophonePermissionsAsync(),
  ])

  if (camera.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'camera' })
  }

  if (microphone.status !== 'granted') {
    throw new AppError('FORBIDDEN', { permission: 'microphone' })
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    quality: 1,
    videoMaxDuration: MEDIA_MAX_VIDEO_SECONDS,
  })

  if (result.canceled) return null

  const asset = result.assets[0]
  if (!asset) return null

  return {
    uri: asset.uri,
    mimeType: normalizeMimeType(asset.mimeType, asset.uri, asset.fileName),
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: pickerDurationSeconds(asset.duration),
  }
}

/**
 * Picks up a capture the system finished while the app was gone.
 *
 * On a low-memory Android phone the app can be killed while the camera is
 * open; the photo or video is then held by the picker and handed back only
 * through `getPendingResultAsync`. Without this the citizen comes back to an
 * empty form and the recording is lost.
 *
 * It returns `null` where there is nothing to recover: on iOS, on a build whose
 * picker lacks the call, on a cancelled or failed pick.
 */
export async function recoverPendingPick(): Promise<{
  asset: PickedAsset
  kind: 'photo' | 'video'
} | null> {
  if (typeof ImagePicker.getPendingResultAsync !== 'function') return null

  try {
    const result = await ImagePicker.getPendingResultAsync()
    if (!result || !('assets' in result) || result.canceled) return null

    const asset = result.assets?.[0]
    if (!asset) return null

    const kind = asset.type === 'video' ? 'video' : 'photo'
    return {
      kind,
      asset: {
        uri: asset.uri,
        mimeType: normalizeMimeType(asset.mimeType, asset.uri, asset.fileName),
        fileName: asset.fileName ?? null,
        fileSize: asset.fileSize ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        duration: kind === 'video' ? pickerDurationSeconds(asset.duration) : null,
      },
    }
  } catch {
    // Nothing to recover is the common case; a failed look is the same to the user.
    return null
  }
}

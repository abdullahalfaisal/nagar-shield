import { AppError } from '@nagar-shield/shared'
import * as mediaSources from './mediaSources'
import { capturePhoto, captureVideo, pickFromGallery } from './mediaSources'

/**
 * The media entry points.
 *
 * The rule these tests protect is **just-in-time prompting**: the permission
 * is requested at the moment the entry point is tapped, immediately before
 * the picker opens — never on mount, never as part of a screen's first
 * render.
 *
 * The second rule is that a video capture needs **two** permissions: the
 * camera and the microphone. A silent video is not the evidence the citizen
 * is trying to file, so the mic is requested alongside the camera and the
 * recording starts only if both are granted.
 *
 * The third is that a denied permission is a **normal outcome**, not an
 * error: it is a typed `FORBIDDEN` with the permission named, so the caller
 * can degrade to a different entry point instead of trapping the user.
 */

jest.mock('expo-camera', () => ({
  Camera: {
    requestMicrophonePermissionsAsync: jest.fn(),
  },
}))

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}))

import * as Camera from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'

const mockedMic = Camera.Camera.requestMicrophonePermissionsAsync as jest.MockedFunction<
  typeof Camera.Camera.requestMicrophonePermissionsAsync
>
const mockedCamera = ImagePicker.requestCameraPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestCameraPermissionsAsync
>
const mockedLibrary = ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestMediaLibraryPermissionsAsync
>
const mockedLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>
const mockedLaunchCamera = ImagePicker.launchCameraAsync as jest.MockedFunction<
  typeof ImagePicker.launchCameraAsync
>

const pickedAsset = {
  uri: 'file:///tmp/picked.jpg',
  mimeType: 'image/jpeg',
  fileName: 'picked.jpg',
  fileSize: 2048,
  width: 1024,
  height: 768,
  duration: null,
}

beforeEach(() => {
  jest.clearAllMocks()

  mockedCamera.mockResolvedValue({ status: 'granted' } as never)
  mockedMic.mockResolvedValue({ status: 'granted' } as never)
  mockedLibrary.mockResolvedValue({ status: 'granted' } as never)
  mockedLaunchLibrary.mockResolvedValue({ canceled: false, assets: [pickedAsset] } as never)
  mockedLaunchCamera.mockResolvedValue({ canceled: false, assets: [pickedAsset] } as never)
})

describe('pickFromGallery', () => {
  it('requests the media-library permission just-in-time', async () => {
    await pickFromGallery()

    expect(mockedLibrary).toHaveBeenCalledTimes(1)
  })

  it('opens the gallery after the permission is granted', async () => {
    await pickFromGallery()

    expect(mockedLaunchLibrary).toHaveBeenCalledTimes(1)
  })

  it('does not open the gallery when the permission is denied', async () => {
    mockedLibrary.mockResolvedValue({ status: 'denied' } as never)

    await expect(pickFromGallery()).rejects.toThrow(AppError)
    expect(mockedLaunchLibrary).not.toHaveBeenCalled()
  })

  it('names the permission in the error', async () => {
    mockedLibrary.mockResolvedValue({ status: 'denied' } as never)

    await expect(pickFromGallery()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'mediaLibrary' },
    })
  })

  it('returns null when the citizen cancels the picker', async () => {
    mockedLaunchLibrary.mockResolvedValue({ canceled: true, assets: null } as never)

    await expect(pickFromGallery()).resolves.toBeNull()
  })
})

describe('capturePhoto', () => {
  it('requests the camera permission just-in-time', async () => {
    await capturePhoto()

    expect(mockedCamera).toHaveBeenCalledTimes(1)
  })

  it('does not open the camera when the permission is denied', async () => {
    mockedCamera.mockResolvedValue({ status: 'denied' } as never)

    await expect(capturePhoto()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'camera' },
    })
    expect(mockedLaunchCamera).not.toHaveBeenCalled()
  })

  it('returns null when the citizen cancels the camera', async () => {
    mockedLaunchCamera.mockResolvedValue({ canceled: true, assets: null } as never)

    await expect(capturePhoto()).resolves.toBeNull()
  })
})

describe('captureVideo', () => {
  // A video capture needs the mic as well as the camera. A silent video is
  // not the evidence the citizen is trying to file.
  it('requests the microphone alongside the camera', async () => {
    await captureVideo()

    expect(mockedCamera).toHaveBeenCalledTimes(1)
    expect(mockedMic).toHaveBeenCalledTimes(1)
  })

  it('does not open the camera when the microphone is denied', async () => {
    mockedMic.mockResolvedValue({ status: 'denied' } as never)

    await expect(captureVideo()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'microphone' },
    })
    expect(mockedLaunchCamera).not.toHaveBeenCalled()
  })

  it('does not open the camera when the camera is denied', async () => {
    mockedCamera.mockResolvedValue({ status: 'denied' } as never)

    await expect(captureVideo()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'camera' },
    })
    expect(mockedLaunchCamera).not.toHaveBeenCalled()
  })

  it('opens the camera when both are granted', async () => {
    await captureVideo()

    expect(mockedLaunchCamera).toHaveBeenCalledTimes(1)
  })

  // The 30 s cap is enforced by the camera itself, so the user is stopped
  // at the cap rather than after it.
  it('passes the 30-second cap to the camera', async () => {
    await captureVideo()

    expect(mockedLaunchCamera).toHaveBeenCalledWith(
      expect.objectContaining({ videoMaxDuration: 30 }),
    )
  })

  it('returns null when the citizen cancels the recording', async () => {
    mockedLaunchCamera.mockResolvedValue({ canceled: true, assets: null } as never)

    await expect(captureVideo()).resolves.toBeNull()
  })
})

describe('documents', () => {
  // Evidence is a photo or a video; there is no document entry point.
  it('offers no document picker', () => {
    expect(Object.keys(mediaSources)).not.toContain('pickDocument')
  })
})

describe('recoverPendingPick', () => {
  const picker = ImagePicker as unknown as { getPendingResultAsync?: jest.Mock }

  afterEach(() => {
    delete picker.getPendingResultAsync
  })

  it('returns null where the picker has no pending-result call', async () => {
    await expect(mediaSources.recoverPendingPick()).resolves.toBeNull()
  })

  it('returns null when nothing is pending, it was cancelled, or it errored', async () => {
    picker.getPendingResultAsync = jest.fn().mockResolvedValueOnce(null)
    await expect(mediaSources.recoverPendingPick()).resolves.toBeNull()
    picker.getPendingResultAsync.mockResolvedValueOnce({ canceled: true, assets: null })
    await expect(mediaSources.recoverPendingPick()).resolves.toBeNull()
    picker.getPendingResultAsync.mockResolvedValueOnce({ code: 'E', message: 'x' })
    await expect(mediaSources.recoverPendingPick()).resolves.toBeNull()
    picker.getPendingResultAsync.mockRejectedValueOnce(new Error('boom'))
    await expect(mediaSources.recoverPendingPick()).resolves.toBeNull()
  })

  it('hands back a recovered video with its kind', async () => {
    picker.getPendingResultAsync = jest.fn().mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///v.mp4', type: 'video', mimeType: 'video/mp4', duration: 4000 }],
    })
    const recovered = await mediaSources.recoverPendingPick()
    expect(recovered?.kind).toBe('video')
    expect(recovered?.asset.uri).toBe('file:///v.mp4')
  })
})

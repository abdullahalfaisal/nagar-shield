import {
  RESTRICTED_PERMISSIONS,
  entryPointAvailability,
  needsManualLocation,
  readPermissions,
  toPermissionState,
  type PermissionSnapshot,
} from './permissions'

/**
 * The permission rules.
 *
 * The rule that matters most is the one about **failure**: a permission the
 * app cannot read is treated as *denied*, not as granted. The opposite
 * assumption — "the query threw, so it probably works" — would render an
 * entry point the user cannot use, and the tap would fail with no
 * explanation. Hiding it is the honest reading of "I do not know".
 *
 * The second rule is that the degradation is **not** all-or-nothing: a
 * denied camera leaves the gallery and the file path alive. Only the paths
 * that genuinely need the missing permission disappear.
 */

jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: jest.fn(),
    getMicrophonePermissionsAsync: jest.fn(),
  },
}))

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(),
}))

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
}))

import * as Camera from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'

const mockedCamera = Camera.Camera.getCameraPermissionsAsync as jest.MockedFunction<
  typeof Camera.Camera.getCameraPermissionsAsync
>
const mockedMic = Camera.Camera.getMicrophonePermissionsAsync as jest.MockedFunction<
  typeof Camera.Camera.getMicrophonePermissionsAsync
>
const mockedLibrary = ImagePicker.getMediaLibraryPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.getMediaLibraryPermissionsAsync
>
const mockedLocation = Location.getForegroundPermissionsAsync as jest.MockedFunction<
  typeof Location.getForegroundPermissionsAsync
>

/** A snapshot with every permission granted. */
const ALL_GRANTED: PermissionSnapshot = {
  camera: 'granted',
  microphone: 'granted',
  mediaLibrary: 'granted',
  location: 'granted',
}

/** A snapshot with everything denied. */
const ALL_DENIED: PermissionSnapshot = {
  camera: 'denied',
  microphone: 'denied',
  mediaLibrary: 'denied',
  location: 'denied',
}

describe('toPermissionState', () => {
  it('maps "granted" to granted', () => {
    expect(toPermissionState('granted')).toBe('granted')
  })

  it('maps "undetermined" to undetermined', () => {
    expect(toPermissionState('undetermined')).toBe('undetermined')
  })

  // A blocked permission and a denied one are the same thing to the user:
  // the system prompt no longer appears. The distinction that matters is
  // only "will the prompt still come?".
  it('maps "denied" to denied', () => {
    expect(toPermissionState('denied')).toBe('denied')
  })

  it('maps "blocked" to denied — the prompt will not come again', () => {
    expect(toPermissionState('blocked')).toBe('denied')
  })

  it('maps an unknown status to denied — the restricted reading', () => {
    expect(toPermissionState('something-else')).toBe('denied')
  })

  it('maps an undefined status to denied', () => {
    expect(toPermissionState(undefined)).toBe('denied')
  })
})

describe('readPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedCamera.mockResolvedValue({ status: 'granted' } as never)
    mockedMic.mockResolvedValue({ status: 'granted' } as never)
    mockedLibrary.mockResolvedValue({ status: 'granted' } as never)
    mockedLocation.mockResolvedValue({ status: 'granted' } as never)
  })

  it('reads all four permissions', async () => {
    const snapshot = await readPermissions()

    expect(snapshot).toEqual({
      camera: 'granted',
      microphone: 'granted',
      mediaLibrary: 'granted',
      location: 'granted',
    })
  })

  // The read must never prompt. A prompt storm at mount is the exact
  // failure FR-PERMS-1 forbids.
  it('never prompts — it only reads', async () => {
    await readPermissions()

    expect(mockedCamera).toHaveBeenCalledTimes(1)
    expect(mockedMic).toHaveBeenCalledTimes(1)
    expect(mockedLibrary).toHaveBeenCalledTimes(1)
    expect(mockedLocation).toHaveBeenCalledTimes(1)
  })

  it('maps a blocked status to denied', async () => {
    mockedCamera.mockResolvedValue({ status: 'blocked' } as never)

    const snapshot = await readPermissions()

    expect(snapshot.camera).toBe('denied')
  })

  // A failed query must never be read as "granted".
  it('falls back to denied when the camera query throws', async () => {
    mockedCamera.mockRejectedValue(new Error('boom'))

    const snapshot = await readPermissions()

    expect(snapshot.camera).toBe('denied')
  })

  it('falls back to denied when the location query throws', async () => {
    mockedLocation.mockRejectedValue(new Error('boom'))

    const snapshot = await readPermissions()

    expect(snapshot.location).toBe('denied')
  })

  it('does not crash when every query throws', async () => {
    mockedCamera.mockRejectedValue(new Error('boom'))
    mockedMic.mockRejectedValue(new Error('boom'))
    mockedLibrary.mockRejectedValue(new Error('boom'))
    mockedLocation.mockRejectedValue(new Error('boom'))

    const snapshot = await readPermissions()

    expect(snapshot).toEqual(RESTRICTED_PERMISSIONS)
  })

  it('keeps the other permissions when only one query fails', async () => {
    mockedMic.mockRejectedValue(new Error('boom'))

    const snapshot = await readPermissions()

    expect(snapshot.microphone).toBe('denied')
    expect(snapshot.camera).toBe('granted')
    expect(snapshot.mediaLibrary).toBe('granted')
    expect(snapshot.location).toBe('granted')
  })
})

describe('RESTRICTED_PERMISSIONS', () => {
  it('denies everything — the most restricted reading', () => {
    expect(Object.values(RESTRICTED_PERMISSIONS).every((state) => state === 'denied')).toBe(true)
  })
})

describe('entryPointAvailability', () => {
  it('offers everything when every permission is granted', () => {
    expect(entryPointAvailability(ALL_GRANTED)).toEqual({
      canRecordVideo: true,
      canTakePhoto: true,
      canPickFromGallery: true,
      canUploadFile: true,
    })
  })

  // Hidden, not disabled. With the camera denied the video card and the
  // camera half of the photo card are not rendered at all.
  it('hides the video and camera paths when the camera is denied', () => {
    const availability = entryPointAvailability({
      ...ALL_GRANTED,
      camera: 'denied',
    })

    expect(availability.canRecordVideo).toBe(false)
    expect(availability.canTakePhoto).toBe(false)
  })

  // A video capture needs the mic — a silent video is not the evidence the
  // citizen is trying to file.
  it('hides the video card when only the microphone is denied', () => {
    const availability = entryPointAvailability({
      ...ALL_GRANTED,
      microphone: 'denied',
    })

    expect(availability.canRecordVideo).toBe(false)
  })

  it('keeps the photo camera path when only the microphone is denied', () => {
    const availability = entryPointAvailability({
      ...ALL_GRANTED,
      microphone: 'denied',
    })

    expect(availability.canTakePhoto).toBe(true)
  })

  // The gallery and file paths do not need the camera. They must survive.
  it('keeps the gallery and file paths when the camera is denied', () => {
    const availability = entryPointAvailability({
      ...ALL_GRANTED,
      camera: 'denied',
    })

    expect(availability.canPickFromGallery).toBe(true)
    expect(availability.canUploadFile).toBe(true)
  })

  it('keeps the camera path when only the gallery is denied', () => {
    const availability = entryPointAvailability({
      ...ALL_GRANTED,
      mediaLibrary: 'denied',
    })

    expect(availability.canPickFromGallery).toBe(false)
    expect(availability.canTakePhoto).toBe(true)
    expect(availability.canRecordVideo).toBe(true)
    expect(availability.canUploadFile).toBe(true)
  })

  // An undetermined permission is not yet denied — the prompt has not
  // fired. The entry point is still offered, and the prompt fires on the
  // tap. Hiding it would make the just-in-time prompt unreachable.
  it('offers the entry points for an undetermined permission', () => {
    const availability = entryPointAvailability({
      camera: 'undetermined',
      microphone: 'undetermined',
      mediaLibrary: 'undetermined',
      location: 'undetermined',
    })

    expect(availability.canRecordVideo).toBe(true)
    expect(availability.canTakePhoto).toBe(true)
    expect(availability.canPickFromGallery).toBe(true)
    expect(availability.canUploadFile).toBe(true)
  })

  it('hides only the entry points that need the denied permission', () => {
    const availability = entryPointAvailability({
      camera: 'undetermined',
      microphone: 'denied',
      mediaLibrary: 'undetermined',
      location: 'undetermined',
    })

    expect(availability.canRecordVideo).toBe(false)
    expect(availability.canTakePhoto).toBe(true)
    expect(availability.canPickFromGallery).toBe(true)
  })

  it('always offers the file path — it needs no permission', () => {
    const availability = entryPointAvailability(ALL_DENIED)

    expect(availability.canUploadFile).toBe(true)
  })
})

describe('needsManualLocation', () => {
  it('is false when the location permission is granted', () => {
    expect(needsManualLocation(ALL_GRANTED)).toBe(false)
  })

  it('is true when the location permission is denied', () => {
    expect(needsManualLocation({ ...ALL_GRANTED, location: 'denied' })).toBe(true)
  })

  it('is true when the location permission is undetermined', () => {
    expect(needsManualLocation({ ...ALL_GRANTED, location: 'undetermined' })).toBe(true)
  })
})

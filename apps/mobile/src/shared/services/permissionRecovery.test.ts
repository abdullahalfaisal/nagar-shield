import {
  openSystemSettings,
  recoverPermission,
  recoveryAction,
  requestPermission,
} from './permissionRecovery';

/**
 * The recovery path.
 *
 * The rule the whole module exists to enforce is simple: **the button's
 * label must match the action it performs.**
 *
 * On Android, once a permission is denied with "don't ask again", the system
 * prompt no longer appears. A button labelled "Ask again" that opens the
 * settings page teaches citizens not to believe the app. So the recovery
 * routes on the permission's state:
 *
 *   * `undetermined` → the prompt still comes → ask again;
 *   * `denied` → the prompt will not come → open the OS settings page.
 *
 * And neither path ever throws: a permission failure is a **normal
 * outcome**, not a crash.
 */

jest.mock('expo-camera', () => ({
  Camera: {
    requestMicrophonePermissionsAsync: jest.fn(),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn(),
}));

import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';

const mockedMic = Camera.Camera.requestMicrophonePermissionsAsync as jest.MockedFunction<
  typeof Camera.Camera.requestMicrophonePermissionsAsync
>;
const mockedCamera = ImagePicker.requestCameraPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestCameraPermissionsAsync
>;
const mockedLibrary = ImagePicker.requestMediaLibraryPermissionsAsync as jest.MockedFunction<
  typeof ImagePicker.requestMediaLibraryPermissionsAsync
>;
const mockedLocation = Location.requestForegroundPermissionsAsync as jest.MockedFunction<
  typeof Location.requestForegroundPermissionsAsync
>;
const mockedOpenSettings = Linking.openSettings as jest.MockedFunction<typeof Linking.openSettings>;

describe('recoveryAction', () => {
  it('asks again for an undetermined permission — the OS will still prompt', () => {
    expect(recoveryAction('undetermined')).toBe('prompt');
  });

  it('asks again for a granted permission', () => {
    expect(recoveryAction('granted')).toBe('prompt');
  });

  // A denied permission will not prompt again. The settings page is the
  // only route back.
  it('opens the settings page for a denied permission', () => {
    expect(recoveryAction('denied')).toBe('settings');
  });
});

describe('requestPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCamera.mockResolvedValue({ status: 'granted' } as never);
    mockedMic.mockResolvedValue({ status: 'granted' } as never);
    mockedLibrary.mockResolvedValue({ status: 'granted' } as never);
    mockedLocation.mockResolvedValue({ status: 'granted' } as never);
  });

  it('requests the camera and maps the status', async () => {
    mockedCamera.mockResolvedValue({ status: 'denied' } as never);

    await expect(requestPermission('camera')).resolves.toBe('denied');
    expect(mockedCamera).toHaveBeenCalledTimes(1);
  });

  it('requests the microphone and maps the status', async () => {
    mockedMic.mockResolvedValue({ status: 'undetermined' } as never);

    await expect(requestPermission('microphone')).resolves.toBe('undetermined');
    expect(mockedMic).toHaveBeenCalledTimes(1);
  });

  it('requests the media library and maps the status', async () => {
    mockedLibrary.mockResolvedValue({ status: 'granted' } as never);

    await expect(requestPermission('mediaLibrary')).resolves.toBe('granted');
    expect(mockedLibrary).toHaveBeenCalledTimes(1);
  });

  it('requests the location and maps the status', async () => {
    mockedLocation.mockResolvedValue({ status: 'blocked' } as never);

    await expect(requestPermission('location')).resolves.toBe('denied');
    expect(mockedLocation).toHaveBeenCalledTimes(1);
  });

  // A failed request is a denied permission, not a crash.
  it('resolves to denied when the request throws', async () => {
    mockedCamera.mockRejectedValue(new Error('boom'));

    await expect(requestPermission('camera')).resolves.toBe('denied');
  });
});

describe('openSystemSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the OS settings page', async () => {
    mockedOpenSettings.mockResolvedValue(undefined as never);

    await openSystemSettings();

    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  // A crash here would be worse than a dead button.
  it('does not throw when the OS refuses to open the page', async () => {
    mockedOpenSettings.mockRejectedValue(new Error('nope'));

    await expect(openSystemSettings()).resolves.toBeUndefined();
  });
});

describe('recoverPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCamera.mockResolvedValue({ status: 'granted' } as never);
    mockedMic.mockResolvedValue({ status: 'granted' } as never);
    mockedLibrary.mockResolvedValue({ status: 'granted' } as never);
    mockedLocation.mockResolvedValue({ status: 'granted' } as never);
    mockedOpenSettings.mockResolvedValue(undefined as never);
  });

  it('re-triggers the system prompt for an undetermined permission', async () => {
    const outcome = await recoverPermission('camera', 'undetermined');

    expect(outcome.action).toBe('prompt');
    expect(outcome.state).toBe('granted');
    expect(outcome.granted).toBe(true);
    expect(mockedCamera).toHaveBeenCalledTimes(1);
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });

  it('reports the denial when the user says no at the prompt', async () => {
    mockedCamera.mockResolvedValue({ status: 'denied' } as never);

    const outcome = await recoverPermission('camera', 'undetermined');

    expect(outcome.action).toBe('prompt');
    expect(outcome.state).toBe('denied');
    expect(outcome.granted).toBe(false);
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });

  // The denied branch never shows a prompt that will not come. It opens the
  // OS settings page, where the user flips the switch themselves.
  it('opens the settings page for a denied permission', async () => {
    const outcome = await recoverPermission('camera', 'denied');

    expect(outcome.action).toBe('settings');
    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
    expect(mockedCamera).not.toHaveBeenCalled();
  });

  // The app did not grant it and has not verified it. It reports the
  // permission as it was, not as the app hopes it became.
  it('does not claim the permission was granted after opening the settings page', async () => {
    const outcome = await recoverPermission('camera', 'denied');

    expect(outcome.granted).toBe(false);
    expect(outcome.state).toBe('denied');
  });

  it('does not throw when the settings page cannot be opened', async () => {
    mockedOpenSettings.mockRejectedValue(new Error('nope'));

    const outcome = await recoverPermission('camera', 'denied');

    expect(outcome.action).toBe('settings');
    expect(outcome.granted).toBe(false);
  });

  it('does not throw when the prompt request fails', async () => {
    mockedCamera.mockRejectedValue(new Error('boom'));

    const outcome = await recoverPermission('camera', 'undetermined');

    expect(outcome.action).toBe('prompt');
    expect(outcome.state).toBe('denied');
    expect(outcome.granted).toBe(false);
  });
});

import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { toPermissionState, type PermissionName, type PermissionState } from './permissions';

/**
 * The permission recovery path.
 *
 * A denied permission is not a dead end, but the path back is not the same
 * for every permission:
 *
 *   * an **undetermined** permission will still prompt — the app can ask
 *     again, just-in-time;
 *   * a **denied** one will not. On Android, once a permission is denied
 *     with "don't ask again" the system prompt no longer appears, and the
 *     OS settings page is the only way back.
 *
 * So the recovery affordance either re-triggers the system prompt or
 * deep-links to the OS settings page, and it says plainly which one it is
 * going to do. A button that promises a prompt and shows a settings page
 * teaches users not to believe the app.
 */

/**
 * What the recovery action will do.
 *
 * `prompt` re-triggers the system dialog; `settings` opens the OS settings
 * page, which is the only route back for a permission the OS has stopped
 * prompting for.
 */
export type RecoveryAction = 'prompt' | 'settings';

export interface RecoveryOutcome {
  /** The action that was taken. */
  action: RecoveryAction;
  /** The permission's state after the action. */
  state: PermissionState;
  /** `true` when the permission is now granted. */
  granted: boolean;
}

/**
 * Requests a permission, just-in-time.
 *
 * The prompt fires here — at the moment the user asked for it — and never
 * anywhere else. A permission that is already granted resolves without a
 * prompt; a permission the OS has blocked resolves to `'denied'` without
 * showing anything.
 */
export async function requestPermission(name: PermissionName): Promise<PermissionState> {
  try {
    switch (name) {
      case 'camera': {
        const response = await ImagePicker.requestCameraPermissionsAsync();
        return toPermissionState(response.status);
      }
      case 'microphone': {
        const response = await Camera.Camera.requestMicrophonePermissionsAsync();
        return toPermissionState(response.status);
      }
      case 'mediaLibrary': {
        const response = await ImagePicker.requestMediaLibraryPermissionsAsync();
        return toPermissionState(response.status);
      }
      case 'location': {
        const response = await Location.requestForegroundPermissionsAsync();
        return toPermissionState(response.status);
      }
    }
  } catch {
    // A failed request is a denied permission, not a crash.
    return 'denied';
  }
}

/**
 * Opens the app's page in the OS settings.
 *
 * This is the only route back for a permission the OS has stopped prompting
 * for. The user flips the switch themselves; the app never claims it can
 * grant a permission on the citizen's behalf.
 */
export async function openSystemSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // The OS refused to open the settings page. There is nothing the app
    // can do about it, and a crash here would be worse than a dead button.
  }
}

/**
 * The recovery action for a permission in a given state.
 *
 * An undetermined permission can still prompt, so the app asks again. A
 * denied one cannot, so the app opens the settings page — and says so.
 */
export function recoveryAction(state: PermissionState): RecoveryAction {
  return state === 'denied' ? 'settings' : 'prompt';
}

/**
 * Runs the recovery for a permission and reports what happened.
 *
 * The two branches are genuinely different, and the caller is told which one
 * ran:
 *
 *   * `prompt` — the system dialog was shown and the user answered it. The
 *     outcome is the permission's **new** state.
 *   * `settings` — the OS settings page was opened. The permission's state
 *     is **unchanged** — the user has to flip the switch themselves, and
 *     the app cannot know whether they did.
 *
 * The `settings` branch reports `granted: false` even when the permission
 * happens to have been granted in the meantime, because the app did not
 * grant it and has not verified it.
 */
export async function recoverPermission(
  name: PermissionName,
  state: PermissionState,
): Promise<RecoveryOutcome> {
  if (recoveryAction(state) === 'settings') {
    await openSystemSettings();
    return { action: 'settings', state, granted: false };
  }

  const next = await requestPermission(name);
  return { action: 'prompt', state: next, granted: next === 'granted' };
}

import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

/**
 * The permission state.
 *
 * Four permissions matter to the Capture screen, and each one is read
 * **without prompting**. The prompts fire at the moment the user taps the
 * entry point that needs them — never on app mount, never on screen mount,
 * never as part of a first render (FR-PERMS-1).
 *
 * The shape of a permission, from the user's point of view, is a three-way
 * question, not a boolean:
 *
 *   * **granted** — the entry point works;
 *   * **denied** — the OS will not prompt again, so the entry point is
 *     hidden and the only way back is the OS settings page;
 *   * **undetermined** — the OS will still prompt, so the entry point is
 *     offered and the prompt fires when it is tapped.
 *
 * A **blocked** permission and a **denied** one are the same thing to the
 * user: the system prompt no longer appears. The distinction that matters is
 * only "will the prompt still come?".
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** The four permissions the app reads. */
export type PermissionName = 'camera' | 'microphone' | 'mediaLibrary' | 'location';

/** The state of all four permissions at a point in time. */
export interface PermissionSnapshot {
  camera: PermissionState;
  microphone: PermissionState;
  mediaLibrary: PermissionState;
  location: PermissionState;
}

/**
 * The state the app assumes when it **cannot** read the permission state.
 *
 * The most restricted state. A failed query must never be read as "granted":
 * the entry point would be offered, the tap would fail, and the user would
 * see a broken control. Hiding it is the honest reading of "I do not know".
 */
export const RESTRICTED_PERMISSIONS: PermissionSnapshot = {
  camera: 'denied',
  microphone: 'denied',
  mediaLibrary: 'denied',
  location: 'denied',
};

/**
 * Maps an Expo permission status onto the three-way state.
 *
 * `undetermined` means the OS will still show the prompt. `denied` and
 * `blocked` both mean it will not — from the user's point of view they are
 * the same, and the only path back is the OS settings page.
 */
export function toPermissionState(status: string | undefined): PermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

/**
 * Reads one permission's state, without prompting.
 *
 * A failed query resolves to `'denied'` — the restricted reading — rather
 * than throwing. A denied permission is a **normal outcome**, not an error,
 * and the caller degrades to a different entry point instead of trapping the
 * user.
 */
async function readPermission(
  read: () => Promise<{ status: string }>,
): Promise<PermissionState> {
  try {
    const response = await read();
    return toPermissionState(response.status);
  } catch {
    return 'denied';
  }
}

/**
 * Reads all four permissions, without prompting.
 *
 * The reads run together — the screen needs the whole picture before it
 * renders, and a screen that rendered with half the answer would briefly
 * offer an entry point it then has to take away.
 */
export async function readPermissions(): Promise<PermissionSnapshot> {
  const [camera, microphone, mediaLibrary, location] = await Promise.all([
    readPermission(() => Camera.Camera.getCameraPermissionsAsync()),
    readPermission(() => Camera.Camera.getMicrophonePermissionsAsync()),
    readPermission(() => ImagePicker.getMediaLibraryPermissionsAsync()),
    readPermission(() => Location.getForegroundPermissionsAsync()),
  ]);

  return { camera, microphone, mediaLibrary, location };
}

/**
 * The entry points the Capture screen may offer.
 *
 * This is the whole degradation rule, in one place, and it is a **pure
 * function** so it can be tested without a device.
 */
export interface EntryPointAvailability {
  /** The video capture card. Needs the camera **and** the microphone. */
  canRecordVideo: boolean;
  /** The camera half of the photo card. Needs the camera. */
  canTakePhoto: boolean;
  /** The gallery half of the photo card. Needs the media library. */
  canPickFromGallery: boolean;
  /** The file upload card. Needs nothing. */
  canUploadFile: boolean;
}

/**
 * Which entry points are available, given the permission state.
 *
 * **Hidden, not disabled.** A denied permission removes the entry point
 * entirely: the video capture card is not rendered and the camera half of the
 * photo card is not offered. A disabled control the user cannot use is a
 * dead end; a hidden one is honest. The screen must not reserve a blank
 * card where the prototype has an upload card.
 *
 * The microphone is folded into the video card because a video capture
 * **needs** the mic — a silent video is not the evidence a citizen is
 * trying to file.
 *
 * **Only `denied` hides.** An `undetermined` permission still shows its
 * entry point, because the system prompt fires **just-in-time** — at the
 * moment the entry point is tapped. Hiding an undetermined entry point
 * would make the prompt unreachable: the card would never be rendered, so
 * it could never be tapped, so the dialog would never appear. The citizen
 * would be left with an entry point that never appears and a permission
 * that is never asked for.
 */
export function entryPointAvailability(
  permissions: PermissionSnapshot,
): EntryPointAvailability {
  const usable = (state: PermissionState): boolean => state !== 'denied';

  return {
    canRecordVideo: usable(permissions.camera) && usable(permissions.microphone),
    canTakePhoto: usable(permissions.camera),
    canPickFromGallery: usable(permissions.mediaLibrary),
    canUploadFile: true,
  };
}

/**
 * Whether the location card should show the manual-entry fallback.
 *
 * The fallback appears when the location permission is **not** granted. An
 * undetermined permission is not yet denied — the prompt has not fired — so
 * the card shows the acquiring state and the fix is requested.
 */
export function needsManualLocation(permissions: PermissionSnapshot): boolean {
  return permissions.location !== 'granted';
}

/**
 * The permissions a citizen can act on from Settings.
 *
 * A permission that is `undetermined` or `granted` can be re-requested
 * through the system prompt; a `denied` one can only be changed in the OS
 * settings page, so the copy says so rather than showing a prompt that will
 * not come.
 */
export interface RecoverablePermission {
  name: PermissionName;
  state: PermissionState;
  /** `true` when the OS will still show the system prompt. */
  canPromptAgain: boolean;
  /** What the permission would unlock. */
  unlocks: string;
}

/** The permissions worth offering to recover, in the order they matter. */
export const RECOVERABLE_PERMISSIONS: PermissionName[] = [
  'camera',
  'microphone',
  'mediaLibrary',
  'location',
];

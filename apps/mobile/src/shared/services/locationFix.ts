import * as Location from 'expo-location';
import { toPermissionState, type PermissionState } from './permissions';

/**
 * The Location Sharing fix — taken **just-in-time**.
 *
 * The Location Sharing screen must **not** take a fix when it opens. The
 * permission dialog fires at the moment the user taps the share CTA and
 * nothing before that (FR-PERMS-1). A screen that prompts on mount teaches
 * users that the app asks for things before they have asked for anything.
 *
 * So the fix is a **function**, not a hook. The screen calls it from the
 * CTA handler and nowhere else.
 *
 * The failure modes are all **normal outcomes**, not errors:
 *
 *   * the permission is denied → the caller offers the two fallbacks
 *     (manual coordinate entry and share-without-location);
 *   * the provider is off or the fix times out → the caller offers the same
 *     two fallbacks.
 *
 * The share is never blocked waiting on the fix.
 */

/** The outcome of a just-in-time fix attempt. */
export type FixOutcome =
  /** The fix was taken. */
  | { status: 'ready'; lat: number; lng: number; accuracyM: number | null }
  /** The user has not granted location access. */
  | { status: 'denied'; permission: PermissionState }
  /** The permission was never determined — the prompt was refused or dismissed. */
  | { status: 'undetermined'; permission: PermissionState }
  /** The provider is off, or the fix timed out. */
  | { status: 'unavailable' };

/**
 * Requests the permission and takes the fix — in that order, and only when
 * the caller asks.
 *
 * The permission is requested **just-in-time**, immediately before the fix
 * is taken, so the dialog appears at the moment the user asked for the
 * share rather than when the screen opened.
 */
export async function takeLocationFix(): Promise<FixOutcome> {
  let permission: PermissionState;

  try {
    const response = await Location.requestForegroundPermissionsAsync();
    permission = toPermissionState(response.status);
  } catch {
    // A failed permission query is a denied permission, not a crash. The
    // screen degrades.
    return { status: 'denied', permission: 'denied' };
  }

  if (permission === 'denied') {
    return { status: 'denied', permission };
  }

  if (permission !== 'granted') {
    // The prompt was shown and the user did not grant it — either they
    // refused or they dismissed it. Either way there is no fix.
    return { status: 'undetermined', permission };
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      status: 'ready',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
    };
  } catch {
    // The provider is disabled, or the fix timed out. The user is offered
    // the manual path; the share is never blocked.
    return { status: 'unavailable' };
  }
}

/**
 * Validates a manually entered coordinate pair.
 *
 * A manual entry has **no fix accuracy**, so the returned accuracy is
 * `null` — never `0`, and never an estimate. There is no honest accuracy to
 * report for a pair of typed numbers, and a fabricated number is worse than
 * none.
 *
 * The validation is strict on purpose: a latitude outside ±90 or a
 * longitude outside ±180 is rejected rather than clamped, because a clamped
 * coordinate is a different place and the user would not know it moved.
 */
export function parseManualCoordinates(
  latText: string,
  lngText: string,
): { ok: true; lat: number; lng: number; accuracyM: null } | { ok: false } {
  const lat = Number(latText.trim());
  const lng = Number(lngText.trim());

  if (latText.trim().length === 0 || lngText.trim().length === 0) return { ok: false };

  // `Number('')` is 0 and `Number('abc')` is NaN — both are rejected.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false };

  if (lat < -90 || lat > 90) return { ok: false };
  if (lng < -180 || lng > 180) return { ok: false };

  // A coordinate of `0` is a real coordinate — the equator and the prime
  // meridian — and is never treated as absent.
  return { ok: true, lat, lng, accuracyM: null };
}

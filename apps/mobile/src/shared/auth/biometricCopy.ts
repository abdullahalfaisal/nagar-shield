/**
 * Pure helpers for the biometric gate's copy and counting.
 *
 * Kept out of the screen so the two things that were wrong — the "attempts
 * left" number and the fingerprint wording on a face-unlock phone — can be
 * proved without rendering it.
 */

import { BIOMETRIC_FAILS_TO_PASSWORD } from '@nagar-shield/shared'

export type BiometricKind = 'fingerprint' | 'facial' | null

/**
 * Attempts left before the password screen takes over.
 *
 * The server's `fail_count` is the number of failures *so far*; showing it as
 * "attempts left" counted the wrong way (one failure read as "1 left" when two
 * remain).
 */
export function remainingBiometricAttempts(failCount: number): number {
  return Math.max(0, BIOMETRIC_FAILS_TO_PASSWORD - failCount)
}

/** The copy keys and icon for the detected biometric kind. */
export function biometricCopyFor(kind: BiometricKind): {
  promptKey: 'auth.biometricPrompt' | 'auth.biometricPromptFace'
  failedKey: 'auth.biometricFailed' | 'auth.biometricFailedFace'
  icon: 'fingerprint' | 'face'
} {
  return kind === 'facial'
    ? {
        promptKey: 'auth.biometricPromptFace',
        failedKey: 'auth.biometricFailedFace',
        icon: 'face',
      }
    : {
        promptKey: 'auth.biometricPrompt',
        failedKey: 'auth.biometricFailed',
        icon: 'fingerprint',
      }
}

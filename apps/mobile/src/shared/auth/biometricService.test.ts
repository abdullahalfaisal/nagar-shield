import * as LocalAuthentication from 'expo-local-authentication'
import { runBiometricPrompt } from '@/shared/auth/biometricService'

/**
 * The outcome classification is the part of the biometric gate that has to
 * be right: it decides whether an attempt counts against the user.
 *
 * The story's edge-case table is explicit about the split:
 *
 *   * a **cancelled** prompt counts as a failure — the prompt is the gate,
 *     and a gate a dismissal walks past for free is not a gate;
 *   * a device with **no enrolled biometrics** does not count — that is a
 *     capability question, not a decision by the user.
 *
 * Getting either wrong either punishes the user for cancelling, or lets
 * the auto-disable rule be evaded by switching the sensor off.
 */

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}))

// The service imports the Supabase client for the accounting RPC, and the
// client pulls in AsyncStorage and SecureStore — native modules that need
// their own mocks under Jest. They are irrelevant to the outcome
// classification, so they are stubbed out here rather than configuring a
// global setup file for one suite.
jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
  secureStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}))

const mocked = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>

function authResult(result: { success: boolean; error?: string }) {
  mocked.authenticateAsync.mockResolvedValue(result as never)
}

describe('runBiometricPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports a successful match', async () => {
    authResult({ success: true })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('success')
  })

  it('counts a user cancellation as a failure', async () => {
    authResult({ success: false, error: 'user_cancel' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })

  it('counts an app cancellation as a failure', async () => {
    authResult({ success: false, error: 'app_cancel' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })

  it('counts a system cancellation as a failure', async () => {
    authResult({ success: false, error: 'system_cancel' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })

  it('counts a device-credential fallback as a failure', async () => {
    // The gate disables the device fallback so a PIN cannot stand in for
    // the biometric. If the OS offers one anyway, it is not a biometric
    // match.
    authResult({ success: false, error: 'user_fallback' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })

  it('does not count a device with nothing enrolled', async () => {
    authResult({ success: false, error: 'not_enrolled' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('unavailable')
  })

  it('does not count an unavailable biometric sensor', async () => {
    authResult({ success: false, error: 'not_available' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('unavailable')
  })

  it('counts a lockout as a failure', async () => {
    authResult({ success: false, error: 'lockout' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })

  it('counts an authentication failure as a failure', async () => {
    authResult({ success: false, error: 'authentication_failed' })
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })

  it('treats a thrown error as a failure rather than crashing', async () => {
    mocked.authenticateAsync.mockRejectedValue(new Error('module exploded') as never)
    await expect(runBiometricPrompt('Unlock')).resolves.toBe('failed')
  })
})

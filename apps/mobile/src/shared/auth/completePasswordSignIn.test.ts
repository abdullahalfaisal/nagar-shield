/**
 * The shared "finish sign-in" step (review row H10).
 *
 * Login, sign-up and the password reset all end in a session the user made
 * with a password. Only login used to record a session window and tell the
 * biometric gate about the password; the other two left a session that never
 * expired and a fingerprint prompt straight after the new password.
 *
 * The claims are about **order**, so every call is logged into one sequence:
 * the window must be in force before the session is written, and the gate's
 * flags must only change once a session exists.
 */

const mockSequence: string[] = []
let mockPolicy: { remembered: boolean; windowMs: number; persistedAt: number } | undefined

jest.mock('@/shared/api/session-storage', () => ({
  setSessionPersistencePolicy: jest.fn(
    (policy: { remembered: boolean; windowMs: number; persistedAt: number }) => {
      mockSequence.push('setSessionPersistencePolicy')
      mockPolicy = policy
    },
  ),
  clearSessionPersistencePolicy: jest.fn(() => {
    mockSequence.push('clearSessionPersistencePolicy')
    mockPolicy = undefined
  }),
  windowForRememberMe: (rememberMe: boolean) =>
    rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
}))

jest.mock('@/shared/auth/biometricService', () => ({
  resetBiometricFailures: jest.fn(async () => {
    mockSequence.push('resetBiometricFailures')
  }),
  clearLocalBiometricState: jest.fn(async () => {
    mockSequence.push('clearLocalBiometricState')
  }),
}))

jest.mock('@/shared/auth/useBiometricGate', () => ({
  markPasswordSignIn: jest.fn(async () => {
    mockSequence.push('markPasswordSignIn')
  }),
}))

import { completePasswordSignIn } from '@/shared/auth/completePasswordSignIn'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  mockSequence.length = 0
  mockPolicy = undefined
})

describe('completePasswordSignIn', () => {
  it('records the window, creates the session, then tells the gate — in that order', async () => {
    const result = await completePasswordSignIn({ rememberMe: false }, async () => {
      mockSequence.push('createSession')
      return 'user-1'
    })

    expect(result).toBe('user-1')
    expect(mockSequence).toEqual([
      'setSessionPersistencePolicy',
      'createSession',
      'markPasswordSignIn',
      'resetBiometricFailures',
      'clearLocalBiometricState',
    ])
  })

  it('gives an unremembered session the 24-hour window', async () => {
    // Sign-up and the reset pass `false`: they have no Remember-me switch.
    await completePasswordSignIn({ rememberMe: false }, async () => undefined)

    expect(mockPolicy).toMatchObject({ remembered: false, windowMs: DAY })
  })

  it('gives a remembered session the 30-day window', async () => {
    await completePasswordSignIn({ rememberMe: true }, async () => undefined)

    expect(mockPolicy).toMatchObject({ remembered: true, windowMs: 30 * DAY })
  })

  it('dates the window from the sign-in', async () => {
    const before = Date.now()
    await completePasswordSignIn({ rememberMe: false }, async () => undefined)

    expect(mockPolicy?.persistedAt).toBeGreaterThanOrEqual(before)
    expect(mockPolicy?.persistedAt).toBeLessThanOrEqual(Date.now())
  })

  it('leaves no policy and no grace flag behind when the session was not created', async () => {
    const failure = new Error('Invalid login credentials')

    await expect(
      completePasswordSignIn({ rememberMe: true }, async () => {
        mockSequence.push('createSession')
        throw failure
      }),
    ).rejects.toBe(failure)

    // A policy left behind would govern the *next* session; a password flag
    // with no password sign-in behind it would skip the lock.
    expect(mockPolicy).toBeUndefined()
    expect(mockSequence).toEqual([
      'setSessionPersistencePolicy',
      'createSession',
      'clearSessionPersistencePolicy',
    ])
  })
})

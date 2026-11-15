import * as LocalAuthentication from 'expo-local-authentication'

/**
 * The biometric gate's decision, its re-arm rule, and the way it reads the
 * opt-in (review rows H9).
 *
 * The defects this file pins:
 *
 *   * a failed profile read (`supabase-js` returns `{ error }`, it does not
 *     throw) ended in `not-required` and opened the app;
 *   * a launch with no network could not read the opt-in and so skipped the
 *     lock;
 *   * an opted-in device whose fingerprints were removed opened the app;
 *   * the gate was decided only once per user id, so coming back to the app
 *     from the recent-apps list skipped it.
 */

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}))

/** The device store, in memory. */
const mockStore = new Map<string, string>()

/** What the `profiles` read answers, per test. */
let mockProfileRead: () => Promise<{ data: unknown; error: unknown }>

jest.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => mockProfileRead(),
        }),
      }),
    })),
  },
  secureStore: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value)
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key)
    }),
  },
}))

import {
  OPT_IN_READ_TIMEOUT_MS,
  REARM_AFTER_BACKGROUND_MS,
  decideGate,
  evaluateGate,
  markGatePassed,
  markPasswordSignIn,
  trackAppState,
} from '@/shared/auth/useBiometricGate'
import { mirrorBiometricOptIn, readBiometricOptInMirror } from '@/shared/auth/biometricService'

const mockedLocalAuth = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>

const USER = 'user-a'

function serverSays(optIn: boolean) {
  mockProfileRead = async () => ({ data: { biometric_opt_in: optIn }, error: null })
}

function serverFails() {
  // The shape `supabase-js` really returns for a failed query: no throw.
  mockProfileRead = async () => ({ data: null, error: { message: 'Failed to fetch' } })
}

function deviceCanDoBiometrics(can: boolean) {
  mockedLocalAuth.hasHardwareAsync.mockResolvedValue(can)
  mockedLocalAuth.isEnrolledAsync.mockResolvedValue(can)
}

beforeEach(() => {
  mockStore.clear()
  jest.clearAllMocks()
  serverSays(false)
  deviceCanDoBiometrics(true)
})

describe('decideGate', () => {
  const base = {
    signedInWithPassword: false,
    gatePassed: false,
    optIn: true as boolean | null,
    biometricAvailable: true,
  }

  it('locks an opted-in returning session behind the fingerprint', () => {
    expect(decideGate(base)).toBe('required')
  })

  it('opens the app for a user who is not opted in', () => {
    expect(decideGate({ ...base, optIn: false })).toBe('not-required')
  })

  it('fails closed to the password screen when the opt-in is unknown', () => {
    expect(decideGate({ ...base, optIn: null })).toBe('password-required')
  })

  it('sends an opted-in user to the password when the device cannot do biometrics', () => {
    // It used to open the app: removing the enrolled fingerprints in the
    // phone's settings was enough to walk past the lock.
    expect(decideGate({ ...base, biometricAvailable: false })).toBe('password-required')
  })

  it('does not ask again right after a password or a passed gate', () => {
    expect(decideGate({ ...base, signedInWithPassword: true })).toBe('not-required')
    expect(decideGate({ ...base, gatePassed: true })).toBe('not-required')
    expect(decideGate({ ...base, optIn: null, signedInWithPassword: true })).toBe('not-required')
  })
})

describe('trackAppState — the re-arm rule', () => {
  const t0 = 1_000_000

  it('re-arms after a background that lasted the threshold', () => {
    const away = trackAppState(null, 'background', t0)
    expect(away.rearm).toBe(false)

    const back = trackAppState(away.backgroundedAt, 'active', t0 + REARM_AFTER_BACKGROUND_MS)
    expect(back).toEqual({ backgroundedAt: null, rearm: true })
  })

  it('does not re-arm for a short background — a permission dialog, the camera', () => {
    const away = trackAppState(null, 'background', t0)
    const back = trackAppState(away.backgroundedAt, 'active', t0 + 5_000)
    expect(back.rearm).toBe(false)
  })

  it('ignores the inactive/active pair a system prompt causes', () => {
    // The iOS biometric sheet, the notification shade: the app is never
    // backgrounded, so the user has not left.
    const inactive = trackAppState(null, 'inactive', t0)
    const back = trackAppState(inactive.backgroundedAt, 'active', t0 + 10 * 60_000)
    expect(back.rearm).toBe(false)
  })

  it('does not re-arm on an active event with no background before it', () => {
    // The late "active" that follows a prompt dismissed before this layout
    // mounted must not put the prompt straight back up.
    expect(trackAppState(null, 'active', t0).rearm).toBe(false)
  })

  it('keeps the first background time through a flicker', () => {
    let state = trackAppState(null, 'background', t0)
    state = trackAppState(state.backgroundedAt, 'inactive', t0 + 30_000)
    state = trackAppState(state.backgroundedAt, 'background', t0 + 40_000)
    expect(state.backgroundedAt).toBe(t0)

    expect(
      trackAppState(state.backgroundedAt, 'active', t0 + REARM_AFTER_BACKGROUND_MS).rearm,
    ).toBe(true)
  })

  it('re-arms when the clock went backwards while away', () => {
    const away = trackAppState(null, 'background', t0)
    expect(trackAppState(away.backgroundedAt, 'active', t0 - 1).rearm).toBe(true)
  })
})

describe('evaluateGate', () => {
  it('fails closed when the server answers with an error and nothing is stored', async () => {
    serverFails()

    const result = await evaluateGate(USER)

    expect(result.state).toBe('password-required')
    expect(result.optIn).toBeNull()
  })

  it('fails closed when the read throws', async () => {
    mockProfileRead = async () => {
      throw new Error('boom')
    }

    await expect(evaluateGate(USER)).resolves.toMatchObject({ state: 'password-required' })
  })

  it('treats a missing profile row as no answer, not as "not opted in"', async () => {
    mockProfileRead = async () => ({ data: null, error: null })

    await expect(evaluateGate(USER)).resolves.toMatchObject({ state: 'password-required' })
  })

  it('locks an offline launch from the stored opt-in', async () => {
    await mirrorBiometricOptIn(USER, true)
    serverFails()

    const result = await evaluateGate(USER)

    expect(result.state).toBe('required')
    await expect(result.revised).resolves.toBeNull()
  })

  it('opens an offline launch for a user stored as not opted in, without waiting', async () => {
    await mirrorBiometricOptIn(USER, false)
    // A read that never answers: the decision must not wait for it.
    mockProfileRead = () => new Promise(() => undefined)
    jest.useFakeTimers()
    try {
      const result = await evaluateGate(USER)

      expect(result.state).toBe('not-required')

      // The background read times out and changes nothing.
      await jest.advanceTimersByTimeAsync(OPT_IN_READ_TIMEOUT_MS)
      await expect(result.revised).resolves.toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not use another account’s stored opt-in', async () => {
    await mirrorBiometricOptIn('user-b', false)
    serverFails()

    await expect(evaluateGate(USER)).resolves.toMatchObject({ state: 'password-required' })
  })

  it('stores the server answer so the next offline launch can use it', async () => {
    serverSays(true)

    const result = await evaluateGate(USER)

    expect(result.state).toBe('required')
    await expect(readBiometricOptInMirror(USER)).resolves.toBe(true)
  })

  it('revises a stored "not opted in" when the server says otherwise', async () => {
    // Opted in on another device, or in Settings since the last read.
    await mirrorBiometricOptIn(USER, false)
    serverSays(true)

    const result = await evaluateGate(USER)

    expect(result.state).toBe('not-required')
    await expect(result.revised).resolves.toEqual({ state: 'required', optIn: true })
    await expect(readBiometricOptInMirror(USER)).resolves.toBe(true)
  })

  it('lets a fresh password sign-in in even when the read fails', async () => {
    // The documented exception: the user has just typed the password.
    await markPasswordSignIn()
    serverFails()

    await expect(evaluateGate(USER)).resolves.toMatchObject({ state: 'not-required' })
  })

  it('does not loop back to the prompt once the gate is passed', async () => {
    await mirrorBiometricOptIn(USER, true)
    await markGatePassed()
    serverSays(true)

    const result = await evaluateGate(USER)

    expect(result.state).toBe('not-required')
    await expect(result.revised).resolves.toBeNull()
  })

  it('sends an opted-in user to the password when the device has no biometrics', async () => {
    await mirrorBiometricOptIn(USER, true)
    deviceCanDoBiometrics(false)

    await expect(evaluateGate(USER)).resolves.toMatchObject({ state: 'password-required' })
  })

  it('gives up on a hanging read after the timeout and fails closed', async () => {
    jest.useFakeTimers()
    try {
      mockProfileRead = () => new Promise(() => undefined)

      const pending = evaluateGate(USER)
      await jest.advanceTimersByTimeAsync(OPT_IN_READ_TIMEOUT_MS)

      await expect(pending).resolves.toMatchObject({ state: 'password-required' })
    } finally {
      jest.useRealTimers()
    }
  })
})

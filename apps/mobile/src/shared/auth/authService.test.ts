import { AppError } from '@nagar-shield/shared'

/**
 * The Remember-me choice, from the switch to the session write.
 *
 * Story `002-dual-identifier-login` names the gap:
 *
 * > **No test that the Remember-me switch actually changes the session
 * > write.** The switch is wired and the `rememberMe` value is passed, but no
 * > assertion covers the branch — so flipping the default, or ignoring the
 * > flag in the session service, would go unnoticed.
 *
 * ## The defect this file was written against
 *
 * The gap was worse than "no assertion covers the branch". The branch
 * **did not exist**. The Supabase client is built with
 *
 * > ```ts
 * > auth: { storage: secureStore, autoRefreshToken: true, persistSession: true }
 * > ```
 *
 * so the session was written to `expo-secure-store` on every sign-in,
 * whatever the switch said, and stayed there indefinitely. `rememberMe` did
 * nothing except trigger a `refreshSession()`. There was no 30-day window
 * anywhere in the codebase and no grace window either.
 *
 * So this file tests the **whole** path the choice travels: the flag
 * arrives at `logIn`, `logIn` records a policy, the policy carries the right
 * window, the policy is in force **before** the sign-in (because
 * `supabase-js` writes the session as part of the sign-in), and the sign-out
 * clears it.
 */

/**
 * The Supabase client is a module singleton, so the auth service's calls
 * into it are stubbed. The stub records the **order** of the calls, because
 * the order is the claim: the policy has to be in force before the first
 * session write.
 */
const calls: string[] = []
const signInResult: { error: { message: string } | null } = { error: null }

/**
 * What `getSession()` finds.
 *
 * `null` means "the store holds no session" — the state a device whose
 * SecureStore write was refused is in, and the state that used to sign the
 * user out the moment `refreshSession()` ran.
 */
let mockSessionPresent = true

jest.mock('@/shared/api/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(async () => {
        calls.push('signInWithPassword')
        mockSequence.push('signInWithPassword')
        return { data: { user: { id: 'u1' } }, error: signInResult.error }
      }),
      getSession: jest.fn(async () => {
        calls.push('getSession')
        mockSequence.push('getSession')
        return {
          data: {
            session: mockSessionPresent ? { user: { id: 'u1' } } : null,
          },
          error: null,
        }
      }),
      refreshSession: jest.fn(async () => {
        calls.push('refreshSession')
        mockSequence.push('refreshSession')
        return { data: {}, error: null }
      }),
      signOut: jest.fn(async () => {
        calls.push('signOut')
        mockSequence.push('signOut')
        return { error: null }
      }),
    },
    rpc: jest.fn(async () => {
      calls.push('rpc')
      mockSequence.push('rpc')
      return { data: null, error: null }
    }),
  },
}))

jest.mock('@/shared/services/uploadQueue', () => ({
  clearQueue: jest.fn(async () => {
    calls.push('clearQueue')
    return 2
  }),
  ownQueueCount: jest.fn(async () => 3),
}))

/**
 * The session store is mocked so the test can see the **order** of the
 * calls the auth service makes into it.
 *
 * A spy on the module's export would not work: `authService.ts` imports
 * `setSessionPersistencePolicy` as a named binding, and that binding is
 * fixed at module load — replacing the export afterwards would not be seen
 * by the already-loaded module.
 *
 * The mock keeps a real policy value behind, so `sessionPersistencePolicy()`
 * still answers with what was recorded. What it adds is the **sequence**.
 */
const mockPolicyCalls: string[] = []
let mockRecordedPolicy: { remembered: boolean; windowMs: number; persistedAt: number } | undefined

/**
 * One ordered log of everything the auth service did.
 *
 * The policy call and the sign-in call are recorded into the **same** list,
 * so the order between them is a fact about the sequence rather than two
 * separate facts that happen to be comparable.
 */
const mockSequence: string[] = []

jest.mock('@/shared/api/session-storage', () => ({
  setSessionPersistencePolicy: jest.fn(
    (policy: { remembered: boolean; windowMs: number; persistedAt: number }) => {
      mockPolicyCalls.push('setSessionPersistencePolicy')
      mockSequence.push('setSessionPersistencePolicy')
      mockRecordedPolicy = policy
    },
  ),
  clearSessionPersistencePolicy: jest.fn(() => {
    mockPolicyCalls.push('clearSessionPersistencePolicy')
    mockSequence.push('clearSessionPersistencePolicy')
    mockRecordedPolicy = undefined
  }),
  sessionPersistencePolicy: jest.fn(() => mockRecordedPolicy),
  windowForRememberMe: jest.fn((rememberMe: boolean) =>
    rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  ),
  REMEMBERED_WINDOW_MS: 30 * 24 * 60 * 60 * 1000,
  SESSION_GRACE_WINDOW_MS: 24 * 60 * 60 * 1000,
}))

import { supabase } from '@/shared/api/supabase'
import {
  REMEMBERED_WINDOW_MS,
  SESSION_GRACE_WINDOW_MS,
  sessionPersistencePolicy,
} from '@/shared/api/session-storage'
import { isInvalidCredentials, logIn, logOut } from '@/shared/auth/authService'
import { clearQueue } from '@/shared/services/uploadQueue'

const mockedAuth = supabase.auth as unknown as {
  signInWithPassword: jest.Mock
  getSession: jest.Mock
  refreshSession: jest.Mock
  signOut: jest.Mock
}

beforeEach(() => {
  calls.length = 0
  mockPolicyCalls.length = 0
  mockSequence.length = 0
  mockRecordedPolicy = undefined
  signInResult.error = null
  mockSessionPresent = true
  jest.clearAllMocks()
})

describe('the Remember-me choice reaches the session write', () => {
  it('records the thirty-day window for a remembered sign-in', async () => {
    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true })

    const policy = sessionPersistencePolicy()
    expect(policy?.remembered).toBe(true)
    expect(policy?.windowMs).toBe(REMEMBERED_WINDOW_MS)
    expect(policy?.windowMs).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('records the grace window for a sign-in that was not remembered', async () => {
    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: false })

    const policy = sessionPersistencePolicy()
    expect(policy?.remembered).toBe(false)
    expect(policy?.windowMs).toBe(SESSION_GRACE_WINDOW_MS)
  })

  it('changes the window when the switch is flipped', async () => {
    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: false })
    const unchecked = sessionPersistencePolicy()?.windowMs

    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true })
    const checked = sessionPersistencePolicy()?.windowMs

    // The flag has to *change* something. Two policies with the same window
    // would mean the switch is decorative.
    expect(unchecked).toBe(SESSION_GRACE_WINDOW_MS)
    expect(checked).toBe(REMEMBERED_WINDOW_MS)
    expect(checked).not.toBe(unchecked)
  })

  it('records the policy before the sign-in, so the first write honours it', async () => {
    // `supabase-js` writes the session as part of `signInWithPassword`
    // (`_saveSession` → `storage.setItem`), so a policy set afterwards
    // would be too late for the first write — and the first write is the one
    // that decides the window.
    //
    // The order is pinned by the **call sequence**: the policy is recorded
    // through a real call into the session store, and the sign-in is a call
    // into the client. The two are interleaved into one ordered log, so
    // "the policy came first" is a fact about the sequence, not about the
    // source text.
    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true })

    expect(mockPolicyCalls).toEqual(['setSessionPersistencePolicy'])
    expect(calls).toContain('signInWithPassword')

    // The order, in the one log that holds both.
    const policyAt = mockSequence.indexOf('setSessionPersistencePolicy')
    const signInAt = mockSequence.indexOf('signInWithPassword')

    expect(policyAt).toBeGreaterThan(-1)
    expect(signInAt).toBeGreaterThan(-1)
    expect(policyAt).toBeLessThan(signInAt)
  })

  it('refreshes the session only for a remembered sign-in', async () => {
    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true })
    expect(mockedAuth.refreshSession).toHaveBeenCalledTimes(1)

    jest.clearAllMocks()

    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: false })
    expect(mockedAuth.refreshSession).not.toHaveBeenCalled()
  })

  it('does not refresh when the store holds no session to refresh', async () => {
    // **This is the regression.** The device's SecureStore could not hold the
    // session, so the store is empty while the client holds one in memory.
    //
    // `supabase-js`'s `refreshSession` reads the session from **storage**.
    // A session it cannot find is treated as invalid: `auth-js` calls
    // `_removeSession()`, which emits `SIGNED_OUT` and clears the session the
    // sign-in had just created. The app bounced the user straight back to the
    // welcome screen after a **successful** sign-in, with no error shown.
    //
    // So the refresh is only attempted when there is a session to refresh.
    // The 30-day window cannot be honoured without a stored refresh token,
    // and losing the sign-in is far worse than losing the window.
    mockSessionPresent = false

    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true })

    expect(mockedAuth.getSession).toHaveBeenCalled()
    expect(mockedAuth.refreshSession).not.toHaveBeenCalled()
  })

  it('still signs the user in when the store holds no session', async () => {
    // The point of the guard above: the sign-in succeeds either way. The
    // window is what degrades, not the authentication.
    mockSessionPresent = false

    await expect(
      logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true }),
    ).resolves.toBeUndefined()
  })

  it('leaves no policy behind when the sign-in fails', async () => {
    signInResult.error = { message: 'Invalid login credentials' }

    await expect(
      logIn({ identifier: 'citizen@example.com', password: 'wrong', rememberMe: true }),
    ).rejects.toBeInstanceOf(AppError)

    // A failed sign-in created no session, so there is nothing to govern.
    // A policy left behind would expire the *next* session against a window
    // nobody chose.
    expect(sessionPersistencePolicy()).toBeUndefined()
  })

  it('clears the policy on sign-out', async () => {
    await logIn({ identifier: 'citizen@example.com', password: 'pw', rememberMe: true })
    expect(sessionPersistencePolicy()).toBeDefined()

    await logOut()

    // The next session must not inherit this one's window.
    expect(sessionPersistencePolicy()).toBeUndefined()
  })
})

describe('signing out', () => {
  it("keeps the user's unsent reports and says how many", async () => {
    const result = await logOut()

    // They stay for their author: another account cannot send or see them.
    expect(clearQueue).not.toHaveBeenCalled()
    expect(result).toEqual({ keptUploads: 3, discardedUploads: 0 })
  })

  it("discards the user's reports when the account is deleted", async () => {
    const result = await logOut({ discardUploads: true })

    expect(clearQueue).toHaveBeenCalledWith('u1')
    expect(result).toEqual({ keptUploads: 0, discardedUploads: 2 })
  })

  it('counts an offline sign-out as a sign-out once the session is gone', async () => {
    // The phone drops the session first and then fails to revoke it on the
    // server. That used to throw, leaving the user on a signed-in screen.
    mockedAuth.signOut.mockImplementationOnce(async () => {
      mockSessionPresent = false
      return { error: { message: 'Failed to fetch' } }
    })

    await expect(logOut()).resolves.toEqual({ keptUploads: 3, discardedUploads: 0 })
    expect(sessionPersistencePolicy()).toBeUndefined()
  })

  it('still fails when the sign-out error leaves the session in place', async () => {
    mockedAuth.signOut.mockImplementationOnce(async () => ({ error: { message: 'boom' } }))

    await expect(logOut()).rejects.toBeDefined()
  })

  it('has nothing to keep when nobody was signed in', async () => {
    mockSessionPresent = false

    await expect(logOut()).resolves.toEqual({ keptUploads: 0, discardedUploads: 0 })
  })
})

describe('the sign-in identifier reaches the server unchanged', () => {
  it('signs in with the email it resolved', async () => {
    await logIn({ identifier: 'Citizen@Example.COM', password: 'pw', rememberMe: false })

    expect(mockedAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'citizen@example.com',
      password: 'pw',
    })
  })

  it('resolves a phone identifier through the RPC and signs in with the email', async () => {
    const mockedSupabase = supabase as unknown as { rpc: jest.Mock }
    mockedSupabase.rpc.mockResolvedValue({ data: { email: 'citizen@example.com' }, error: null })

    await logIn({ identifier: '+8801712345678', password: 'pw', rememberMe: false })

    // The phone is an attribute of `profiles`, not a credential — so the
    // password that authenticates is the account's own password, the same
    // one the email path uses.
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('resolve_login_identifier', {
      p_identifier: '+8801712345678',
    })
    expect(mockedAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'citizen@example.com',
      password: 'pw',
    })
  })

  it('maps an unknown identifier to the same failure as a wrong password', async () => {
    const mockedSupabase = supabase as unknown as { rpc: jest.Mock }
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0002' } })

    const unknown = await logIn({
      identifier: '+8801799999999',
      password: 'pw',
      rememberMe: false,
    }).catch((error: unknown) => error)

    signInResult.error = { message: 'Invalid login credentials' }
    const wrongPassword = await logIn({
      identifier: 'citizen@example.com',
      password: 'wrong',
      rememberMe: false,
    }).catch((error: unknown) => error)

    // The story: "the response is the generic `VALIDATION_FAILED` message
    // that is byte-identical to the wrong-password message, and no distinct
    // 'user not found' response is shown". Same code, same message.
    expect(unknown).toBeInstanceOf(AppError)
    expect(wrongPassword).toBeInstanceOf(AppError)
    expect((unknown as AppError).code).toBe((wrongPassword as AppError).code)
    expect((unknown as AppError).code).toBe('AUTH_REQUIRED')
    expect((unknown as AppError).message).toBe((wrongPassword as AppError).message)
    // Both are marked as bad credentials so the login screen can say so, while
    // the code stays AUTH_REQUIRED for the queue drain's retry rule.
    expect(isInvalidCredentials(unknown as AppError)).toBe(true)
    expect(isInvalidCredentials(wrongPassword as AppError)).toBe(true)
    expect(isInvalidCredentials(new AppError('AUTH_REQUIRED'))).toBe(false)
  })

  it('never sends the raw phone to signInWithPassword', async () => {
    const mockedSupabase = supabase as unknown as { rpc: jest.Mock }
    mockedSupabase.rpc.mockResolvedValue({ data: { email: 'citizen@example.com' }, error: null })

    await logIn({ identifier: '+8801712345678', password: 'pw', rememberMe: false })

    const call = mockedAuth.signInWithPassword.mock.calls[0]?.[0] as { email: string }
    // The raw phone must never reach Auth — it is an attribute of the
    // profile, not a credential. What reaches Auth is the resolved email.
    expect(call.email).not.toContain('+880')
    expect(call.email).not.toMatch(/^\d/)
    expect(call.email).toBe('citizen@example.com')
  })
})

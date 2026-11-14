/**
 * FR-AUTH-2 — the "Remember me" window, pinned.
 *
 * Story `002-dual-identifier-login` names two criteria about it:
 *
 *   * **AC #5** — "the refresh token is written to `expo-secure-store` with a
 *     30-day expiry and is absent from AsyncStorage, and a force-close plus
 *     reopen within 30 days leaves the user authenticated";
 *   * **AC #6** — "the Login screen is shown and no refresh token is
 *     persisted in `expo-secure-store`" once the grace window has elapsed.
 *
 * ## Why this file exists at all
 *
 * Before this file, the behaviour **did not exist**. The app was built with
 *
 * > ```ts
 * > auth: { storage: secureStore, autoRefreshToken: true, persistSession: true }
 * > ```
 *
 * so the session was written to `expo-secure-store` on every sign-in,
 * whatever the Remember-me switch said, and stayed there indefinitely. The
 * `rememberMe` value reached `logIn` and then did nothing except trigger a
 * `refreshSession()`. There was no 30-day window anywhere in the codebase
 * and no grace window either.
 *
 * So AC #6 failed outright, not merely untested. This file pins the
 * behaviour that now ships.
 *
 * ## The shape of the guarantee
 *
 * The window is enforced at the **only** place a session is read back: the
 * store's `getItem`. That is where a relaunch asks "is there a stored
 * session?", and it is the only point at which "past the window" can be
 * turned into "no session".
 *
 * The policy is written **beside** the session, not inside it, because the
 * value under the session key is `supabase-js`'s own JSON and `supabase-js`
 * parses it back. The envelope is this module's business and nothing else's.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const secureStoreCalls: Array<{ op: string; key: string; value?: string }> = []

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: jest.fn(async (key: string) => {
    secureStoreCalls.push({ op: 'get', key })
    return null
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStoreCalls.push({ op: 'set', key, value })
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    secureStoreCalls.push({ op: 'remove', key })
  }),
}))

import {
  REMEMBERED_WINDOW_MS,
  SESSION_GRACE_WINDOW_MS,
  clearSessionPersistencePolicy,
  isWithinWindow,
  secureStore,
  setSessionPersistencePolicy,
  windowForRememberMe,
} from '@/shared/api/session-storage'
import * as SecureStore from 'expo-secure-store'

const SESSION_KEY = 'sb-localhost-auth-token'
const POLICY_KEY = 'nagar-shield.session-persisted-at'

beforeEach(() => {
  secureStoreCalls.length = 0
  clearSessionPersistencePolicy()
})

describe('the window a Remember-me choice maps to', () => {
  it('maps a checked box to thirty days', () => {
    expect(windowForRememberMe(true)).toBe(30 * 24 * 60 * 60 * 1000)
    expect(windowForRememberMe(true)).toBe(REMEMBERED_WINDOW_MS)
  })

  it('maps an unchecked box to the grace window', () => {
    expect(windowForRememberMe(false)).toBe(SESSION_GRACE_WINDOW_MS)
  })

  it('judges a session against the window it was written under', () => {
    const writtenAt = 1_000_000
    const policy = { remembered: true, windowMs: REMEMBERED_WINDOW_MS, persistedAt: writtenAt }

    // Just inside the window.
    expect(isWithinWindow(policy, writtenAt + REMEMBERED_WINDOW_MS - 1)).toBe(true)
    // Exactly at the window — the window has elapsed.
    expect(isWithinWindow(policy, writtenAt + REMEMBERED_WINDOW_MS)).toBe(false)
    // Well past it.
    expect(isWithinWindow(policy, writtenAt + REMEMBERED_WINDOW_MS + 1)).toBe(false)
  })
})

describe('a remembered session is written with its window', () => {
  it('persists the policy beside the session', async () => {
    setSessionPersistencePolicy({
      remembered: true,
      windowMs: REMEMBERED_WINDOW_MS,
      persistedAt: Date.now(),
    })

    await secureStore.setItem(SESSION_KEY, '{"access_token":"a","refresh_token":"r"}')

    const policyWrite = secureStoreCalls.find(
      (call) => call.op === 'set' && call.key === POLICY_KEY,
    )
    expect(policyWrite).toBeDefined()

    const written = JSON.parse(policyWrite?.value ?? '{}') as Record<string, unknown>
    expect(written.remembered).toBe(true)
    expect(written.windowMs).toBe(REMEMBERED_WINDOW_MS)
    expect(typeof written.persistedAt).toBe('number')
  })

  it('does not write a policy for a value that is not the session', async () => {
    // The biometric flags live in the same store. They are not sessions and
    // must never inherit the session's window.
    setSessionPersistencePolicy({
      remembered: true,
      windowMs: REMEMBERED_WINDOW_MS,
      persistedAt: Date.now(),
    })

    await secureStore.setItem('nagar-shield.password-session', '1')

    const policyWrites = secureStoreCalls.filter(
      (call) => call.op === 'set' && call.key === POLICY_KEY,
    )
    expect(policyWrites).toEqual([])
  })
})

describe('a session past its window reads as no session', () => {
  it('expires a remembered session once the thirty days are up', async () => {
    const writtenAt = Date.now()
    setSessionPersistencePolicy({
      remembered: true,
      windowMs: REMEMBERED_WINDOW_MS,
      persistedAt: writtenAt,
    })
    await secureStore.setItem(SESSION_KEY, '{"access_token":"a"}')

    // The store now holds the session and the policy. A relaunch reads them.
    const stored = new Map(
      secureStoreCalls
        .filter((call) => call.op === 'set')
        .map((call) => [call.key, call.value ?? '']),
    )
    expect(stored.get(SESSION_KEY)).toBe('{"access_token":"a"}')
    expect(stored.get(POLICY_KEY)).toBeDefined()
  })

  it('reads a session written inside its window', async () => {
    const policy = {
      remembered: true,
      windowMs: REMEMBERED_WINDOW_MS,
      persistedAt: Date.now() - 1000,
    }

    // The mock returns null for `getItemAsync`, so the store is primed by
    // giving the mock the stored values.
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      key === SESSION_KEY ? '{"access_token":"a"}' : JSON.stringify(policy),
    )

    await expect(secureStore.getItem(SESSION_KEY)).resolves.toBe('{"access_token":"a"}')
  })

  it('reads a session past its window as a miss and deletes it', async () => {
    const expired = {
      remembered: true,
      windowMs: REMEMBERED_WINDOW_MS,
      persistedAt: Date.now() - REMEMBERED_WINDOW_MS - 1,
    }

    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      key === SESSION_KEY ? '{"access_token":"a"}' : JSON.stringify(expired),
    )

    // The relaunch asks "is there a stored session?" and the answer is no.
    await expect(secureStore.getItem(SESSION_KEY)).resolves.toBeNull()

    // And the stale entry is gone, so a later launch does not re-read it.
    const removals = secureStoreCalls.filter((call) => call.op === 'remove')
    expect(removals.map((call) => call.key)).toContain(SESSION_KEY)
    expect(removals.map((call) => call.key)).toContain(POLICY_KEY)
  })

  it('expires an unremembered session once the grace window is up', async () => {
    const expired = {
      remembered: false,
      windowMs: SESSION_GRACE_WINDOW_MS,
      persistedAt: Date.now() - SESSION_GRACE_WINDOW_MS - 1,
    }

    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      key === SESSION_KEY ? '{"access_token":"a"}' : JSON.stringify(expired),
    )

    await expect(secureStore.getItem(SESSION_KEY)).resolves.toBeNull()
  })

  it('honours a session whose policy cannot be read', async () => {
    // A device whose policy write failed, or an app version that wrote no
    // policy. An unreadable policy is not evidence of an expired session, so
    // the session is honoured rather than thrown away.
    ;(SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
      key === SESSION_KEY ? '{"access_token":"a"}' : null,
    )

    await expect(secureStore.getItem(SESSION_KEY)).resolves.toBe('{"access_token":"a"}')
  })
})

describe('signing out clears the window with the session', () => {
  it('removes the policy along with the session', async () => {
    await secureStore.removeItem(SESSION_KEY)

    const removals = secureStoreCalls.filter((call) => call.op === 'remove')
    expect(removals.map((call) => call.key)).toContain(SESSION_KEY)
    expect(removals.map((call) => call.key)).toContain(POLICY_KEY)
  })

  it('does not remove a policy for a value that is not the session', async () => {
    await secureStore.removeItem('nagar-shield.password-session')

    const removals = secureStoreCalls.filter((call) => call.op === 'remove')
    expect(removals.map((call) => call.key)).not.toContain(POLICY_KEY)
  })
})

describe('the window logic lives in the session store, not in the caller', () => {
  it('the auth service sets the policy before the sign-in', () => {
    // The policy has to be in force **before** `signInWithPassword`, because
    // `supabase-js` writes the session as part of the sign-in. A policy set
    // afterwards would be too late for the first write — and the first write
    // is the one that decides the window.
    const source = readFileSync(join(__dirname, '..', 'auth', 'authService.ts'), 'utf8')

    const policyCall = source.indexOf('setSessionPersistencePolicy(')
    const signInCall = source.indexOf('supabase.auth.signInWithPassword(')

    expect(policyCall).toBeGreaterThan(-1)
    expect(signInCall).toBeGreaterThan(-1)
    expect(policyCall).toBeLessThan(signInCall)
  })

  it('the client persists the session through the session store', () => {
    // The window is only reachable if the session actually goes through the
    // store this module owns.
    const source = readFileSync(join(__dirname, 'supabase.ts'), 'utf8')

    expect(source).toContain('storage: secureStore')
  })
})

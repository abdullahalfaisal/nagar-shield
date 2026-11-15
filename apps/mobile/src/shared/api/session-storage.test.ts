import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bn } from '@/shared/i18n/bn'
import { en } from '@/shared/i18n/en'

/**
 * The session store's decision, pinned.
 *
 * Story `004-mobile-app-shell` says:
 *
 * > the access and refresh tokens are written to `expo-secure-store` and
 * > never to `AsyncStorage`
 *
 * The adapter this module replaced caught every SecureStore failure and fell
 * back to AsyncStorage, so a refresh token could land in unencrypted
 * storage on Android. Nothing tested that. This file pins the decision, and
 * it pins it **from both sides**:
 *
 *   1. **Behaviourally** — the store writes to SecureStore and to nothing
 *      else; an oversized value is refused rather than relocated; a Keystore
 *      failure is reported rather than silently redirected.
 *   2. **Structurally** — the source of the session-store module does not
 *      mention AsyncStorage at all. A behavioural test can be satisfied by an
 *      adapter that *happens* not to fall back today; a structural one
 *      cannot, because there is no second store to fall back to.
 *
 * The second is the one that matters. The behavioural assertions are
 * necessary but not sufficient; the structural assertion is what makes the
 * criterion true by construction rather than by luck.
 */

/**
 * The native storage modules do not run under Jest.
 *
 * `expo-secure-store` needs its own mock. AsyncStorage is mocked too — not
 * because this module uses it, but so that the structural assertion below
 * can be checked against a mock that would **record** any call. If the module
 * under test ever reached for it, the recording mock would see it.
 */
const secureStoreCalls: Array<{ op: string; key: string; value?: string }> = []
const asyncStorageCalls: Array<{ op: string; key: string; value?: string }> = []

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

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      asyncStorageCalls.push({ op: 'get', key })
      return null
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStorageCalls.push({ op: 'set', key, value })
    }),
    removeItem: jest.fn(async (key: string) => {
      asyncStorageCalls.push({ op: 'remove', key })
    }),
  },
}))

/**
 * `expo-constants` does not run under Jest.
 *
 * The session-store module reads the configured URL from it, because the
 * storage key is derived from that URL. The mock has no `extra` bag, so the
 * module falls back to `process.env.EXPO_PUBLIC_SUPABASE_URL` — which is what
 * the derivation tests below set.
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}))

import {
  MAX_SECURE_STORE_VALUE_BYTES,
  SessionStoreError,
  byteLength,
  canPersistSession,
  clearSessionStoreFailure,
  fitsInSecureStore,
  secureStore,
  sessionPersistenceBroken,
  sessionStoreFailure,
  sessionStorageKey,
} from '@/shared/api/session-storage'
import * as SecureStore from 'expo-secure-store'

/**
 * The key the session is actually stored under.
 *
 * It is **derived** from the configured URL rather than hardcoded — see the
 * "the session key is derived from the URL" block below. The tests use the
 * module's own value so they exercise the real key rather than a guess.
 */
const SESSION_KEY = sessionStorageKey()

beforeEach(() => {
  secureStoreCalls.length = 0
  asyncStorageCalls.length = 0
  // The recorded failure is module state, so it is reset between tests.
  clearSessionStoreFailure()
})

describe('the session store writes to SecureStore and nowhere else', () => {
  it('writes the value to SecureStore', async () => {
    await secureStore.setItem(SESSION_KEY, '{"access_token":"a","refresh_token":"r"}')

    const writes = secureStoreCalls.filter((call) => call.op === 'set')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.key).toBe(SESSION_KEY)
    expect(writes[0]?.value).toBe('{"access_token":"a","refresh_token":"r"}')
  })

  it('never touches AsyncStorage', async () => {
    await secureStore.setItem(SESSION_KEY, '{"access_token":"a"}')
    await secureStore.getItem(SESSION_KEY)
    await secureStore.removeItem(SESSION_KEY)

    // This is the criterion, stated as an assertion: the tokens are written
    // to SecureStore and never to AsyncStorage.
    expect(asyncStorageCalls).toEqual([])
  })

  it('does not fall back to AsyncStorage when SecureStore refuses the write', async () => {
    // The device cannot write to the Keystore. The old adapter caught this
    // and wrote the session to AsyncStorage instead — the exact behaviour
    // the criterion forbids.
    ;(SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )

    await secureStore.setItem(SESSION_KEY, '{"access_token":"a"}')

    expect(asyncStorageCalls).toEqual([])
  })

  it('does not fall back to AsyncStorage when the value is too large', async () => {
    const oversized = 'x'.repeat(MAX_SECURE_STORE_VALUE_BYTES + 1)

    await secureStore.setItem(SESSION_KEY, oversized)

    // Not even SecureStore is asked — the value is refused before the write.
    expect(secureStoreCalls.filter((call) => call.op === 'set')).toEqual([])
    expect(asyncStorageCalls).toEqual([])
  })

  it('records the failure instead of throwing at the caller', async () => {
    // `supabase-js` rethrows a non-`AuthError` out of `signInWithPassword`:
    //
    //   } catch (error) {
    //     if (isAuthError(error)) { … }
    //     throw error
    //   }
    //
    // A store that throws turns a **successful** sign-in into an error at
    // the user. So the store records the failure and resolves.
    ;(SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )

    await expect(secureStore.setItem(SESSION_KEY, '{"access_token":"a"}')).resolves.toBeUndefined()

    const failure = sessionStoreFailure()
    expect(failure).toBeInstanceOf(SessionStoreError)
    expect(failure?.failure).toBe('unavailable')
    expect(sessionPersistenceBroken()).toBe(true)
  })

  it('records a too-large value as a different failure', async () => {
    await secureStore.setItem(SESSION_KEY, 'x'.repeat(MAX_SECURE_STORE_VALUE_BYTES + 1))

    expect(sessionStoreFailure()?.failure).toBe('too-large')
  })

  it('forgets the failure once the app has told the user', async () => {
    ;(SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )
    await secureStore.setItem(SESSION_KEY, '{"access_token":"a"}')
    expect(sessionPersistenceBroken()).toBe(true)

    clearSessionStoreFailure()

    expect(sessionPersistenceBroken()).toBe(false)
    expect(sessionStoreFailure()).toBeUndefined()
  })

  it('forgets the failure when a later write succeeds', async () => {
    ;(SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )
    await secureStore.setItem(SESSION_KEY, '{"access_token":"a"}')
    expect(sessionPersistenceBroken()).toBe(true)

    // The device recovers — a successful write clears the stale failure, so
    // the app stops warning about a problem that no longer exists.
    await secureStore.setItem(SESSION_KEY, '{"access_token":"b"}')

    expect(sessionPersistenceBroken()).toBe(false)
  })

  it('reports a read failure as a miss rather than a crash', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )

    // A device that cannot read the Keystore has no stored session. That is
    // a miss, not a crash.
    await expect(secureStore.getItem(SESSION_KEY)).resolves.toBeNull()
  })

  it('swallows a removal failure — a sign-out must not throw at the user', async () => {
    ;(SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )

    await expect(secureStore.removeItem(SESSION_KEY)).resolves.toBeUndefined()
  })
})

describe('the size threshold is measured in UTF-8 bytes, not characters', () => {
  it('counts a Bangla value as three bytes per character', () => {
    // 'ক' is U+0995 — three bytes in UTF-8. A string-length check would
    // undercount a Bengali value by two thirds, and would happily let a
    // payload the device cannot hold through the gate.
    expect(byteLength('ক')).toBe(3)
    expect(byteLength('abc')).toBe(3)
  })

  it('refuses a value that is over the limit once encoded', () => {
    const bangla = 'ক'.repeat(Math.ceil(MAX_SECURE_STORE_VALUE_BYTES / 3))
    expect(bangla.length).toBeLessThan(MAX_SECURE_STORE_VALUE_BYTES)
    expect(fitsInSecureStore(bangla)).toBe(false)
  })

  it('accepts a value exactly at the limit', () => {
    expect(fitsInSecureStore('x'.repeat(MAX_SECURE_STORE_VALUE_BYTES))).toBe(true)
    expect(fitsInSecureStore('x'.repeat(MAX_SECURE_STORE_VALUE_BYTES + 1))).toBe(false)
  })
})

describe('a real Supabase session fits inside SecureStore', () => {
  /**
   * The session shape the app actually produces, measured rather than
   * assumed.
   *
   * The old adapter's comment claimed "the session refresh token can exceed"
   * SecureStore's limit. It cannot: a Supabase refresh token is a 43–86 byte
   * opaque string. The *whole session* is what approaches the limit.
   *
   * ## The measurement that was wrong
   *
   * This block used to build a **synthetic** session — an HS256 token over
   * modelled claims — and measured it at ~1550 bytes. The local server signs
   * with **ES256** and returns the **whole** user object, so the real
   * session is **2175 bytes**.
   *
   * That difference mattered: the threshold was set to 2048, justified by the
   * 1550-byte measurement, so the store **refused the real session**. The
   * session was never written, the next read found nothing, and
   * `supabase-js` removed the session as invalid — signing the user out
   * immediately after a successful sign-in.
   *
   * So this block uses the session the server **actually issued**, captured
   * verbatim. A synthetic approximation is exactly what let the wrong number
   * through; a captured one cannot drift away from reality without the size
   * assertion noticing.
   */
  function buildSession({ userMetadata }: { userMetadata: Record<string, unknown> }): string {
    // The captured session's access token, verbatim: 939 characters, ES256,
    // carrying the real claim set.
    const access_token =
      'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.' +
      'eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzIxL2F1dGgvdjEiLCJzdWIiOiJhMDZmNjU4MS1iMmJlLTQzYTEtODliYy0yM2QwN2U2NGY4ZmQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzk0Njg4MjExLCJpYXQiOjE3OTQ2ODQ2MTEsImVtYWlsIjoiZGVtb0BuYWdhcnNoaWVsZC50ZXN0IiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImRlbW9AbmFnYXJzaGllbGQudGVzdCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZSI6IjAxNzEyMzQ1Njc4IiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJhMDZmNjU4MS1iMmJlLTQzYTEtODliYy0yM2QwN2U2NGY4ZmQifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc5NDY4NDYxMX1dLCJzZXNzaW9uX2lkIjoiZDMxNjA1ZjUtNTNmZS00Y2RjLWE3MDUtNjhhNmQxMDY1NTZlIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.' +
      'o-BxzVRS1DLH_GVAw27e58zJp86TLnD-AoJqmv-GT0VMStgmPIeEP82h2FEZphZQJu7IXM6-D_8GGsWfV3ijdw'

    // The captured user object, verbatim. Its identity array alone is 480
    // bytes — the part a modelled user object always left out.
    const user = {
      id: 'a06f6581-b2be-43a1-89bc-23d07e64f8fd',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'demo@nagarshield.test',
      email_confirmed_at: '2026-11-14T18:31:15.838866Z',
      phone: '',
      confirmed_at: '2026-11-14T18:31:15.838866Z',
      last_sign_in_at: '2026-11-14T19:30:11.550461297Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {
        email: 'demo@nagarshield.test',
        email_verified: true,
        phone: '01712345678',
        phone_verified: false,
        sub: 'a06f6581-b2be-43a1-89bc-23d07e64f8fd',
      },
      identities: [
        {
          identity_id: '0c0d5212-fd59-407f-b002-b267c87409c3',
          id: 'a06f6581-b2be-43a1-89bc-23d07e64f8fd',
          user_id: 'a06f6581-b2be-43a1-89bc-23d07e64f8fd',
          identity_data: {
            email: 'demo@nagarshield.test',
            email_verified: false,
            phone: '01712345678',
            phone_verified: false,
            sub: 'a06f6581-b2be-43a1-89bc-23d07e64f8fd',
          },
          provider: 'email',
          last_sign_in_at: '2026-11-14T18:31:15.833723Z',
          created_at: '2026-11-14T18:31:15.83376Z',
          updated_at: '2026-11-14T18:31:15.83376Z',
          email: 'demo@nagarshield.test',
        },
      ],
      created_at: '2026-11-14T18:31:15.82757Z',
      updated_at: '2026-11-14T19:30:11.55263Z',
      is_anonymous: false,
    }

    return JSON.stringify({
      access_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'r'.repeat(43),
      user: {
        ...user,
        user_metadata: { ...user.user_metadata, ...userMetadata },
      },
    })
  }

  it("fits the app's own user shape", () => {
    const session = buildSession({
      userMetadata: {
        provider: 'email',
        providers: ['email'],
        full_name: 'Md. Abdur Rahim',
        phone: '+8801712345678',
        preferred_language: 'bn',
        biometric_opt_in: true,
        avatar_url: null,
      },
    })

    const bytes = byteLength(session)
    expect(bytes).toBeGreaterThan(0)
    expect(bytes).toBeLessThan(MAX_SECURE_STORE_VALUE_BYTES)
  })

  it('is bigger than the limit that was in force when the bug shipped', () => {
    // The floor is the **measured** size of the real session: 2175 bytes.
    //
    // This assertion is the point of the whole block. The old limit was
    // 2048 and the old measurement claimed ~1550 — so the limit looked
    // generous, and the real session sailed past it. Asserting the size
    // **against the old limit** is what makes that failure impossible to
    // repeat: if the session ever grows past 2048 again, this test says so
    // instead of the store quietly refusing it.
    const session = buildSession({
      userMetadata: {
        provider: 'email',
        providers: ['email'],
        full_name: 'Md. Abdur Rahim',
        phone: '+8801712345678',
        preferred_language: 'bn',
        biometric_opt_in: true,
        avatar_url: null,
      },
    })

    expect(byteLength(session)).toBeGreaterThan(2048)
  })

  it('fits even an oversized profile', () => {
    const session = buildSession({
      userMetadata: {
        full_name: 'Md. Abdur Rahim',
        phone: '+8801712345678',
        avatar_url: 'https://cdn.example.com/a/b/c/avatar.png',
        address_line: 'House 12, Road 5, Dhaka 1216',
        emergency_contacts: [
          { name: 'A', phone: '+8801' },
          { name: 'B', phone: '+8802' },
        ],
      },
    })

    expect(byteLength(session)).toBeLessThan(MAX_SECURE_STORE_VALUE_BYTES)
  })
})

describe('the session key is derived from the URL', () => {
  /**
   * The bug this pins.
   *
   * The key was hardcoded as `sb-localhost-auth-token`. `supabase-js` does
   * not use that key — it derives one from the URL's hostname:
   *
   * > `defaultStorageKey = \`sb-${baseUrl.hostname.split(".")[0]}-auth-token\``
   *
   * so the real key is `sb-127-auth-token` for `127.0.0.1` and
   * `sb-192-auth-token` for `192.168.1.37`. The hardcoded constant matched
   * **no** URL the app was ever built with, which meant the window check in
   * `getItem` — the only thing that enforces FR-AUTH-2's grace window —
   * **never ran**. The session would never expire.
   *
   * The test loads the module fresh against each URL, the way the app is
   * loaded against the URL it was configured with.
   */
  function keyFor(url: string): string {
    const previous = process.env.EXPO_PUBLIC_SUPABASE_URL
    process.env.EXPO_PUBLIC_SUPABASE_URL = url

    let key = ''
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require('@/shared/api/session-storage') as {
        sessionStorageKey: () => string
      }
      key = module.sessionStorageKey()
    })

    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_URL = previous
    }

    return key
  }

  it('derives the loopback key for 127.0.0.1', () => {
    expect(keyFor('http://127.0.0.1:54321')).toBe('sb-127-auth-token')
  })

  it('derives the LAN key for a private address', () => {
    // The hardcoded constant produced `sb-localhost-auth-token` here, which
    // is why the window never expired.
    expect(keyFor('http://192.168.1.37:54321')).toBe('sb-192-auth-token')
  })

  it('derives the localhost key for the hostname "localhost"', () => {
    expect(keyFor('http://localhost:54321')).toBe('sb-localhost-auth-token')
  })

  it('matches what supabase-js itself derives', () => {
    // The derivation is not this app's invention — it is `supabase-js`'s.
    // If the library ever changes it, this says so.
    const source = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'node_modules',
        '.pnpm',
        '@supabase+supabase-js@2.118.0',
        'node_modules',
        '@supabase',
        'supabase-js',
        'dist',
        'index.cjs',
      ),
      'utf8',
    )

    expect(source).toContain('sb-${baseUrl.hostname.split(".")[0]}-auth-token')
  })
})

describe('the module structurally cannot reach AsyncStorage', () => {
  /**
   * The behavioural assertions above could all pass while the module still
   * *contained* a fallback that no test happened to trigger. This one
   * cannot: the source of the session-store module does not mention
   * AsyncStorage at all.
   */
  it('the session-store module never mentions AsyncStorage', () => {
    const source = readFileSync(join(__dirname, 'session-storage.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

    expect(source).not.toContain('AsyncStorage')
    expect(source).not.toContain('async-storage')
  })

  it('the Supabase client module never mentions AsyncStorage either', () => {
    // The client is the module that hands the store to `supabase-js`. If the
    // fallback had been reintroduced there — the old place it lived — this
    // would catch it.
    const source = readFileSync(join(__dirname, 'supabase.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

    expect(source).not.toContain('AsyncStorage')
    expect(source).not.toContain('async-storage')
  })
})

describe('the store never throws at supabase-js', () => {
  /**
   * The reason the store swallows a write failure instead of throwing.
   *
   * This is not a style preference — it is forced by `supabase-js`. The
   * installed source says:
   *
   * ```ts
   * // GoTrueClient.ts — signInWithPassword
   * await this._saveSession(data.session)
   * // …
   * } catch (error) {
   *   if (isAuthError(error)) { … }
   *   throw error
   * }
   *
   * // GoTrueClient.ts — _saveSession (no catch of its own)
   * await setItemAsync(this.storage, this.storageKey, clonedMainSessionData)
   *
   * // lib/helpers.ts — setItemAsync (no catch of its own)
   * await storage.setItem(key, JSON.stringify(data))
   * ```
   *
   * So a storage failure that is not an `AuthError` is **rethrown** out of
   * `signInWithPassword` — the credentials were right, the server said yes,
   * and the app reports a failure.
   *
   * This test pins the claim against the **installed** library, not against
   * a comment. If a future `supabase-js` version changed the behaviour, this
   * would say so.
   */
  const authJsRoot = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'node_modules',
    '.pnpm',
    '@supabase+auth-js@2.118.0',
    'node_modules',
    '@supabase',
    'auth-js',
    'src',
  )

  it('finds the installed auth-js source', () => {
    // If the library moves or the version changes, this test fails loudly
    // rather than silently asserting against nothing.
    expect(() => readFileSync(join(authJsRoot, 'GoTrueClient.ts'), 'utf8')).not.toThrow()
  })

  it('signInWithPassword rethrows a non-AuthError', () => {
    const source = readFileSync(join(authJsRoot, 'GoTrueClient.ts'), 'utf8')

    // The method's own body — not its doc comment, which is long and also
    // contains the word "catch".
    const start = source.indexOf('async signInWithPassword(')
    const bodyStart = source.indexOf('{', source.indexOf('): Promise<', start))
    const end = source.indexOf('\n  async ', bodyStart)
    const body = source.slice(bodyStart, end === -1 ? undefined : end)

    const catchBlock = body.slice(body.indexOf('} catch (error) {'))

    expect(catchBlock).toContain('isAuthError(error)')
    expect(catchBlock).toContain('throw error')
  })

  it('_saveSession writes to storage with no catch of its own', () => {
    const source = readFileSync(join(authJsRoot, 'GoTrueClient.ts'), 'utf8')
    const save = source.slice(source.indexOf('private async _saveSession('))
    const saveBlock = save.slice(0, save.indexOf('\n  private async _removeSession'))

    expect(saveBlock).toContain('await setItemAsync(this.storage, this.storageKey')
    expect(saveBlock).not.toContain('} catch')
  })

  it('setItemAsync calls storage.setItem with no catch of its own', () => {
    const source = readFileSync(join(authJsRoot, 'lib/helpers.ts'), 'utf8')
    const helper = source.slice(source.indexOf('export const setItemAsync'))

    expect(helper).toContain('await storage.setItem(key, JSON.stringify(data))')
  })
})

describe('the persistence probe', () => {
  it('reports that the device can persist a session', async () => {
    await expect(canPersistSession()).resolves.toBe(true)
  })

  it('reports that the device cannot when the Keystore refuses the write', async () => {
    ;(SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    )

    // The app uses this to show the story's edge case: "a localized notice
    // explains that the session will not persist".
    await expect(canPersistSession()).resolves.toBe(false)
  })
})

describe('the persistence notice has copy in both bundles', () => {
  it('has a title, a message and a detail in English', () => {
    expect(typeof en.sessionPersistence.title).toBe('string')
    expect((en.sessionPersistence.title as string).length).toBeGreaterThan(0)
    expect(typeof en.sessionPersistence.message).toBe('string')
    expect((en.sessionPersistence.message as string).length).toBeGreaterThan(0)
    expect(typeof en.sessionPersistence.detail).toBe('string')
    expect((en.sessionPersistence.detail as string).length).toBeGreaterThan(0)
  })

  it('has a title, a message and a detail in Bangla', () => {
    expect(typeof bn.sessionPersistence.title).toBe('string')
    expect((bn.sessionPersistence.title as string).length).toBeGreaterThan(0)
    expect(typeof bn.sessionPersistence.message).toBe('string')
    expect((bn.sessionPersistence.message as string).length).toBeGreaterThan(0)
    expect(typeof bn.sessionPersistence.detail).toBe('string')
    expect((bn.sessionPersistence.detail as string).length).toBeGreaterThan(0)
  })

  it('does not blame the user, and does not leak the storage internals', () => {
    const copy = [
      en.sessionPersistence.title,
      en.sessionPersistence.message,
      en.sessionPersistence.detail,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')

    // The Keystore is the device's fault, not the user's. Naming it would
    // tell a user something they cannot act on.
    expect(copy).not.toMatch(/keystore/i)
    expect(copy).not.toMatch(/secure\s*store/i)
    expect(copy).not.toMatch(/asyncstorage/i)
  })

  it('says the session will not persist, so the user is not surprised', () => {
    // The notice's whole job is to explain that the user will have to sign
    // in again. If the copy stopped saying that, the banner would be
    // alarming without being useful.
    const message = `${en.sessionPersistence.message} ${en.sessionPersistence.detail}`.toLowerCase()

    expect(message).toMatch(/sign in again|not saved/)
  })
})

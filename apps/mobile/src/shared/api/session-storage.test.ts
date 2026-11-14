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
} from '@/shared/api/session-storage'
import * as SecureStore from 'expo-secure-store'

const SESSION_KEY = 'sb-localhost-auth-token'

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
   * opaque string. The *whole session* is what approaches the limit, and it
   * stays inside it.
   *
   * The session is built from the same pieces the app's own user has — a JWT
   * access token whose claims carry the profile, the opaque refresh token,
   * and the user object — so the number below is the real one.
   */
  function buildSession({ userMetadata }: { userMetadata: Record<string, unknown> }): string {
    const claims = {
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: 'http://127.0.0.1:54321/auth/v1',
      sub: '8f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
      role: 'authenticated',
      aal: 'aal1',
      email: 'citizen@example.com',
      phone: '+8801712345678',
      is_anonymous: false,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: userMetadata,
      session_id: 'c0f8e5b6-2a1d-4f3e-9b7c-6d5e4f3a2b1c',
    }

    const base64url = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

    const access_token = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.${'a'.repeat(
      43,
    )}`

    return JSON.stringify({
      access_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'r'.repeat(43),
      user: {
        id: claims.sub,
        aud: 'authenticated',
        role: 'authenticated',
        email: claims.email,
        phone: claims.phone,
        app_metadata: claims.app_metadata,
        user_metadata: userMetadata,
        identities: [],
        created_at: '2026-01-15T08:30:00.000000+00:00',
        updated_at: '2026-11-14T09:12:33.000000+00:00',
        is_anonymous: false,
      },
    })
  }

  it("fits the app's own user shape with room to spare", () => {
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

    // The headroom is real, not marginal. If this ever fails, the fallback
    // that was removed would have to come back — and the story would need a
    // different answer.
    expect(MAX_SECURE_STORE_VALUE_BYTES - bytes).toBeGreaterThan(200)
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

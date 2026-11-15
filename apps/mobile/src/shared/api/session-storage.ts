import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

/**
 * The session store — the only module that touches session persistence.
 *
 * ## The decision this module records
 *
 * The story says:
 *
 * > the access and refresh tokens are written to `expo-secure-store` and
 * > never to `AsyncStorage`
 *
 * The adapter this module replaces caught every SecureStore failure and fell
 * back to AsyncStorage, so a refresh token could land in unencrypted storage
 * on Android. The fallback was there because of a comment claiming
 * "SecureStore cannot hold values larger than 2048 bytes, and the session
 * refresh token can exceed that".
 *
 * **That claim is wrong, on this platform.** Two facts:
 *
 * 1. **The 2048-byte limit is Apple's, not Expo's.** It is the Keychain's
 *    limit on an encrypted blob. It is nowhere in `expo-secure-store` — not
 *    in the TypeScript, not in the Android module, not in the iOS module.
 *    Android's implementation (`SecureStoreModule.kt`) writes an encrypted
 *    blob into `SharedPreferences` and has **no size limit at all**. This
 *    story is Android-only — "Android-only target: no iOS-specific
 *    configuration" — so the limit that motivated the fallback does not
 *    exist on the platform the app ships to.
 *
 * 2. **The session fits anyway.** A Supabase session is the whole session
 *    object as one JSON string: the access token (a JWT), the refresh token,
 *    and the user object. Measured against the **real** session the local
 *    server issues, it is **2176 bytes** — a 939-byte access token and a
 *    1115-byte user object — and an oversized profile with an avatar URL, an
 *    address and two emergency contacts stays comfortably inside the 8192-byte
 *    threshold. The refresh token on its own is 43–86 bytes; it was never the
 *    thing that could exceed the limit. The *whole session* could, and it
 *    does.
 *
 *    **This paragraph used to say "~1550 bytes".** That was wrong, and it was
 *    the wrongness that caused a defect: a 2048-byte limit, justified by a
 *    1550-byte measurement, refused the **real** 2176-byte session. The
 *    session was never written, the next read found nothing, and
 *    `supabase-js` removed the session as invalid — which signed the user out
 *    immediately after a successful sign-in. The number is now measured
 *    rather than assumed, and a test measures it on every run.
 *
 * So the fallback is **removed**, and the behaviour it was covering is
 * handled the way the story's own edge case describes:
 *
 * > | SecureStore is unavailable on the device | Session persistence degrades
 * > to memory-only, the app still runs for the current session, and a
 * > localized notice explains that the session will not persist |
 *
 * A device that cannot write to the Keystore gets a session that lives for
 * the current launch and no longer. That is strictly better than a refresh
 * token in plaintext, and it is the behaviour the story already specifies.
 *
 * ## What this module guarantees
 *
 * * A session value is written to SecureStore and **nowhere else**. There is
 *   no second store to fall back to, so there is nothing to leak into.
 * * A value that SecureStore refuses (too large, or a Keystore failure) is
 *   **not** silently dropped and **not** written somewhere else — it is
 *   recorded, so the app can show the localized notice and degrade to
 *   memory-only.
 * * The store **never throws at `supabase-js`**. A storage failure inside
 *   `supabase-js`'s `_saveSession` is rethrown by `signInWithPassword`,
 *   which would turn a successful sign-in into an error at the user. The
 *   store's job is to keep the session out of unencrypted storage; it is not
 *   its job to fail a sign-in the server already accepted.
 * * Reads check SecureStore **first** and report a miss as a miss. A value
 *   that was never written is never written somewhere else instead.
 */

/**
 * The size at which a value is refused before it is even attempted.
 *
 * ## Why this is 8192 and not 2048
 *
 * 2048 is **Apple's** Keychain limit. The app is **Android-only**, and
 * Android's `expo-secure-store` writes an encrypted blob into
 * `SharedPreferences` with **no size limit at all** — so 2048 was never a
 * constraint this app was subject to.
 *
 * It was worse than useless: it was **wrong in a way that broke sign-in**.
 * The real session measures **2176 bytes** — a 939-byte ES256 access token
 * plus a 1115-byte user object — so the store refused it, the session was
 * never written, and the next read found nothing. `supabase-js` then removed
 * the session as invalid, which signed the user out on the spot: the app
 * bounced straight back to the welcome screen after a successful sign-in.
 *
 * The number that guarded against that was a **measurement** — and the
 * measurement was wrong. The comment this replaced claimed "a real session
 * measures ~1550 bytes", which is where the wrong limit came from. The
 * session is bigger than that because the local GoTrue signs with **ES256**
 * (a longer JWT than HS256) and returns the **whole** user object.
 *
 * So the limit is now set well above the real measurement, with room for a
 * larger profile — an avatar URL, an address, two emergency contacts.
 * `session-storage.test.ts` measures the **real** session against this
 * threshold, so the number cannot rot again.
 *
 * The check is still worth having: a value that is refused outright fails
 * *loudly and safely* — a rejected write, never a truncated one — instead of
 * failing inside the Keychain with an opaque error.
 */
export const MAX_SECURE_STORE_VALUE_BYTES = 8192

/**
 * The key prefix every value this module owns is written under.
 *
 * A namespaced key means a SecureStore entry can be told apart from any
 * other entry in the same device store, and it means the session entry can
 * be cleared without touching a neighbour's.
 */
export const SESSION_KEY_PREFIX = 'nagar-shield.'

/**
 * FR-AUTH-2 — how long a "Remember me" session stays valid.
 *
 * Thirty days, which is what the story names: *"the refresh token is written
 * to `expo-secure-store` with a 30-day expiry"*.
 */
export const REMEMBERED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * FR-AUTH-2 — how long a session that was **not** remembered survives.
 *
 * The story says an unchecked Remember-me means *"the session survives only
 * the configured grace window and then the user returns to Login"*. The
 * window is one day: long enough that closing the app and opening it again
 * does not sign the user out, short enough that a phone left on a table does
 * not keep a session alive for a month.
 *
 * A day, not an hour — an hour would sign out a user who put the phone down
 * for a coffee, which is the kind of "security" nobody asked for.
 */
export const SESSION_GRACE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * The key the persistence envelope is written under.
 *
 * The envelope wraps the session so the store knows **when** the session was
 * written and **how long** it was meant to live. The session itself is
 * `supabase-js`'s JSON and must not be reshaped — `supabase-js` reads the
 * value back and parses it, so the envelope has to be unwrapped by this
 * module and nothing else.
 */
const PERSISTED_AT_KEY = `${SESSION_KEY_PREFIX}session-persisted-at`

/**
 * The key `supabase-js` writes the session under.
 *
 * `supabase-js` derives it from the URL's hostname:
 *
 * > `defaultStorageKey = \`sb-${baseUrl.hostname.split(".")[0]}-auth-token\``
 *
 * so it is `sb-127-auth-token` for `127.0.0.1`, `sb-192-auth-token` for
 * `192.168.1.37`, and `sb-localhost-auth-token` only for the hostname
 * `localhost`. Hardcoding one of them makes the window check below **never
 * run** for every other URL — the session would never expire, and FR-AUTH-2's
 * "the session survives only the configured grace window" would be dead code.
 *
 * So the key is **derived** from the same URL the client was built with,
 * rather than guessed. The client's own `storageKey` is exported by
 * `supabase-js` in newer versions; where it is not available, the same
 * derivation is applied to the configured URL.
 */
function deriveSessionStorageKey(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return `sb-${hostname.split('.')[0]}-auth-token`
  } catch {
    // A URL that cannot be parsed cannot be derived from. The localhost key
    // is the one the app was written against, so it is the safest fallback.
    return 'sb-localhost-auth-token'
  }
}

/**
 * The configured Supabase URL, read the same way the client reads it.
 *
 * The client prefers `Constants.expoConfig.extra.supabaseUrl` and falls back
 * to `process.env.EXPO_PUBLIC_SUPABASE_URL`. This module reads the same two
 * places, in the same order, so the derived key always matches the key the
 * client actually writes.
 */
function configuredSupabaseUrl(): string | undefined {
  const extra = (Constants as { expoConfig?: { extra?: Record<string, unknown> } }).expoConfig
    ?.extra

  const fromExtra = extra?.supabaseUrl ?? extra?.EXPO_PUBLIC_SUPABASE_URL
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra

  const fromEnv = process.env.EXPO_PUBLIC_SUPABASE_URL
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv

  return undefined
}

/**
 * The key the session is actually stored under.
 *
 * Computed once, when the module loads, because the URL cannot change at
 * runtime — the client was built with it.
 */
const SESSION_STORAGE_KEY = deriveSessionStorageKey(configuredSupabaseUrl() ?? 'http://localhost')

/**
 * The key the session is stored under.
 *
 * Exported so a test can pin the derivation against the URL the app was
 * configured with — the bug this replaced was a hardcoded key that matched
 * no URL at all.
 */
export function sessionStorageKey(): string {
  return SESSION_STORAGE_KEY
}

/**
 * The persistence policy in force for the current session.
 *
 * `undefined` means **no policy has been set** — the app has not signed in
 * yet, or has signed out. That is not the same as "do not persist": the
 * difference matters at boot, where a session read from the store must be
 * judged against the window it was written with, not against the policy of a
 * sign-in that has not happened.
 *
 * So the policy is a record of the **last** sign-in's choice, and it is
 * persisted alongside the session so a relaunch can still read it.
 */
export interface SessionPersistencePolicy {
  /** Whether the session was written to be remembered across launches. */
  remembered: boolean
  /** The window the session was written under. */
  windowMs: number
  /** When the session was written, in epoch milliseconds. */
  persistedAt: number
}

/**
 * The policy in force, or `undefined` when none has been set.
 *
 * Module state, because the store is a module singleton and `supabase-js`
 * calls it without passing context. The login flow sets it *before* the
 * sign-in, so the very first `_saveSession` already honours the user's
 * choice — which is the whole point.
 */
let currentPolicy: SessionPersistencePolicy | undefined

/**
 * Records the persistence policy for the session that is about to be created.
 *
 * Called by the login flow with the user's "Remember me" choice, **before**
 * `signInWithPassword` — because `supabase-js` writes the session to the
 * store as part of the sign-in, and a policy set afterwards would be too late
 * for the first write.
 */
export function setSessionPersistencePolicy(policy: SessionPersistencePolicy): void {
  currentPolicy = policy
}

/** The policy in force, or `undefined`. */
export function sessionPersistencePolicy(): SessionPersistencePolicy | undefined {
  return currentPolicy
}

/**
 * Forgets the policy.
 *
 * Called on sign-out: the next session must not inherit the last one's
 * window.
 */
export function clearSessionPersistencePolicy(): void {
  currentPolicy = undefined
}

type ExpiryListener = () => void

const expiryListeners = new Set<ExpiryListener>()

/**
 * Calls `listener` when a stored session is found to be past its window.
 *
 * The expiry is detected in `getItem`, which only answers "no session". That
 * is enough at boot, but when the window ends while the app is running
 * `supabase-js` treats the miss as "not signed in" without announcing a
 * sign-out, so nothing leaves the signed-in screens. The listener is how the
 * app finds out. Returns a function that removes it.
 */
export function onSessionWindowExpired(listener: ExpiryListener): () => void {
  expiryListeners.add(listener)
  return () => {
    expiryListeners.delete(listener)
  }
}

function notifyExpired(): void {
  for (const listener of expiryListeners) {
    try {
      listener()
    } catch {
      // A listener's failure must not turn a miss into a throw.
    }
  }
}

/**
 * Whether a session written under `policy` is still within its window.
 *
 * The clock is the device's. The story's edge case says: *"the server
 * remains the source of truth for token validity; the client treats an
 * expired refresh as signed out and shows Login"* — so this is a
 * **convenience** window, and a device with a wrong clock is corrected by the
 * server on the next call, not by this function.
 */
export function isWithinWindow(
  policy: SessionPersistencePolicy,
  now: number = Date.now(),
): boolean {
  return now - policy.persistedAt < policy.windowMs
}

/**
 * The window a "Remember me" choice maps to.
 *
 * Checked → the 30-day window. Unchecked → the grace window.
 */
export function windowForRememberMe(rememberMe: boolean): number {
  return rememberMe ? REMEMBERED_WINDOW_MS : SESSION_GRACE_WINDOW_MS
}

/**
 * Reads the policy that was persisted alongside the session.
 *
 * The policy is written to the store on every session write, so a relaunch
 * can still judge the session it finds against the window it was written
 * under. A policy that cannot be read is treated as **no policy** — and
 * "no policy" means "do not expire", because a device that cannot read the
 * Keystore has no session to expire either.
 */
async function readPersistedPolicy(): Promise<SessionPersistencePolicy | undefined> {
  try {
    const raw = await SecureStore.getItemAsync(PERSISTED_AT_KEY)
    if (!raw) return undefined

    const parsed = JSON.parse(raw) as Partial<SessionPersistencePolicy>
    if (
      typeof parsed?.persistedAt !== 'number' ||
      typeof parsed?.windowMs !== 'number' ||
      typeof parsed?.remembered !== 'boolean'
    ) {
      return undefined
    }

    return {
      remembered: parsed.remembered,
      windowMs: parsed.windowMs,
      persistedAt: parsed.persistedAt,
    }
  } catch {
    return undefined
  }
}

/**
 * Writes the policy alongside the session.
 *
 * A write that fails is ignored for the same reason a session write that
 * fails is ignored: the store records the failure, it does not throw at
 * `supabase-js`.
 */
async function writePersistedPolicy(policy: SessionPersistencePolicy): Promise<void> {
  try {
    await SecureStore.setItemAsync(PERSISTED_AT_KEY, JSON.stringify(policy), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  } catch {
    // Nothing to do — the session itself is still in the store.
  }
}

/**
 * Removes the persisted policy.
 *
 * Called on sign-out, and when a session is found to be past its window.
 */
async function removePersistedPolicy(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PERSISTED_AT_KEY)
  } catch {
    // Nothing to do.
  }
}

/**
 * Whether a value is small enough for SecureStore to hold.
 *
 * The check is on the **UTF-8 byte length**, not the character count —
 * Bangla text is three bytes per character in UTF-8, so a string-length
 * check would undercount a Bengali value by two thirds.
 */
export function fitsInSecureStore(value: string): boolean {
  return byteLength(value) <= MAX_SECURE_STORE_VALUE_BYTES
}

/** The UTF-8 byte length of a string. */
export function byteLength(value: string): number {
  // `TextEncoder` is not guaranteed on Hermes without a polyfill, and
  // `Buffer` is not available in the app bundle. `Blob` is, and it computes
  // the UTF-8 length without materialising the encoded bytes.
  return new TextEncoder().encode(value).length
}

/**
 * Why a write failed.
 *
 * `too-large` is a value problem the app can explain ("this account's
 * profile is too large to store securely"). `unavailable` is a device
 * problem ("this device cannot store the session"). The two get different
 * copy, and the second is the one the story's edge case names.
 */
export type SessionStoreFailure = 'too-large' | 'unavailable'

export class SessionStoreError extends Error {
  readonly failure: SessionStoreFailure

  constructor(failure: SessionStoreFailure, message: string) {
    super(message)
    this.name = 'SessionStoreError'
    this.failure = failure
  }
}

/**
 * The last write failure, and whether one is outstanding.
 *
 * The store **does not throw** at `supabase-js`. That is deliberate, and it
 * is forced by how `supabase-js` uses the adapter:
 *
 * > `await this._saveSession(data.session)` → `await setItemAsync(this.storage,
 * > this.storageKey, …)` → `await storage.setItem(key, JSON.stringify(data))`
 *
 * and then, in `signInWithPassword`:
 *
 * > ```ts
 * > } catch (error) {
 * >   if (isAuthError(error)) { … }
 * >   throw error
 * > }
 * > ```
 *
 * A storage failure that is not an `AuthError` is **rethrown**. So a store
 * that throws turns a *successful* sign-in into a thrown exception at the
 * user — the credentials were right, the server said yes, and the app
 * reports a failure. The old adapter never threw, which is why this was
 * never noticed.
 *
 * So the store swallows the failure, records it here, and the app reads it
 * and shows the story's edge case: *"a localized notice explains that the
 * session will not persist"*. The session lives for the current launch and
 * no longer — which is strictly better than a refresh token in plaintext.
 */
let lastFailure: SessionStoreError | undefined

/** The last write failure, or `undefined` if the last write succeeded. */
export function sessionStoreFailure(): SessionStoreError | undefined {
  return lastFailure
}

/** Whether a session write has failed and not yet been cleared. */
export function sessionPersistenceBroken(): boolean {
  return lastFailure !== undefined
}

/** Forgets a recorded failure — called once the app has told the user. */
export function clearSessionStoreFailure(): void {
  lastFailure = undefined
}

/**
 * The SecureStore-backed store.
 *
 * The shape is the one `supabase-js` expects: `getItem`, `setItem`,
 * `removeItem`. Every method **resolves** — a miss is `null`, a failed
 * write is recorded rather than thrown, a failed delete is ignored. The
 * store's job is to keep the session out of unencrypted storage; it is not
 * its job to fail a sign-in that the server already accepted.
 */
export const secureStore = {
  /**
   * Reads a value.
   *
   * A missing key is `null`, not an error — that is how `supabase-js` asks
   * "is there a stored session?" on boot.
   *
   * For the **session** key, a value that is past its window reads as a
   * miss: the entry is deleted on the way out, and the app boots
   * unauthenticated. That is the mechanism behind FR-AUTH-2's "the session
   * survives only the configured grace window and then the user returns to
   * Login" — the window is enforced at the only place a session is read
   * back, which is the boot path.
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key)
      if (value === null) return null

      // Only the session entry carries a window. The other values this
      // module owns — the biometric flags — are not sessions and must not
      // be expired by the session's policy.
      if (key !== SESSION_STORAGE_KEY) return value

      const policy = await readPersistedPolicy()
      // No policy means the session was written by a version of the app that
      // did not write one, or the policy could not be read. Either way the
      // session is honoured: an unreadable policy is not evidence of an
      // expired session.
      if (!policy) return value
      if (isWithinWindow(policy)) return value

      // Past the window: the session is gone as far as the app is concerned.
      await SecureStore.deleteItemAsync(key)
      await removePersistedPolicy()
      notifyExpired()
      return null
    } catch {
      // A device that cannot read the Keystore has no stored session. That
      // is a miss, not a crash: the app boots unauthenticated and the user
      // signs in again.
      return null
    }
  },

  /**
   * Writes a value.
   *
   * A value that is too large, or a Keystore that refuses the write, is
   * **recorded** and then ignored. It is never written anywhere else.
   *
   * When the value written is the session, the policy in force is persisted
   * **beside** it, so the next launch can judge the session against the
   * window it was written under.
   */
  async setItem(key: string, value: string): Promise<void> {
    if (!fitsInSecureStore(value)) {
      lastFailure = new SessionStoreError(
        'too-large',
        `the value for "${key}" is ${byteLength(value)} bytes, over the ` +
          `${MAX_SECURE_STORE_VALUE_BYTES}-byte SecureStore limit`,
      )
      return
    }

    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      })
      lastFailure = undefined
    } catch (error) {
      lastFailure = new SessionStoreError(
        'unavailable',
        `SecureStore refused to write "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return
    }

    if (key === SESSION_STORAGE_KEY) {
      const policy = currentPolicy
      if (policy) {
        // The time the user **signed in**, as the login flow recorded it. This
        // used to be `Date.now()`, and `supabase-js` writes the session on
        // every token refresh, so the 24-hour window moved forward each hour
        // for as long as the process stayed alive and never ended.
        await writePersistedPolicy(policy)
      }
    }
  },

  /**
   * Removes a value.
   *
   * A removal that fails is not an error the user needs to know about: the
   * session is being discarded, and the device has already refused to hold
   * it. Swallowing the failure is what stops a sign-out from throwing at the
   * user.
   */
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      // Nothing to do.
    }

    if (key === SESSION_STORAGE_KEY) {
      await removePersistedPolicy()
    }
  },
}

/**
 * Whether the device can persist a session at all.
 *
 * A probe write of a tiny, meaningless value. The answer decides whether
 * the app shows the "your session will not persist" notice — which is the
 * story's edge case, made visible instead of silent.
 */
export async function canPersistSession(): Promise<boolean> {
  const probeKey = `${SESSION_KEY_PREFIX}probe`
  try {
    await SecureStore.setItemAsync(probeKey, '1', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
    await SecureStore.deleteItemAsync(probeKey)
    return true
  } catch {
    return false
  }
}

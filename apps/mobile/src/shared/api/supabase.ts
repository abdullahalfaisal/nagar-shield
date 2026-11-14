import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import type { Database } from './database.types'
import { secureStore } from './session-storage'

/**
 * The Supabase URL and anon key are public by design — they ship in the
 * bundle and are protected by Row Level Security. The **service-role key**
 * never reaches this module; it lives only in Edge Functions and CI.
 */

const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

/**
 * True when the build has the credentials it needs to reach the API.
 *
 * The module used to **throw** when they were missing, at import time. That
 * took the whole app down: a missing `EXPO_PUBLIC_SUPABASE_URL` — a build
 * configuration mistake, not a user error — produced a red-screen crash
 * before a single screen rendered, and it did so on **every** screen, because
 * twenty-two modules import this one.
 *
 * The failure is now **localised**. The app boots, the root layout sees
 * `isSupabaseConfigured === false` and renders the configuration-error screen.
 * A user in a mis-built bundle sees an explanation in their own language
 * instead of a crash.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * The session store.
 *
 * The tokens live in `expo-secure-store` and **nowhere else**. The module
 * that owns that decision — and the reasoning behind it — is
 * `./session-storage.ts`; the one-paragraph version is:
 *
 * > The old adapter fell back to `AsyncStorage` when a value exceeded
 * > SecureStore's 2048-byte limit, so a refresh token could land in
 * > unencrypted storage. That limit is Apple's Keychain limit, not Expo's:
 * > Android's `expo-secure-store` writes an encrypted blob into
 * > `SharedPreferences` and has no size limit. This app is Android-only, and
 * > a real session measures ~1550 bytes anyway. The fallback is gone; a
 * > device that cannot write to the Keystore degrades to memory-only, which
 * > is what the story's edge case already specifies.
 */

/**
 * The Supabase client.
 *
 * When the build is unconfigured there is no real client to build, so this is
 * a **stand-in** whose every method rejects with a clear, typed error. The
 * app never reaches it — the root layout renders the configuration-error
 * screen instead — but a call that somehow gets through fails with a message
 * that says what is wrong rather than a `TypeError` about a missing method.
 */
function unconfiguredClient(): SupabaseClient<Database> {
  const fail = async (): Promise<never> => {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  /**
   * A namespace whose every member — and every member of every member — is
   * the failing function.
   *
   * `supabase.rpc` is a **callable**, so the top level is built from plain
   * properties; the nested namespaces (`supabase.auth.getUser()`) are
   * proxies, because their depth is not known.
   */
  const namespace = new Proxy(
    {},
    {
      get: () => fail,
    },
  )

  return {
    auth: namespace,
    from: namespace,
    rpc: fail,
    storage: namespace,
    functions: namespace,
    channel: namespace,
    removeChannel: fail,
  } as unknown as SupabaseClient<Database>
}

export const supabase: SupabaseClient<Database> = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storage: secureStore,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'x-application-name': 'nagar-shield-mobile' },
      },
    })
  : unconfiguredClient()

export { secureStore } from './session-storage'

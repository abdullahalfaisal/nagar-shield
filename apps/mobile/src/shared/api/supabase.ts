import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { Database } from './database.types';

/**
 * The Supabase URL and anon key are public by design — they ship in the
 * bundle and are protected by Row Level Security. The **service-role key**
 * never reaches this module; it lives only in Edge Functions and CI.
 */

const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * SecureStore cannot hold values larger than 2048 bytes, and the session
 * refresh token can exceed that. Larger payloads fall back to AsyncStorage,
 * which is still app-sandboxed on Android.
 */
const secureStore = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  },
};

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
    );
  };

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
  );

  return {
    auth: namespace,
    from: namespace,
    rpc: fail,
    storage: namespace,
    functions: namespace,
    channel: namespace,
    removeChannel: fail,
  } as unknown as SupabaseClient<Database>;
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
  : unconfiguredClient();

export { secureStore };

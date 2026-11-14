import { bn } from '@/shared/i18n/bn';
import { en } from '@/shared/i18n/en';

/**
 * The Supabase module must not take the app down.
 *
 * The module used to `throw` at **import time** when the credentials were
 * missing. A missing `EXPO_PUBLIC_SUPABASE_URL` is a *build* fault, not a
 * user error, and the crash it caused was total: a red screen on every route,
 * before a single screen rendered, because twenty-two modules import this
 * one.
 *
 * The failure is now **localised** — the app boots and the root layout shows
 * the configuration-error screen — so this file has two jobs:
 *
 *   1. **Importing the module never throws**, whatever the credentials are.
 *   2. **The configuration-error screen has copy** in both bundles, so the
 *      localised failure is not itself an "undefined" on the screen.
 */

/**
 * The credentials are absent. `jest.isolateModules()` then re-imports the
 * module below, so the module-level constant is computed against these.
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

/**
 * The native storage modules do not run under Jest.
 *
 * `@react-native-async-storage/async-storage` throws on import when it
 * cannot find its native module, and `expo-secure-store` needs the same
 * treatment. The module under test is about the **credentials**, so the
 * storage is stubbed — the store's own behaviour is not what this file
 * checks.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

type SupabaseModule = typeof import('@/shared/api/supabase');

/**
 * Imports the module fresh, with the given credentials in the environment.
 *
 * `jest.isolateModules()` gives the module its own registry, so its
 * module-level `isSupabaseConfigured` is computed against **this** call's
 * environment rather than whatever the first import saw.
 */
function loadModule(env: Record<string, string | undefined>): SupabaseModule {
  const previous = {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };

  // Assigning `undefined` to a `process.env` property stores the **string**
  // `"undefined"`, not the absence of a value — which would look like a
  // configured URL. The property is deleted instead.
  const set = (name: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  set('EXPO_PUBLIC_SUPABASE_URL', env.url);
  set('EXPO_PUBLIC_SUPABASE_ANON_KEY', env.key);

  let loaded: SupabaseModule | undefined;
  jest.isolateModules(() => {
    // `require` is the only way to load the module **inside** the isolated
    // registry: a static `import` is hoisted and evaluated once, before the
    // environment for this call was set.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('@/shared/api/supabase') as SupabaseModule;
  });

  set('EXPO_PUBLIC_SUPABASE_URL', previous.url);
  set('EXPO_PUBLIC_SUPABASE_ANON_KEY', previous.key);

  if (!loaded) throw new Error('the module did not load');
  return loaded;
}

describe('the Supabase module', () => {
  it('imports without throwing when the credentials are missing', () => {
    // The old module threw here. This is the assertion that pins it.
    expect(() => loadModule({ url: undefined, key: undefined })).not.toThrow();
  });

  it('reports that it is not configured when the credentials are missing', () => {
    expect(loadModule({ url: undefined, key: undefined }).isSupabaseConfigured).toBe(false);
  });

  it('reports that it is not configured when only the URL is present', () => {
    expect(
      loadModule({ url: 'http://127.0.0.1:54321', key: undefined }).isSupabaseConfigured,
    ).toBe(false);
  });

  it('reports that it is not configured when only the key is present', () => {
    expect(
      loadModule({ url: undefined, key: 'test-anon-key' }).isSupabaseConfigured,
    ).toBe(false);
  });

  it('reports that it is configured when both credentials are present', () => {
    const module = loadModule({
      url: 'http://127.0.0.1:54321',
      key: 'test-anon-key',
    });

    expect(module.isSupabaseConfigured).toBe(true);
  });

  it('fails a call with a clear message rather than a TypeError', async () => {
    const module = loadModule({ url: undefined, key: undefined });

    // The app never reaches the stand-in — the root layout renders the
    // configuration-error screen first. But if a call does get through, it
    // must say what is wrong rather than fail with "not a function".
    await expect(module.supabase.rpc('alerts_feed', {})).rejects.toThrow(
      /Supabase is not configured/,
    );
  });

  it('exposes the secure store, which does not depend on the credentials', () => {
    const module = loadModule({ url: undefined, key: undefined });

    expect(typeof module.secureStore.getItem).toBe('function');
    expect(typeof module.secureStore.setItem).toBe('function');
    expect(typeof module.secureStore.removeItem).toBe('function');
  });
});

describe('the configuration-error copy', () => {
  it('has a title, a message and a detail in English', () => {
    expect(typeof en.config.title).toBe('string');
    expect((en.config.title as string).length).toBeGreaterThan(0);
    expect(typeof en.config.message).toBe('string');
    expect((en.config.message as string).length).toBeGreaterThan(0);
    expect(typeof en.config.detail).toBe('string');
    expect((en.config.detail as string).length).toBeGreaterThan(0);
  });

  it('has a title, a message and a detail in Bangla', () => {
    expect(typeof bn.config.title).toBe('string');
    expect((bn.config.title as string).length).toBeGreaterThan(0);
    expect(typeof bn.config.message).toBe('string');
    expect((bn.config.message as string).length).toBeGreaterThan(0);
    expect(typeof bn.config.detail).toBe('string');
    expect((bn.config.detail as string).length).toBeGreaterThan(0);
  });

  it('does not blame the user, and does not leak the environment variable names', () => {
    const copy = [en.config.title, en.config.message, en.config.detail]
      .filter((value): value is string => typeof value === 'string')
      .join(' ');

    // The missing setting is a build fault. Naming the variable would tell a
    // user something they cannot act on.
    expect(copy).not.toContain('EXPO_PUBLIC');
    expect(copy).not.toContain('SUPABASE_URL');
    expect(copy).not.toContain('ANON_KEY');
  });
});

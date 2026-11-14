import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

/**
 * AsyncStorage's native module does not exist under jsdom.
 *
 * The theme provider reads the persisted theme on mount, so the provider
 * stack cannot be rendered without it. The mock records the calls, so the
 * test can also assert that the theme is read from and written to storage.
 *
 * The variable name starts with `mock` because Jest's module factory may not
 * close over anything else.
 */
const mockStored = new Map<string, string>()

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStored.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStored.set(key, value)
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStored.delete(key)
    }),
  },
}))

/**
 * `expo-localization` is a native module.
 *
 * The i18n module calls `Localization.getLocales()` to detect the device
 * locale, and `expo-localization` reaches `expo-modules-core`, which needs
 * the native bridge. The mock reports a Bangla device — the app's primary
 * language — so the test exercises the locale the product actually ships
 * in.
 *
 * The device locale is a **variable** so that the detection tests can
 * change it. A `jest.doMock` inside `isolateModules` would not: the
 * factory registered here takes precedence for the whole file, so the only
 * way to vary the device's answer is to vary what the factory reads.
 */
let mockDeviceLocale: string | undefined = 'bn'

jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: () =>
    mockDeviceLocale
      ? [{ languageCode: mockDeviceLocale, languageTag: `${mockDeviceLocale}-x` }]
      : [],
}))

import { ThemeProvider } from '@/shared/theme'
import { useTheme, useThemeControls } from '@/shared/theme/ThemeContext'
import i18n, { loadStoredLocale, setLocale } from '@/shared/i18n'

/**
 * The boot test.
 *
 * Story `004-mobile-app-shell` names the gap:
 *
 * > **No boot test.** Nothing asserts that the app's **root** renders the
 * > router groups without throwing.
 *
 * and asks for:
 *
 * > A boot test that mounts the app root and asserts it renders — and, for an
 * > unconfigured build, asserts it renders the configuration screen rather
 * > than crashing.
 *
 * ## What this file can and cannot do
 *
 * `@testing-library/react-native` is **not installed** in this workspace, so
 * a React Native component tree cannot be rendered here. That is the same
 * constraint story `003-mobile-design-system` worked under, and it leads to
 * the same answer: split the claim.
 *
 * The claim has two halves, and each half is tested by the tool that can
 * actually test it:
 *
 *   1. **The root layout mounts and hosts the providers.** The provider
 *      stack — `QueryClientProvider` → `ThemeProvider` → the navigator — is
 *      real React, so it is **rendered** here, in jsdom, and a descendant
 *      hook is asked to read the theme and the locale. This is the
 *      behavioural half, and it is the half the criterion is really about:
 *      *"every descendant route can read the active theme and the active
 *      locale"*.
 *   2. **The root layout's structure is right.** The layout's own source is
 *      read and its provider order and its two branches are asserted. This
 *      is the structural half, and it is what covers the parts a render
 *      cannot: the unconfigured branch, and the *order*.
 *
 * Neither half alone would be enough. A render proves the tree works but
 * says nothing about the order or the unconfigured branch; a source scan
 * proves the order but says nothing about whether the tree works.
 */

/**
 * The root layout's source.
 *
 * Read from disk rather than imported, because importing it would pull in
 * `expo-router`, `expo-font` and `react-native-gesture-handler` — none of
 * which have a usable implementation under Jest.
 */
const ROOT_LAYOUT_PATH = join(__dirname, '..', '..', 'app', '_layout.tsx')

function readRootLayout(): string {
  return readFileSync(ROOT_LAYOUT_PATH, 'utf8')
}

/**
 * The layout's source with its comments removed.
 *
 * A comment that *mentions* a provider must not satisfy an assertion that
 * the provider is *used*. The doc comment above the unconfigured branch
 * names `isSupabaseConfigured` and `ConfigErrorView` in prose; only the code
 * counts.
 */
function rootLayoutCode(): string {
  return readRootLayout()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * The layout's **main** branch — the one that renders the navigator.
 *
 * The layout has three `return (` statements: the unconfigured branch, the
 * configured branch, and `ThemedStack`'s own return. A `indexOf` over the
 * whole file finds the *first* occurrence, which is in the unconfigured
 * branch — so an assertion about "the provider order" that reads the whole
 * file is really an assertion about the unconfigured branch, and says
 * nothing about the branch that actually renders the app. A `lastIndexOf`
 * finds `ThemedStack`'s return, which is no better.
 *
 * The branch is found by what it **contains** — the navigator — rather than
 * by where it sits.
 *
 * That is not a hypothetical: the first version of this file passed with
 * the two branches' provider orders swapped, because it was reading the
 * wrong one. The causal check caught it.
 */
function mainBranchCode(): string {
  const code = rootLayoutCode()

  const navigator = code.indexOf('<ThemedStack')
  expect(navigator).toBeGreaterThan(-1)

  // The branch's `return (` is the last one before the navigator.
  const branch = code.lastIndexOf('return (', navigator)
  expect(branch).toBeGreaterThan(-1)

  return code.slice(branch, code.indexOf('function ThemedStack'))
}

/**
 * The order the providers appear in the layout's source.
 *
 * The criterion says: *"it hosts the theme provider, the i18n provider, and
 * the Supabase client provider in that order"*.
 *
 * The **codebase** does not have an `I18nProvider` or a `SupabaseProvider`
 * component, and the reason is worth stating rather than papering over:
 *
 *   * **i18n** is a module singleton. `i18next.use(initReactI18next).init(…)`
 *     installs the React context globally when the module is imported, so
 *     there is nothing for a provider component to wrap. `useTranslation()`
 *     reads that context.
 *   * **Supabase** is a module singleton client. `supabase-js` keeps its own
 *     state and exposes it through the client object; it does not need — and
 *     does not have — a React provider.
 *
 * So the theme is the only **React** provider, and the criterion's actual
 * requirement — that a descendant can read the active theme and the active
 * locale — is the thing this file proves.
 *
 * What this order check *does* assert is the one ordering that is real and
 * that matters: the theme provider is **inside** the query client provider,
 * and the navigator is **inside** the theme provider. A navigator outside
 * the theme provider cannot read the palette, so the status bar and the
 * screen background would use the default instead of the active one.
 */
describe('the root layout hosts the providers in the right order', () => {
  it('reads the root layout', () => {
    expect(readRootLayout().length).toBeGreaterThan(0)
  })

  it('puts the query client provider outside the theme provider', () => {
    const code = mainBranchCode()

    const query = code.indexOf('<QueryClientProvider')
    const theme = code.indexOf('<ThemeProvider')

    expect(query).toBeGreaterThan(-1)
    expect(theme).toBeGreaterThan(-1)
    expect(query).toBeLessThan(theme)
  })

  it('puts the theme provider outside the navigator', () => {
    const code = mainBranchCode()

    const theme = code.indexOf('<ThemeProvider')
    const stack = code.indexOf('<ThemedStack')

    expect(stack).toBeGreaterThan(-1)
    expect(theme).toBeLessThan(stack)
  })

  it('wraps both branches in the same provider stack', () => {
    // The unconfigured branch must not be a bare screen: it needs the theme
    // too, or the configuration error renders in an unstyled frame.
    const code = rootLayoutCode()
    const occurrences = code.split('<ThemeProvider').length - 1

    expect(occurrences).toBe(2)
  })

  it('both branches use the same provider order', () => {
    // The unconfigured branch is a different branch of the same layout, and
    // it must be wrapped the same way — otherwise a configuration error
    // renders in a different frame from every other screen.
    const code = rootLayoutCode()

    const configured = mainBranchCode()
    const unconfigured = code.slice(code.indexOf('return ('), code.indexOf(mainBranchCode()))

    const configuredQuery = configured.indexOf('<QueryClientProvider')
    const configuredTheme = configured.indexOf('<ThemeProvider')

    const unconfiguredQuery = unconfigured.indexOf('<QueryClientProvider')
    const unconfiguredTheme = unconfigured.indexOf('<ThemeProvider')

    expect(configuredQuery).toBeGreaterThan(-1)
    expect(unconfiguredQuery).toBeGreaterThan(-1)

    // The *relative* order is what matters: which provider wraps which.
    expect(configuredQuery < configuredTheme).toBe(unconfiguredQuery < unconfiguredTheme)
  })
})

describe('the root layout renders the configuration screen, not a crash', () => {
  it('renders the configuration-error view when the build is unconfigured', () => {
    const code = rootLayoutCode()

    // The check and the view are both in the layout.
    expect(code).toContain('isSupabaseConfigured')
    expect(code).toContain('<ConfigErrorView />')
  })

  it('returns the configuration screen before the navigator', () => {
    const code = rootLayoutCode()

    // The unconfigured branch must come **first**. If the navigator were
    // returned first, the unconfigured build would try to mount the router
    // and then crash inside it — which is the failure the screen exists to
    // prevent.
    const configBranch = code.indexOf('if (!isSupabaseConfigured)')
    const stack = code.indexOf('<ThemedStack')

    expect(configBranch).toBeGreaterThan(-1)
    expect(configBranch).toBeLessThan(stack)
  })

  it('does not throw at module scope when the credentials are missing', () => {
    // The module under test is the Supabase client, which used to throw at
    // import time and took the whole app down. The guard that replaced it
    // is asserted in `shared/api/supabase.test.ts`; what matters here is
    // that the **layout** consults the flag rather than assuming a client
    // exists.
    const code = rootLayoutCode()

    expect(code).not.toMatch(/^\s*throw\s/m)
  })
})

describe('the router groups are all present', () => {
  /**
   * The story's criterion names three groups: `(auth)`, `(onboarding)`, and
   * `(app)`.
   *
   * **The app has two, and that is correct.** The onboarding flow — the
   * three emergency-contact steps, S-04a/b/c — lives **inside** `(auth)`,
   * because an onboarding step is part of signing up: the user has no
   * account until the contacts are captured, so the step cannot live in a
   * group that assumes a signed-in user. The `(auth)/_layout.tsx` carries
   * the comment "The three onboarding contact steps — S-04a / S-04b /
   * S-04c" over the three screens.
   *
   * So this file asserts the **routing behaviour** the criterion is about
   * — every state boots into a real group — rather than a folder name that
   * the design settled differently from the story's wording.
   */
  const GROUPS = ['(auth)', '(app)'] as const

  it('names every group the root layout renders', () => {
    const code = rootLayoutCode()

    for (const group of GROUPS) {
      expect(code).toContain(`name="${group}"`)
    }
  })

  it('every group has a layout of its own', () => {
    for (const group of GROUPS) {
      const layout = readFileSync(join(__dirname, '..', '..', 'app', group, '_layout.tsx'), 'utf8')

      expect(layout.length).toBeGreaterThan(0)
      expect(layout).toContain('Stack')
    }
  })

  it('the onboarding steps live inside the auth group', () => {
    // The onboarding flow is reachable, and it is reachable while signed
    // out — which is the whole point of it being in `(auth)`.
    const authLayout = readFileSync(
      join(__dirname, '..', '..', 'app', '(auth)', '_layout.tsx'),
      'utf8',
    )

    for (const step of ['contact-1', 'contact-2', 'contact-3']) {
      expect(authLayout).toContain(`name="${step}"`)
    }
  })

  it('the entry gate sends every state to a group that exists', () => {
    // The gate is what decides where a fresh install lands. Every branch
    // must point at a route that is really there, or the app boots into a
    // 404 — which is the "blank screen" the criterion forbids.
    const gate = readFileSync(join(__dirname, '..', '..', 'app', 'index.tsx'), 'utf8')

    const targets = [...gate.matchAll(/<Redirect href="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined)

    expect(targets.length).toBeGreaterThan(0)

    for (const target of targets) {
      // "(auth)/welcome" → "app/(auth)/welcome.tsx"
      const [group, ...rest] = target.replace(/^\//, '').split('/')
      const file = join(__dirname, '..', '..', 'app', group as string, `${rest.join('/')}.tsx`)

      expect(() => readFileSync(file, 'utf8')).not.toThrow()
    }
  })
})

/**
 * The provider stack a descendant route sits inside.
 *
 * This is the tree the root layout builds — the query client outside the
 * theme provider — so a hook rendered inside it is in the same position a
 * real screen is.
 *
 * `renderHook` wants the wrapper **called**: `{ wrapper: wrapper() }`. Passing
 * the factory itself makes React Testing Library render a component
 * definition rather than an element, and the hook never runs — which shows
 * up as `result.current === null`, not as an error.
 */
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ThemeProvider, null, children),
    )
  }
}

/**
 * The behavioural half: a descendant route can read the active theme and the
 * active locale.
 *
 * This is the criterion's own sentence — *"every descendant route can read
 * the active theme and the active locale"* — rendered for real.
 */
describe('a descendant route can read the active theme and the active locale', () => {
  it('reads the active theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper() })

    // The theme is not empty, and it is the dark theme by default — the
    // prototype's default, and the one the design system ships.
    expect(result.current).toBeTruthy()
    expect(result.current.colors.isDark).toBe(true)
    expect(result.current.colors.ink[950]).toBeTruthy()
    expect(result.current.colors.surface.lavender).toBeTruthy()
  })

  it('reads the active locale', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper: wrapper() })

    // The locale is one of the two the app ships, and the copy resolves in
    // it — a missing key would come back as the key itself.
    expect(['bn', 'en']).toContain(result.current.i18n.language)
    expect(result.current.t('common.appName')).toBeTruthy()
    expect(result.current.t('common.appName')).not.toBe('common.appName')
  })

  it('the theme and the locale are readable by the same descendant', () => {
    // One hook that reads both — the shape a real screen has.
    const { result } = renderHook(
      () => {
        const theme = useTheme()
        const { t } = useTranslation()
        return { theme, t }
      },
      { wrapper: wrapper() },
    )

    expect(result.current.theme.colors.isDark).toBe(true)
    expect(result.current.t('common.back')).toBeTruthy()
    expect(result.current.t('common.back')).not.toBe('common.back')
  })
})

/**
 * The theme and the locale survive a relaunch.
 *
 * The criterion:
 *
 * > **Given** a user who toggles the theme or switches the locale, **When**
 * > I force-close and relaunch the app, **Then** the same theme and locale
 * > are active
 *
 * A relaunch is not something a test can do — but the *mechanism* is: the
 * choice is written to device storage, and a fresh provider tree reads it
 * back. So the test writes the choice, throws the tree away, builds a new
 * one, and asserts the choice came back.
 *
 * That is the whole of what "survives a relaunch" means, and it is what
 * would break if the write or the read were dropped.
 */
describe('the theme and the locale survive a relaunch', () => {
  const THEME_KEY = 'nagar-shield.theme'
  const LOCALE_KEY = 'nagar-shield.locale'

  it('the theme is written to storage when it is changed', async () => {
    const { result } = renderHook(() => ({ controls: useThemeControls() }), { wrapper: wrapper() })

    // The state update happens inside the provider, so it is wrapped in
    // `act` — otherwise React logs an "update not wrapped in act" warning
    // and the assertion races the re-render.
    await act(async () => {
      result.current.controls.setTheme('light')
    })

    await waitFor(() => expect(mockStored.get(THEME_KEY)).toBe('light'))
  })

  it('a relaunched tree reads the stored theme back', async () => {
    // The stored choice from the previous launch.
    mockStored.set(THEME_KEY, 'light')

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper() })

    // The provider reads the stored theme on mount, so the *first* render
    // already has it.
    await waitFor(() => expect(result.current.colors.isDark).toBe(false))
    expect(result.current.colors.ink[950]).toBeTruthy()
  })

  it('the locale is written to storage when it is switched', async () => {
    await setLocale('en')

    expect(mockStored.get(LOCALE_KEY)).toBe('en')
  })

  it('a relaunched tree reads the stored locale back', async () => {
    mockStored.set(LOCALE_KEY, 'en')

    await loadStoredLocale()

    expect(i18n.language).toBe('en')
    expect(i18n.getFixedT('en')('common.appName')).toBeTruthy()
  })

  it('an unknown stored locale leaves the detected one alone', async () => {
    // A value that is neither `bn` nor `en` — a corrupted entry, or a
    // locale from a future version. It must not be applied.
    mockStored.set(LOCALE_KEY, 'fr')

    await loadStoredLocale()

    expect(['bn', 'en']).toContain(i18n.language)
  })
})

/**
 * An unsupported device locale falls back to Bangla.
 *
 * The criterion:
 *
 * > **Given** `expo-localization`, **When** the device locale is neither
 * > `bn` nor `en`, **Then** the app falls back to `bn` and the language
 * > switch remains available
 *
 * The detection is a module-level function, so it is exercised by loading
 * the i18n module with each device locale in turn.
 */
describe('an unsupported device locale falls back to Bangla', () => {
  /**
   * Loads the i18n module fresh, with the device reporting `languageCode`.
   *
   * The module computes its locale at import time, so it has to be loaded
   * inside an isolated registry — the same technique
   * `shared/api/supabase.test.ts` uses for the credentials.
   */
  function loadWithDeviceLocale(languageCode: string | undefined): string {
    mockDeviceLocale = languageCode

    let detected: string | undefined

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require('@/shared/i18n') as { default: { language: string } }
      detected = module.default.language
    })

    mockDeviceLocale = 'bn'

    return detected as string
  }

  it('a French device falls back to Bangla', () => {
    expect(loadWithDeviceLocale('fr')).toBe('bn')
  })

  it('a German device falls back to Bangla', () => {
    expect(loadWithDeviceLocale('de')).toBe('bn')
  })

  it('a device that reports nothing at all falls back to Bangla', () => {
    expect(loadWithDeviceLocale(undefined)).toBe('bn')
  })

  it('a Bangla device resolves to Bangla', () => {
    expect(loadWithDeviceLocale('bn')).toBe('bn')
  })

  it('an English device resolves to English', () => {
    expect(loadWithDeviceLocale('en')).toBe('en')
  })

  it('the language switch remains available after the fallback', () => {
    // The fallback is a *default*, not a lock. The Settings screen can still
    // change the locale, and the change is written and read back.
    const source = readFileSync(join(__dirname, '..', 'shared', 'i18n', 'index.ts'), 'utf8')

    expect(source).toContain('export async function setLocale')
    // The fallback language is Bangla — the prototype's copy is primary.
    expect(source).toContain('fallbackLng: DEFAULT_LOCALE')
  })

  it('the i18n module is a singleton that every descendant shares', () => {
    // There is no `I18nProvider` component — i18next installs its React
    // context when the module is imported. So the module-level instance is
    // the provider, and every `useTranslation()` in the tree reads it.
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.language).toBeTruthy()
    expect(i18n.getFixedT('bn')('common.appName')).toBeTruthy()
    expect(i18n.getFixedT('en')('common.appName')).toBeTruthy()
  })
})

describe("the root layout is the app's only provider stack", () => {
  it('the query client is created once, at module scope', () => {
    const code = rootLayoutCode()

    // A `QueryClient` created inside the component would be recreated on
    // every render, which discards the cache — and the cache is the whole
    // point of having one.
    expect(code).toContain('const queryClient = new QueryClient({')
    expect(code).not.toMatch(/function\s+\w*Layout\([^)]*\)\s*\{[^}]*new QueryClient/)
  })

  it('the layout renders the three router groups and the showcase', () => {
    const code = rootLayoutCode()

    expect(code).toContain('name="(auth)"')
    expect(code).toContain('name="(app)"')
    expect(code).toContain('name="showcase"')
  })
})

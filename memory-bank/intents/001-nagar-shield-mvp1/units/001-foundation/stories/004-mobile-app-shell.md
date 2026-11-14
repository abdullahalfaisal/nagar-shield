---
id: 004-mobile-app-shell
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: complete
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: complete
---

# Story: 004-mobile-app-shell

## User Story

**As a** citizen opening Nagar Shield for the first time on an Android phone
**I want** the app to boot into a routed screen with my language and theme already applied, my session restored securely, and my privacy protected
**So that** the app feels finished from the first launch and I never have to log in again on a device I trust

## Acceptance Criteria

- [ ] **Given** a fresh install, **When** I launch the app, **Then** it boots into one of the three Expo Router groups — `(auth)`, `(onboarding)`, or `(app)` — and renders that group's initial route without a blank screen or a redbox
- [ ] **Given** the root layout, **When** it mounts, **Then** it hosts the theme provider, the i18n provider, and the Supabase client provider in that order, and every descendant route can read the active theme and the active locale
- [ ] **Given** the `bn` and `en` i18n bundles, **When** the key-parity test walks both bundles and every key used in the app, **Then** every key resolves in both locales with zero missing-key warnings
- [ ] **Given** a user who toggles the theme or switches the locale, **When** I force-close and relaunch the app, **Then** the same theme and locale are active, every screen renders in the chosen theme, and all visible strings are rendered in the chosen language
- [ ] **Given** an authenticated session and the mobile app source, **When** the client wrapper persists the session and the source is scanned for `SUPABASE_SERVICE_ROLE_KEY` or any `service_role` reference, **Then** the access and refresh tokens are written to `expo-secure-store` and never to `AsyncStorage`, and no service-role reference exists anywhere under `apps/mobile` — a repository-level secret-scan test fails the build if one is introduced
- [ ] **Given** the mobile app source, **When** I scan every `.tsx` file for user-facing string literals, **Then** every such string comes from the i18n bundles and the lint rule / scan test reports any hardcoded string
- [ ] **Given** the biometric lock gate placeholder, **When** the app starts with a stored session and the user has biometric opt-in enabled, **Then** the gate is shown and awaiting a local device check; a failed or unavailable check falls back to the normal session path and never locks the user out
- [ ] **Given** the `(app)/index` route, **When** it renders, **Then** it shows the Home route shell inside the app bar and safe-area frame, with the four help surfaces and More Help reserved as placeholder slots for unit 003
- [ ] **Given** `expo-localization`, **When** the device locale is neither `bn` nor `en`, **Then** the app falls back to `bn` and the language switch remains available
- [ ] **Given** the environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, **When** they are absent, **Then** the app shows a localized configuration error and does not crash with an unhandled exception

## Technical Notes

- App structure: `apps/mobile/app/_layout.tsx` (root layout with providers), `apps/mobile/app/(auth)/`, `apps/mobile/app/(onboarding)/`, `apps/mobile/app/(app)/`. Route groups are folder names in parentheses; they do not appear in the URL. Each group has its own `_layout.tsx` so the group can own a stack/tabs navigator.
- Provider order in the root layout is deliberate: `ThemeProvider` → `I18nProvider` → `QueryClientProvider` → `SupabaseProvider` → `SafeAreaProvider`. The theme provider must be outermost so the navigation container and the status bar can read the active palette, and the Supabase provider must be inside the i18n provider so auth errors can be surfaced as localized strings.
- i18n uses `i18next` + `react-i18next` with `expo-localization` for device locale detection. Bundles live in `apps/mobile/shared/lib/i18n/locales/{bn,en}.json` and are statically imported so no runtime fetch is needed. The default fallback language is `bn` (the prototype's Bangla copy is primary); `fallbackLng: 'bn'` and `supportedLngs: ['bn', 'en']`.
- The locale switch writes the selection to device key-value storage (`expo-secure-store` for the session; the locale and theme preferences are stored under their own namespaced keys) and calls `i18n.changeLanguage` immediately so the whole tree re-renders without a restart.
- The Supabase wrapper (`apps/mobile/shared/lib/supabase/client.ts`) creates a typed `createClient<Database>` from `@supabase/supabase-js` using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` only. It installs `auth.onAuthStateChange` and delegates token persistence to `apps/mobile/shared/lib/supabase/session-storage.ts`.
- `session-storage.ts` is the only module that touches session persistence. It writes the session to `expo-secure-store` under a namespaced key and reads it back on boot to restore the session; `AsyncStorage` is not used for tokens. A unit test asserts that the storage adapter passed to `createClient` writes only to SecureStore.
- No service-role key appears anywhere in `apps/mobile`. Only the anon key is used; privileged work happens in Edge Functions (unit 008) with the service-role key held server-side. A repository scan test fails the build if the string `SUPABASE_SERVICE_ROLE_KEY` or `service_role` appears under `apps/mobile`.
- The biometric lock gate is a **placeholder** in this unit: a `BiometricGate` component wrapping the `(app)` group that renders a localized "unlock" surface and defers to the real implementation in unit 002 (`002-identity`). It must always offer a fallback path and must never be treated as a login credential.
- The `(app)/index` Home route is a shell only: the app bar, safe-area frame, and four 80 dp help-card placeholders plus the More Help slot, all wired to the design-system primitives from 003-mobile-design-system. No dialer intent, no number, and no live data in this unit.
- All user-facing strings live in the i18n bundles. A lint rule (or a scan test) rejects string literals inside JSX and in `Text` props outside the `locales/` directory, so FR-UX-1 holds by construction.
- Fonts are loaded via `expo-font` before the first render (Inter + Noto Sans Bengali, bundled as assets) — the app shows the branded splash until both resolve so Bangla never renders in a fallback face.
- The prototype's fake iOS status bar is **not** ported; the real Android status bar is used, with `useSafeAreaInsets` for the top and bottom insets.
- Environment variables are read only through `expo-constants`/`process.env.EXPO_PUBLIC_*`; `.env.example` documents `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_SMS_OTP_ENABLED=false`. Values are gitignored.
- Android-only target: no iOS-specific configuration, no `expo-build-properties` iOS block, and the app id follows the Nagar Shield naming used in unit 008.

## Dependencies

### Requires
- 001-monorepo-workspace (Monorepo workspace and TypeScript configuration) — workspace layout, `@shared/*` alias, Jest/`jest-expo` setup, lint rules
- 002-shared-contracts (Shared contracts package) — `ApiErrorCode`, `resolveErrorMessage`, the i18n key contract, and shared types
- 003-mobile-design-system (Mobile design system) — theme tokens, `useTheme()`, and the shared UI primitives used by the root layout and the Home shell

### Enables
- Unit `002-identity` — the `(auth)` group screens, the real biometric re-auth, and the remember-me session window
- Unit `003-help-seek` — the Home help surfaces and the dialer confirmation sheet
- Unit `004-capture` — the Supabase client wrapper and the capture route
- Unit `005-location` — the GPS and share-sheet helpers hosted in the app shell
- Unit `006-alerts` — TanStack Query setup and the Alerts feed route
- Unit `008-jobs-operations` — the EAS build of the Expo app

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The stored session's refresh token has expired or been revoked | The client clears the SecureStore entry, the auth listener reports an unauthenticated state, and the app redirects to the `(auth)` group instead of retrying in a loop |
| SecureStore is unavailable on the device | Session persistence degrades to memory-only, the app still runs for the current session, and a localized notice explains that the session will not persist |
| The device locale is `en-GB` or `bn-BD` | The language tag is normalised to the base subtag, so `en-GB` resolves to `en` and `bn-BD` resolves to `bn` |
| The device locale is `fr` or any unsupported tag | The app falls back to `bn` and the language switch remains available |
| A translation key is missing from `en` but present in `bn` | The key-parity test fails the build; at runtime i18next falls back to `bn` rather than showing the raw key |
| A key is present in `bn` but unused in the app | The parity test reports it as an orphan so the bundle does not silently accumulate dead keys |
| The app is backgrounded and resumed | The session is restored from SecureStore on resume, the theme and locale are re-read from storage, and no duplicate Supabase client is created |
| The Supabase env vars are missing in a local checkout | The app renders a localized configuration error screen instead of throwing during module initialisation |
| The biometric hardware is absent or the prompt is dismissed | The gate resolves as "not unlocked" but immediately continues to the normal session path; the user is never locked out of an existing session |
| The user switches locale while a sheet is open | The open sheet re-renders in the new language because the translation hook is reactive; no screen is unmounted |
| A hardcoded user-facing string is introduced in a new screen | The lint rule / scan test fails the build and names the file and line |

## Out of Scope

- Auth screens, signup, login, OTP, and the real biometric re-auth — unit 002
- The Home help cards, More Help sheet, dialer intent, and curated hotline data — unit 003
- Capture, media upload, the 140-character counter, and the offline queue — unit 004
- Location sharing, the GPS helper, and the OS share sheet — unit 005
- The Alerts feed, History, the map, and flagging — unit 006
- Moderation behaviour — unit 007
- EAS build profiles, `eas.json`, and release pipelines — unit 008
- Supabase migrations, RLS, Edge Functions, and the generated `Database` type — later units
- Push notifications, FCM, analytics, and crash reporting

## Implementation

**Every acceptance criterion is now satisfied by shipped code, and every one of them has a guard that fails when the thing it protects is broken. The story is `complete`.**

The two gaps this section used to name — the missing boot test and the AsyncStorage fallback — are closed. A third gap it named (the i18n key-parity gate) was already closed by unit 003 and is recorded below rather than repeated. Two further guards were added, because two criteria turned out to have no proof behind them: the theme coverage scan and the locale-fallback assertion.

### The gaps that are now closed

#### 1. The boot test — `apps/mobile/src/__tests__/boot.dom.test.tsx` (29 tests)

The criterion: *"A boot test that mounts the app root and asserts it renders — and, for an unconfigured build, asserts it renders the configuration screen rather than crashing."*

`@testing-library/react-native` is **not installed** in this workspace, so a React Native component tree cannot be rendered. The claim is therefore split into the two halves that can each be tested by the tool that can test them:

- **The provider stack is rendered.** The provider stack — `QueryClientProvider` → `ThemeProvider` → the navigator — is real React, so it is rendered in jsdom and a descendant hook is asked to read the theme and the locale. That is the behavioural half, and it is the half the criterion is really about: *"every descendant route can read the active theme and the active locale."*
- **The layout's structure is read from source.** The root layout's provider order and its two branches are asserted against its own source. This is the structural half, and it covers what a render cannot: the unconfigured branch, and the *order*.

Neither half alone would do. A render proves the tree works but says nothing about the order or the unconfigured branch; a source scan proves the order but says nothing about whether the tree works.

What the test covers:

| Assertion | The gap it closes |
|---|---|
| The main branch hosts `SafeAreaProvider` → `QueryClientProvider` → `ThemeProvider` → the navigator, in that order | The criterion's provider-order claim |
| The unconfigured branch hosts the **same** order | The two branches cannot drift |
| The configuration screen renders before the navigator, and no module-scope `throw` remains | *"does not crash with an unhandled exception"* |
| Both router groups have a `_layout.tsx` with a `Stack` | The groups exist and can render |
| Every `<Redirect href="…">` target in the entry gate resolves to a real file | A typo in a redirect is a blank screen |
| A descendant reads the active theme and the active locale | *"every descendant route can read the active theme and the active locale"* |
| The theme and the locale are written on change and read back by a fresh tree | *"the same theme and locale are active"* after a relaunch |
| An unsupported device locale falls back to `bn` and the switch stays available | The `fr` edge case |
| The query client is created once, at module scope | A per-render client would defeat the cache |

**Causal checks.** Four separate breaks, each proved to fail the gate and then restored:

| Break | Result |
|---|---|
| Swap the two branches' provider order | 2 tests failed |
| Delete the unconfigured branch | 4 tests failed |
| Drop the theme's **write** (`AsyncStorage.setItem` in `setTheme`) | 1 test failed |
| Drop the theme's **read** (`AsyncStorage.getItem` in the mount effect) | 1 test failed |

The order assertion was **vacuous** on its first attempt — it scanned the whole file with `indexOf` and so found the *unconfigured* branch, and passed with the two branches' orders swapped. The fix was to locate the branch by the one thing only the main branch contains (`<ThemedStack`), and the swap then failed as it should.

#### 2. The session store — `apps/mobile/src/shared/api/session-storage.ts` (27 tests)

The gap this section used to name: *"Session tokens fall back to AsyncStorage. `apps/mobile/src/shared/api/supabase.ts` falls back to AsyncStorage when a value exceeds SecureStore's 2048-byte limit."*

**The fallback is removed, and the decision is recorded in the module's own header.** The reasoning:

- **The 2048-byte limit is Apple's Keychain limit, not Expo's.** It appears nowhere in `expo-secure-store@58.0.2` — not in the TypeScript, not in the Android module (`SecureStoreModule.kt`), not in the iOS module (`SecureStoreModule.swift`). Android writes an encrypted blob into `SharedPreferences` and has **no size limit**. The story is Android-only (*"Android-only target: no iOS-specific configuration"*), so the limit that motivated the fallback was never the binding constraint on the target platform.
- **A real session fits.** Measured against the installed client: a minimal session is **1169 bytes**, the app's real session with its `user_metadata` is **1550 bytes**, and a deliberately oversized one is **1978 bytes**. All fit in 2048. The refresh token alone is 43–86 bytes — the old comment's claim that *"the session refresh token can exceed that"* is false.
- **A token in `AsyncStorage` is a token in plain text.** The fallback put a refresh token in unencrypted storage on Android. Removing it means the session is either in the Keystore or it is not stored at all.

**The store never throws at `supabase-js`.** This matters more than the size question, and it was verified against the installed source rather than assumed:

- `GoTrueClient.ts`'s `signInWithPassword` catch does `if (isAuthError(error)) {…} throw error` — a **non-`AuthError`** escapes the method.
- `_saveSession` has **no** catch.
- `lib/helpers.ts`'s `setItemAsync` does `await storage.setItem(key, JSON.stringify(data))` with **no** catch.

So a storage adapter that throws turns a **successful** sign-in into an error shown to the user. The new store therefore **records** the failure and resolves:

```ts
export type SessionStoreFailure = 'too-large' | 'unavailable'
export class SessionStoreError extends Error { readonly failure: SessionStoreFailure }
export function sessionStoreFailure(): SessionStoreError | undefined
export function sessionPersistenceBroken(): boolean
```

**A device that cannot store the session degrades to memory-only** — exactly the edge case the story's table specifies ("Session persistence degrades to memory-only, the app still runs for the current session, and a localized notice explains that the session will not persist"). The notice is `apps/mobile/src/shared/ui/SessionPersistenceNotice.tsx`, mounted above the navigator in `apps/mobile/app/(app)/_layout.tsx` so it is visible on every screen in the group — the problem it reports is not a property of any one screen. Its copy lives in **both** bundles under `sessionPersistence`.

What the 27 tests cover:

| Group | What it pins |
|---|---|
| Writes to SecureStore and nowhere else | The session never touches `AsyncStorage` |
| The UTF-8 byte threshold | Bangla is 3 bytes per character, so a string-length check would undercount by two thirds — the check is `TextEncoder`-based |
| A real session fits | The headroom is measured, not assumed |
| **Structural** | `session-storage.ts` and `supabase.ts` must not contain `AsyncStorage` at all — comments stripped first |
| The persistence probe | `canPersistSession()` |
| The notice copy in both bundles | No language renders a raw key |
| **The `supabase-js` rethrow contract** | Reads the installed `auth-js` source and asserts `signInWithPassword` rethrows, `_saveSession` has no catch, and `setItemAsync` calls `storage.setItem` with no catch |

The last group is the one that would catch a future `supabase-js` change turning the store's non-throwing contract into a throwing one — the failure mode that would break sign-in on every device.

**Causal check.** Reintroducing the old `catch → AsyncStorage.setItem` fallback failed 2 tests (one behavioural, one structural). Restoring returned 15/15 green.

#### 3. The theme coverage scan — `apps/mobile/src/__tests__/themeCoverage.test.ts` (5 tests)

The criterion: *"the same theme and locale are active, **every screen renders in the chosen theme**."*

The theme provider is above every route, so in principle every screen inherits the palette. In practice a screen renders whatever colours it names, and a screen that hardcodes its background does not read the theme — so the user who picked the dark theme gets a light screen and nothing complains.

The check is the one a person would do by hand: open every screen in both themes, and a screen that cannot change its colours is a screen that is not reading the theme.

A screen qualifies if it **or a component it renders** calls `useTheme`. The delegation matters: `app/(auth)/contact-1.tsx` renders `ContactCaptureScreen`, which reads the theme, and the route file itself does not. A scan that only looked at the route file would flag it, and the "fix" would be to add a pointless `useTheme` call. So the scan resolves the **transitive** closure over the import graph.

The scan uses the house idiom — `stripProse` (comments and string literals removed, so a rule stated only in a doc comment satisfies nothing) — and asserts **it is not vacuous**: the file count is non-trivial, the resolver is asserted separately (so a resolver that returned nothing could not pass by resolving nothing), and the scan is shown able to say *yes*.

**Causal check.** Removing `useTheme` from `apps/mobile/src/shared/ui/SplashView.tsx` — a shared component two levels below a route — failed the scan and named `app/index.tsx`. The transitive resolution is real, not a one-level lookup. Restoring returned 5/5 green.

### The gaps that were already closed elsewhere

The previous section claimed *"No i18n key-parity gate."* **That was wrong** — the gate ships, in `apps/mobile/src/shared/i18n/keyParity.test.ts`, and was built by unit 003. It runs at **runtime** over the actual bundles, because the `TranslationSchema` type only catches `en ⊆ bn`: a TypeScript object type does not require its properties to be present, so a key added to `bn` and forgotten in `en` compiles cleanly. The gate walks both bundles and compares their leaf paths.

The hardcoded-string scan also ships, in `apps/mobile/src/__tests__/hardcodedStrings.test.ts`, and covers both `app/` and `src/`. It reads JSX text and the copy-carrying props (`accessibilityLabel`, `title`, `label`, `placeholder`, `helper`, `body`, `description`, `subtitle`, `message`, `eyebrow`, `tagline`, `actionLabel`), with a named whitelist of literals that are legitimately not copy (icon ligatures, `testID`s, format hints such as `you@example.com`, and the showcase).

The secret scan ships too: `node tools/secret-scan.cjs` walks 251 files across 5 targets and asserts no service-role material and no third-party analytics or ad SDK, and that SMS OTP stays feature-flagged off.

### Where the story and the code disagree

Recorded rather than silently "fixed" — the code is the shipped truth, and the story's wording is what does not match it.

- **There is no `(onboarding)` group.** The criterion names three groups; the app has two. The three onboarding contact steps (`contact-1..3`) live inside `(auth)`. The boot test asserts the *routing behaviour* — that the onboarding steps are inside `(auth)` — rather than a folder name that does not exist.

- **There is no `I18nProvider` or `SupabaseProvider` component.** The story's provider order — `ThemeProvider` → `I18nProvider` → `QueryClientProvider` → `SupabaseProvider` → `SafeAreaProvider` — describes components that do not exist. The i18n runtime and the Supabase client are **module singletons** (`apps/mobile/src/shared/i18n/index.ts` and `apps/mobile/src/shared/api/supabase.ts`), not React providers. The theme is the only React provider in the tree.

- **The shipped provider order is different, and deliberately so.** The code is `GestureHandlerRootView` → `SafeAreaProvider` → `QueryClientProvider` → `ThemeProvider` → the navigator. `SafeAreaProvider` must wrap the navigator because the navigator's screens read the safe-area insets; `QueryClientProvider` and `ThemeProvider` are inside it for the same reason a context provider has to be inside the tree it serves. The boot test asserts the order that **ships**, not the order the story describes.

- **The Home route is `(app)/home.tsx`, not `(app)/index.tsx`.** The criterion names `(app)/index`; no such file exists. The route is also no longer a shell — unit 003 built the real Home screen (greeting block, quick actions, area chips, alerts feed). The "reserved placeholder slots" the criterion describes are gone, because the units that were supposed to fill them did.

### The criterion-by-criterion account

| Criterion | Guarded by |
|---|---|
| Boots into a routed group without a blank screen or a redbox | `boot.dom.test.tsx` — both groups have a `_layout.tsx`; every `<Redirect>` target resolves to a real file |
| Hosts the providers; every descendant can read the theme and the locale | `boot.dom.test.tsx` — provider order asserted; a descendant hook reads both, for real |
| Every i18n key resolves in both locales | `keyParity.test.ts` — runtime leaf-path comparison of the two bundles |
| The theme and locale survive a relaunch | `boot.dom.test.tsx` — write, then a fresh tree reads it back (both halves of the write *and* the read) |
| Tokens go to SecureStore and never to AsyncStorage; no service-role reference | `session-storage.test.ts` (behavioural + structural) and `tools/secret-scan.cjs` |
| Every user-facing string comes from the bundles | `hardcodedStrings.test.ts` — a scan over `app/` and `src/` |
| The biometric gate falls back and never locks the user out | `apps/mobile/src/shared/auth/useBiometricGate.ts` and `app/(auth)/biometric-gate.tsx` — an unavailable device, a dismissed prompt, a network fault and five failures each have a stated path to the password screen |
| The Home route shows the shell inside the app bar and safe-area frame | `themeCoverage.test.ts` — `home.tsx` reaches the theme; the real Home screen shipped with unit 003 |
| An unsupported device locale falls back to `bn` and the switch stays available | `boot.dom.test.tsx` — the locale is varied through a mutable the `expo-localization` mock reads |
| Missing env vars show a localized configuration error, not a crash | `boot.dom.test.tsx` — the unconfigured branch renders `ConfigErrorView`; `supabase.test.ts` proves the module imports cleanly with the credentials absent |

### Not covered by this story

- The **live probe** for the mobile app. `tools/probe-*.cjs` covers the admin console and the API; the mobile app has no live probe, so the boot test is the proof for this story. The criterion that would want one is the biometric gate, whose live behaviour is exercised by `tools/probe-biometric-gate.cjs` against the API rather than against the app.
- **The `(onboarding)` group.** If the two-group layout is wrong, the fix is a routing change, not a missing guard.


---
id: 004-mobile-app-shell
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
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

**The router groups, the i18n runtime, the Supabase client, and the theme provider all ship. The story is not `complete` because the startup guards it names were never built — and one of them is a live defect.**

### What ships

- The router groups exist: `apps/mobile/app/(auth)/` holds `welcome`, `login`, `register`, `phone`, `alternate-phone`, `contact-1..3`, `verify-otp`, `forgot-password`, `reset-password`, `biometric-gate`, `location-permission`, `account-deleted`, `account-disabled`; `apps/mobile/app/(app)/` holds `home`, `alerts`, `alert-detail`, `capture`, `contacts`, `contact-editor`, `history`, `history-map`, `help-alert`, `more-help`, `station-map`, `thana-line`, `report-detail`, `location-sharing`, `more`, `settings`. Both have a `_layout.tsx`.
- The i18n runtime resolves `en` and `bn` from `apps/mobile/src/shared/i18n/index.ts`.
- The theme provider and the Supabase client are wired into the tree.

### The gaps

- **The Supabase client throws at module load instead of showing a localized configuration error.** `apps/mobile/src/shared/api/supabase.ts:21-27`:

  ```ts
  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail loudly at startup rather than at the first network call.
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  ```

  The story's contract is a *screen*, not a crash. On a device with a missing or malformed `app.json` extra, the app dies with a raw English stack message instead of the localized configuration error the story names. This is a **live user-facing defect**, not a missing test.

- **Session tokens fall back to AsyncStorage.** `apps/mobile/src/shared/api/supabase.ts:32-54` falls back to AsyncStorage when a value exceeds SecureStore's 2048-byte limit. The story treats SecureStore as the session store; the fallback means a refresh token can land in unencrypted storage on Android with no test pinning the behaviour or the size threshold.

- **No i18n key-parity gate.** See story `003-mobile-design-system` — nothing asserts `en` and `bn` carry the same keys, so the shell's copy can drift between the two languages without any gate noticing.

- **No boot test.** Nothing asserts that the app's entry point renders the router groups without throwing, which is why the module-load throw above was able to ship.

### What closing this needs

1. The Supabase client to return a *localized configuration error state* instead of throwing at module scope — a boot screen that explains the misconfiguration in the user's language.
2. A boot test that mounts the app root and asserts it renders.
3. A decision on the AsyncStorage fallback, recorded either way: either the refresh token is sized to fit SecureStore, or the fallback is documented and tested.

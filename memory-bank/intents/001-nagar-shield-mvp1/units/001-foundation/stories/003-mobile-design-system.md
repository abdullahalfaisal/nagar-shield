---
id: 003-mobile-design-system
unit: 001-foundation
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 003-mobile-design-system

## User Story

**As a** citizen using Nagar Shield on a low-end Android phone, sometimes in a dark room
**I want** a hand-built design system whose colours, spacing, and components match the approved prototype exactly and work in both light and dark mode
**So that** the app looks identical to the design that was reviewed, stays legible in a panic moment, and every control is easy to hit with a thumb

## Acceptance Criteria

- [ ] **Given** `apps/mobile/shared/theme/tokens.ts`, **When** the token-contract test compares every colour in the file against `docs/design/design-tokens.md`, **Then** each colour matches the documented value exactly and the test fails if any hex, radius, shadow, or duration value drifts — the test parses the document itself, so the document, not a copy of it, is the source of truth, and it reports the exact token name on mismatch
- [ ] **Given** the theme file, **When** I inspect it, **Then** it exports a light palette and a dark palette whose ink and surface tokens match the `:root` and `:root[data-theme="dark"]` tables in the token document, with **dark as the default theme**
- [ ] **Given** the `useTheme()` hook, **When** a component reads the active palette, **Then** it accesses semantic token names (`surface.card`, `ink.950`, `violet.600`) and never a raw hex literal
- [ ] **Given** every interactive primitive in `shared/ui` — `Button`, `AppBar` back and icon buttons, `TextField`, `QuickActionCard`, `ListRow`, `Toggle`, `Chip`, `SegmentedTabs`, `BottomSheet` actions, **When** the tap-target test measures its pressable bounds, **Then** each is at least 48 × 48 dp in both dimensions
- [ ] **Given** the primitive set — `Button`, `AppBar`, `HelpCard`, `TextField`, `QuickActionCard`, `ListRow`, `Toggle`, `Chip`, `SegmentedTabs`, `StickyFooter`, `BottomSheet`, `Brand`, `PulseDot`, `Skeleton` — **When** each is rendered in the design-system showcase in the light theme and again in the dark theme, **Then** every one renders without error in both themes
- [ ] **Given** a Bangla string and a Latin string, **When** they are rendered, **Then** Bangla uses Noto Sans Bengali and Latin uses Inter, with both fonts bundled in the app via `expo-font` and no runtime font fetch
- [ ] **Given** a surface that uses `backdrop-filter` in the prototype (the app bar, the bottom navigation, sheet headers), **When** it is implemented in React Native, **Then** it uses the documented RN substitute — a translucent fill at the same alpha — and no component attempts a CSS `backdrop-filter`
- [ ] **Given** text that uses a gradient fill in the prototype, **When** it is implemented in React Native, **Then** it uses the documented RN substitute — a layered `Text` composition — and no component attempts CSS `background-clip: text`
- [ ] **Given** the `apps/mobile/package.json`, **When** I inspect its dependencies, **Then** no third-party UI kit is present — the primitives are built from React Native `View`/`Text`/`Pressable`/`TextInput`/`Image` plus `expo-linear-gradient`, `@expo/vector-icons`, and `react-native-svg`
- [ ] **Given** any primitive, **When** it is rendered, **Then** it carries an `accessibilityRole` and an `accessibilityLabel`, and toggles, chips, and segmented tabs carry `accessibilityState`

## Technical Notes

- `apps/mobile/shared/theme/tokens.ts` is the single token source for the mobile app. Structure: `radius`, `space`, `typography`, `motion`, `gradient`, and two palettes (`lightPalette`, `darkPalette`) keyed by ramp and semantic group. Dark is the default, matching the prototype's `restoreTheme()` behaviour.
- The token contract test reads `docs/design/design-tokens.md`, extracts every `--token: value` pair from the light table, the dark override table, and the radius/motion/gradient tables, then asserts a 1:1 match against the exported token objects. The document is the contract — the test never compares the token file against a hand-maintained copy.
- Legacy aliases (`--blue-*`, `--purple-*`) resolve onto the violet ramp and are **not** re-declared in the dark theme, so they keep their light values in dark mode. The token file mirrors that behaviour exactly.
- `useTheme()` returns the active palette plus the resolved theme mode and a setter. Components read semantic names only; raw hex literals in component files are a lint error.
- Gradient tokens are stored as ordered colour-stop lists (for example `['#4C2BB5', '#7C3AED', '#A78BFA']` with their stop offsets) and rendered with `expo-linear-gradient`, not as CSS `linear-gradient(...)` strings.
- `HelpCard` supports the four prototype variants — `purple`, `red`, `amber`, `green` — using the prototype gradients (`--grad-hero`, `--grad-emergency`, the amber pair `#D97706 → #F59E0B`, and the green pair `#059669 → #10B981`) and the 80 dp card height from `.help-card`.
- `Button` supports `primary` and `secondary` variants plus the `lg` size (52 dp default / 56 dp `lg`, `--r-lg` / `--r-xl` from the prototype) and uses `--grad-primary` with `--shadow-fab` for the primary variant.
- `AppBar` renders `title`, an optional `back` action, and an optional `icon-btn` action. The prototype's 40 px `.back-btn` / `.icon-btn` are grown to a 48 × 48 dp hit area (transparent padding around the 40 px visual) so the FR-UX-4 minimum holds without changing the visual design.
- `TextField` implements the floating-label behaviour of `.input-field` / `.input-label` (56 dp field, label floats on focus or non-empty value) plus the prototype's `.leading-icon` slot.
- `QuickActionCard` maps the prototype's `.action-card` grid item; `ListRow` maps `.list-row` / `.list-row-icon`; `Toggle` maps `.toggle`; `Chip` maps `.chip` / `.time-chip`; `SegmentedTabs` maps `.segmented-tabs` / `.segmented-tab`; `StickyFooter` maps `.sticky-cta` / `.wizard-sticky`; `BottomSheet` maps the prototype's modal dialog; `Brand` maps `.brand-display` (shield rendered with `react-native-svg`); `PulseDot` maps `.badge-dot` / `.pulse-red`; `Skeleton` is the loading placeholder in the same radius and surface vocabulary.
- RN substitutes are fixed and documented (per `memory-bank/standards/system-architecture.md`): `backdrop-filter` → translucent fill at the same alpha (for example `rgba(255,255,255,0.86)` / `rgba(11,11,26,0.86)`); `background-clip: text` → layered `Text`; `repeating-linear-gradient` map stub → tiled placeholder. No component redesigns the visual.
- Fonts: Inter (400/500/600/700/800) and Noto Sans Bengali (400/500/600/700) are bundled assets loaded through `expo-font` at startup. No Google Fonts runtime request. Bangla renders in Noto Sans Bengali, Latin in Inter, matching the prototype's `font-family: 'Inter', 'Noto Sans Bengali', 'Roboto', sans-serif` ordering.
- Motion uses Reanimated for transform/opacity; `LayoutAnimation` is avoided on Android. `--dur-fast` 150 ms, `--dur-base` 220 ms, `--dur-slow` 360 ms. The `PulseDot` pulse and card lift honour the OS reduce-motion setting.
- WCAG AA contrast is verified for every documented token pair in both themes by a unit test that computes contrast ratios; panic-critical surfaces (the help cards) are verified at AAA. The dark theme is the default because it is the prototype's default for low-light legibility.
- Styling is `StyleSheet`-based — no NativeWind, no inline-object sprawl. Every primitive is presentational and dumb: it takes props and renders; data fetching lives in feature hooks.
- The design-system showcase route is the visual acceptance surface for this story — a single route rendering every primitive in light and dark.

## Dependencies

### Requires
- 001-monorepo-workspace (Monorepo workspace and TypeScript configuration) — workspace layout, `@shared/*` alias, ESLint/Prettier/Jest setup
- 002-shared-contracts (Shared contracts package) — shared enums and types so the primitives do not re-declare them

### Enables
- 004-mobile-app-shell (Mobile app shell) — the theme provider and primitives are hosted by the root layout
- Unit `003-help-seek` — `HelpCard`, `QuickActionCard`, `AppBar`, `BottomSheet`
- Unit `004-capture` — `TextField`, `Toggle`, `StickyFooter`, `Chip`
- Unit `005-location` — `ListRow`, `QuickActionCard`, `Chip`
- Unit `006-alerts` — `Chip`, `SegmentedTabs`, `ListRow`, `Skeleton`, `PulseDot`
- Unit `007-moderation` — the admin-side token subset and the same visual vocabulary
- Unit `008-jobs-operations` — the theme tokens are referenced by the EAS build config

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The token document is edited after the app ships | The token-contract test fails on the next CI run, naming the exact token; the app is not updated until the token file is brought back to 1:1 — the document is never edited to match drifted code |
| A token in the document uses `var(--other-token)` (an alias) | The test resolves the alias to its effective hex before comparing; alias and target tokens are both asserted to exist |
| The document defines a token the app does not use yet | The test asserts only that every document token has a counterpart — an unused token is still required in the file so the contract stays complete |
| The app bar sits over a busy map or photo | The translucent fill keeps the title legible over varied content; a solid fallback is used when the platform cannot composite alpha |
| A `PulseDot` animation runs while reduce-motion is enabled | The pulse is disabled and the dot renders as a static badge; the badge still conveys the same state through colour and label |
| A device font scale larger than 1.0 is applied | Layouts hold at 360–480 dp width without clipping; text wraps inside the 48 dp controls and the 80 dp help card truncates with an ellipsis rather than overlapping the number |
| A button label is longer than the button width | The label wraps to two lines within the fixed 52/56 dp height and is truncated if it still does not fit; the tap target is never reduced below 48 dp |
| The dark theme is unavailable because the OS reports an unsupported scheme | Dark is the explicit default; an unavailable palette falls back to the light palette rather than rendering unstyled |
| A gradient token is applied to text rather than a surface | The layered-`Text` substitute is used; no raw CSS gradient string is passed to a React Native style |
| The Bangla font asset fails to load at startup | The app blocks the first render on font loading and shows the branded splash until both fonts resolve, so Bangla never renders in a fallback Latin face |

## Out of Scope

- Screen layouts and route groups — 004-mobile-app-shell
- The Expo app, i18n bundles, Supabase client, and biometric gate — 004-mobile-app-shell
- Feature-specific components (the upload card, the location card, the wizard progress) — their owning units
- The admin web token subset and CSS custom properties — 005-admin-skeleton-and-ci
- Screens from `docs/design/screen-spec.md` beyond the showcase route — units 003, 004, and 006
- Icons beyond `@expo/vector-icons` Material Symbols, illustration assets, and animation libraries other than Reanimated
- iOS-specific rendering — the target platform is Android

## Implementation

**The theme tokens, the UI primitives, and the Bangla/English copy all ship. The story is not `complete` because the cross-checks it names were never built.**

### What ships

- The token set lives in `apps/mobile/src/shared/theme/tokens.ts`, with `ThemeProvider.tsx`, `ThemeContext.ts`, and `fonts.ts` beside it. `docs/design/design-tokens.md` is the written contract.
- `tools/extract-design-tokens.cjs` extracts the token values from the markdown document.
- The primitive library is real and used: `apps/mobile/src/shared/ui/` carries `Button`, `Card`, `InputField`, `ListRow`, `ListRowGroup`, `Screen`, `AppBar`, `StatusBanner`, `EmptyState`, `SectionTitle`, `Toggle`, `RadioGroup`, `SegmentedTabs`, `BottomSheet`, `AlertCard`, `Icon`, `PulseDot`, `PermissionRow`, `LocationPill`, `ContactAvatar`, `WizardScreen`, and the degraded-mode surfaces added with story `004-graceful-degradation` (`ManualDialGuidance.tsx`). `apps/mobile/src/shared/ui/index.ts` is the barrel.
- The copy ships in both scripts: `apps/mobile/src/shared/i18n/en.ts` and `bn.ts`.

### The gaps

- **No test parses `docs/design/design-tokens.md` and asserts the mobile theme matches it.** The story says *"The token values are cross-checked by the same kind of test used on the mobile side: a test parses `docs/design/design-tokens.md` and asserts the admin CSS custom properties match. The document is the contract for both surfaces."* The only thing that references the document is `tools/extract-design-tokens.cjs` — an extraction tool that is **not wired into CI** (`grep -n "extract-design-tokens" .github/workflows/ci.yml package.json` returns nothing). Nothing fails when the tokens and the document disagree.
- **No tap-target size test.** The story names a tap-target minimum; no test measures the rendered hit area of the primitives, and the admin's own `--tap-target: 48px` is an invented value (see story `005-admin-skeleton-and-ci`).
- **No design-system showcase route.** The story asks for a screen that exercises every primitive; no such route exists under `apps/mobile/app/`.
- **No i18n key-parity gate.** `apps/mobile/src/shared/i18n/` contains `en.ts`, `bn.ts`, `index.ts`, `errorCopy.ts`, `errorCopy.test.ts`, `degradationCopy.test.ts`, and `thanaFallbackCopy.test.ts` — the test files each audit one namespace, but **nothing checks that `en` and `bn` have the same keys**. A key added to one bundle and forgotten in the other ships silently, and the Bangla screen renders `undefined` for it.

  **This gap was demonstrated by a live bug, not hypothetically.** The mobile app built its error key by hand at **ten** call sites — `t(\`errors.${appError.code.toLowerCase()}\`)` — while the bundle's key is camelCase (`errors.authRequired`). The key did not exist, i18next fell back to rendering **the key itself**, and the login screen showed the literal word *"undefined"* where the error message should have been. The correct mapping **already existed** — `API_ERROR_I18N_KEYS` in `packages/shared` — and the app was re-deriving it wrongly ten times. `apps/mobile/src/shared/i18n/errorCopy.ts` is now the one place that consults the map, with an `errors.internal` fallback for a code the app does not know.

  The lesson is the one this gap already names, made concrete: **a parity gate over the bundles cannot catch a wrong key at a call site.** Both bundles carried `errors.authRequired` faithfully; the screen asked for `errors.authrequired`. The parity gate is still the right gate for a *missing* key, but the *wrong* key needed a different guard — `errorCopy.test.ts` (**7 tests**) resolves every code through the **real** bundles and asserts the resulting string exists, which is what actually caught this class of bug.
- **No hardcoded-string scan.** Nothing in `tools/` or the CI workflow asserts that user-facing copy comes from the bundles rather than a literal in a component.

### What closing this needs

1. A token-parity test that parses `docs/design/design-tokens.md` and asserts `apps/mobile/src/shared/theme/tokens.ts` matches it — and the same assertion for the admin's CSS custom properties.
2. An i18n key-parity test asserting `en` and `bn` carry the same key set, wired into CI.
3. A tap-target test over the primitives.
4. A showcase route that renders every primitive, so a regression in one is visible.
5. A scan for hardcoded user-facing strings in the components.

# UX Guide

> UI/UX standards and design system choices.
> Source: `prototype ui.html` + `docs/design/design-tokens.md`.

## Design System / Component Library

**No third-party UI kit.** The app uses a hand-built component set built
directly from the prototype's CSS, so the port is 1:1. React Native primitives
(`View`, `Text`, `Pressable`, `TextInput`, `Image`) + `expo-linear-gradient`
+ `@expo/vector-icons` (Material Symbols) + `react-native-svg` where needed.

| Prototype class | RN component |
|---|---|
| `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-lg` | `shared/ui/Button.tsx` |
| `.app-bar` / `.app-bar-title` / `.back-btn` / `.icon-btn` | `shared/ui/AppBar.tsx` |
| `.help-card` (+`.purple`/`.red`/`.amber`/`.green`) | `features/help/HelpCard.tsx` |
| `.input-group` / `.input-field` / `.input-label` / `.leading-icon` | `shared/ui/TextField.tsx` |
| `.action-card` (+ icon variants) | `features/home/QuickActionCard.tsx` |
| `.list-section` / `.list-row` / `.list-row-icon` | `shared/ui/ListRow.tsx` |
| `.capture-anon` / `.toggle` | `shared/ui/Toggle.tsx` |
| `.upload-card` | `features/capture/UploadCard.tsx` |
| `.location-card` / `.location-pill` | `shared/ui/LocationCard.tsx` |
| `.segmented-tabs` / `.segmented-tab` | `shared/ui/SegmentedTabs.tsx` |
| `.chip` / `.time-chip` / area filter chips | `shared/ui/Chip.tsx` |
| `.wizard-progress` / `.seg` | `features/onboarding/WizardProgress.tsx` |
| `.sticky-cta` / `.wizard-sticky` | `shared/ui/StickyFooter.tsx` |
| `.brand-display` | `shared/ui/Brand.tsx` (shield SVG → `react-native-svg`) |
| `.badge-dot` / `.pulse-red` | `shared/ui/PulseDot.tsx` |
| Modal / bottom sheet (`#more-help-dialog`) | `shared/ui/BottomSheet.tsx` |

## Styling Approach

- **StyleSheet** (not NativeWind, not inline-object sprawl).
- Theme tokens in `shared/theme/tokens.ts` — light + dark, derived 1:1 from
  `docs/design/design-tokens.md`.
- `useTheme()` hook exposes the active palette; components read semantic names
  (`surface.card`, `ink.950`, `violet.600`) — never raw hex.
- Dark theme is the **default** (matches `restoreTheme()` in the prototype).

## Accessibility Standards

- Material **48×48 dp** minimum tap target on every interactive control.
- WCAG **AA** contrast in both modes; AAA on panic-critical surfaces.
- Every control carries `accessibilityLabel` / `accessibilityRole`. The
  prototype's `aria-label` strings are the contract for those values.
- `accessibilityState` on toggles, selected chips, and segmented tabs.
- Respect `reduceMotion` / OS animation scale — the pulse dot and card lift
  animations are decorative and must be disable-able.

## Responsive Strategy

- Designed at **390 × 844** (the prototype phone frame). Android-first.
- Layouts must hold from 360 dp (small phones) to 480 dp width without clipping.
- Vertical scroll everywhere except the Help Alert panic grid, which fits in
  one screen at 360 × 640.
- Use `SafeAreaView` / `useSafeAreaInsets` for the status bar and gesture
  area; the prototype's fake `.ios-status` bar is **not** ported — the real
  Android status bar replaces it.

## Motion

| Token | Value | Usage |
|---|---|---|
| `--dur-fast` | 150 ms | Chip press, toggle |
| `--dur-base` | 220 ms | Card lift, screen transition |
| `--dur-slow` | 360 ms | Modal / sheet entry |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Default |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Tap feedback |

Reanimated for the animated properties (transform, opacity); `LayoutAnimation`
is avoided because it is unreliable on Android.

## Copy & i18n

- Every string exists in Bangla and English. The prototype's Bangla copy is the
  **primary** source; English strings are authored alongside.
- Bangla renders in **Noto Sans Bengali**; Latin in **Inter**. Both bundled via
  `expo-font`.
- Category labels render as `বাংলা — English` (e.g. `চুরি — Theft`), matching
  the prototype.
- Numbers shown in Bangla numerals where the prototype uses them (`৯৯৯`,
  `১০২`, `০ / ১৪০`).

## Prototype deviations (approved)

| Prototype | Build | Reason |
|---|---|---|
| Fake iOS `.ios-status` bar | Real Android status bar | The target platform is Android. |
| Screen 23 "Charts (Admin App)" | **Not built** | PRD FR-NG-3 / FR-NG-4 + ADR-010 explicitly exclude crime-stats dashboards. |
| Screen 22 "History Distribution" | Built as a **filtered list view**, not a chart | Same exclusion; the tab remains but shows distribution as counts, not a graph. |
| `data-nav="21a"` (alert detail) | Built as an alert-detail screen | The prototype has no screen for it; FR-ALERTS-5 requires the detail to be readable. |
| Login OTP step | Kept, but backed by Supabase email OTP | Prototype simulates it with a `display:block` toggle. |
| "১২টি" saved contacts / "৫টি সংরক্ষিত" | Real counts from `emergency_contacts` | Prototype used placeholder counts. |

# Nagar Shield — Design Tokens & Component Contract

> Generated from `prototype ui.html` by `tools/extract-design-tokens.cjs`.
> This file is the **port contract**: React Native implementation must match these values exactly.

---

## 1. Color tokens

### 1.1 Light theme (`:root`)

| Token | Value |
|---|---|
| `--violet-900` | `#3B1E91` |
| `--violet-800` | `#4C2BB5` |
| `--violet-700` | `#6D28D9` |
| `--violet-600` | `#7C3AED` |
| `--violet-300` | `#C4B5FD` |
| `--violet-200` | `#DDD6FE` |
| `--violet-100` | `#EDE9FE` |
| `--violet-50` | `#F5F3FF` |
| `--violet-25` | `#FAF8FF` |
| `--grad-primary-soft` | `linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)` |
| `--grad-hero` | `linear-gradient(135deg, #4C2BB5 0%, #7C3AED 50%, #A78BFA 100%)` |
| `--grad-emergency` | `linear-gradient(135deg, #E94B45 0%, #F87171 100%)` |
| `--blue-900` | `var(--violet-700)` |
| `--blue-700` | `var(--violet-600)` |
| `--blue-600` | `var(--violet-500)` |
| `--blue-500` | `var(--violet-500)` |
| `--blue-400` | `var(--violet-400)` |
| `--blue-300` | `var(--violet-300)` |
| `--blue-100` | `var(--violet-100)` |
| `--blue-50` | `var(--violet-50)` |
| `--purple-950` | `var(--violet-950)` |
| `--purple-900` | `var(--violet-700)` |
| `--purple-700` | `var(--violet-600)` |
| `--purple-600` | `var(--violet-500)` |
| `--purple-500` | `var(--violet-500)` |
| `--purple-400` | `var(--violet-400)` |
| `--purple-300` | `var(--violet-300)` |
| `--purple-100` | `var(--violet-100)` |
| `--purple-50` | `var(--violet-50)` |
| `--red-600` | `#DC2626` |
| `--red-500` | `#EF4444` |
| `--red-100` | `#FEE2E2` |
| `--red-50` | `#FEF2F2` |
| `--amber-600` | `#D97706` |
| `--amber-500` | `#F59E0B` |
| `--amber-100` | `#FEF3C7` |
| `--amber-50` | `#FFFBEB` |
| `--green-700` | `#047857` |
| `--green-600` | `#059669` |
| `--green-500` | `#10B981` |
| `--green-100` | `#D1FAE5` |
| `--green-50` | `#ECFDF5` |
| `--sky-600` | `#0284C7` |
| `--sky-100` | `#E0F2FE` |
| `--sky-50` | `#F0F9FF` |
| `--ink-900` | `#11112B` |
| `--ink-800` | `#1A1A2E` |
| `--ink-700` | `#2D2D44` |
| `--ink-600` | `#4A4A66` |
| `--ink-500` | `#6B6B85` |
| `--ink-400` | `#9090A8` |
| `--ink-300` | `#B8B8CC` |
| `--ink-200` | `#E2E2EE` |
| `--ink-100` | `#EFEFF5` |
| `--ink-50` | `#F7F7FB` |
| `--surface-white` | `#FFFFFF` |
| `--surface-lavender` | `#FAFAFE` |
| `--surface-card` | `#FFFFFF` |
| `--surface-outline` | `#E2E2EE` |
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)` |
| `--shadow-card` | `0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)` |
| `--shadow-lift` | `0 4px 8px rgba(15,23,42,0.06), 0 16px 32px rgba(15,23,42,0.10)` |
| `--shadow-fab` | `0 8px 16px rgba(124,58,237,0.28), 0 2px 6px rgba(15,23,42,0.08)` |
| `--shadow-glow` | `0 0 0 4px rgba(124,58,237,0.16), 0 8px 24px rgba(124,58,237,0.22)` |
| `--shadow-emergency` | `0 8px 16px rgba(220,38,38,0.28), 0 2px 6px rgba(15,23,42,0.08)` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--dur-fast` | `150ms` |
| `--dur-base` | `220ms` |
| `--dur-slow` | `360ms` |

### 1.2 Dark theme overrides (`:root[data-theme="dark"]`)

Dark is the **default** theme in the prototype (`restoreTheme()` sets `data-theme="dark"` on load).

| Token | Dark value | Light value |
|---|---|---|
| `--ink-950` | `#F5F5FA` | `(not defined in :root)` |
| `--ink-900` | `#E2E2EE` | `#11112B` |
| `--ink-800` | `#C4C4D6` | `#1A1A2E` |
| `--ink-700` | `#B8B8CC` | `#2D2D44` |
| `--ink-600` | `#9090A8` | `#4A4A66` |
| `--ink-500` | `#6B6B85` | `#6B6B85` |
| `--ink-400` | `#4A4A66` | `#9090A8` |
| `--ink-300` | `#2D2D44` | `#B8B8CC` |
| `--ink-200` | `#1A1A2E` | `#E2E2EE` |
| `--ink-100` | `#11112B` | `#EFEFF5` |
| `--ink-50` | `#0B0B1A` | `#F7F7FB` |
| `--surface-white` | `#11112B` | `#FFFFFF` |
| `--surface-lavender` | `#0B0B1A` | `#FAFAFE` |
| `--surface-card` | `#1A1A2E` | `#FFFFFF` |
| `--surface-outline` | `#3A3A52` | `#E2E2EE` |

### 1.3 Legacy alias resolution

`--blue-*` and `--purple-*` are back-compat aliases that resolve onto the violet ramp.
They are **not** re-declared in the dark theme, so they keep their light violet values in dark mode.

| Alias | Resolves to | Effective hex | Dark theme |
|---|---|---|---|
| `--blue-900` | `--violet-700` | `#6D28D9` | not overridden |
| `--blue-700` | `--violet-600` | `#7C3AED` | not overridden |
| `--blue-600` | `--violet-500` | `--violet-500` | not overridden |
| `--blue-500` | `--violet-500` | `--violet-500` | not overridden |
| `--blue-400` | `--violet-400` | `--violet-400` | not overridden |
| `--blue-300` | `--violet-300` | `#C4B5FD` | not overridden |
| `--blue-100` | `--violet-100` | `#EDE9FE` | not overridden |
| `--blue-50` | `--violet-50` | `#F5F3FF` | not overridden |
| `--purple-950` | `--violet-950` | `--violet-950` | not overridden |
| `--purple-900` | `--violet-700` | `#6D28D9` | not overridden |
| `--purple-700` | `--violet-600` | `#7C3AED` | not overridden |
| `--purple-600` | `--violet-500` | `--violet-500` | not overridden |
| `--purple-500` | `--violet-500` | `--violet-500` | not overridden |
| `--purple-400` | `--violet-400` | `--violet-400` | not overridden |
| `--purple-300` | `--violet-300` | `#C4B5FD` | not overridden |
| `--purple-100` | `--violet-100` | `#EDE9FE` | not overridden |
| `--purple-50` | `--violet-50` | `#F5F3FF` | not overridden |

### 1.4 Static colours

The ramps above invert between the light and the dark theme. A small number of
colours **do not**: they sit on top of a saturated surface — a violet primary
button, a red danger button, a live map pin — and they have to stay white in
both themes, because the surface under them does not change.

The React Native theme keeps these in `staticColors`, outside the themed
ramps, for exactly this reason. The web console keeps them in a CSS custom
property of the same name.

| Token | Value | React Native |
|---|---|---|
| `--static-white` | `#FFFFFF` | `staticColors.white` |

A surface colour is **not** the right token for this. `--surface-white` is
`#11112B` in the dark theme, which would put near-black text on a violet
button.

### 1.5 Console layout constants

The moderator console is a **desktop** surface and it has three measurements
the mobile app has no use for. They are the console's own layout constants,
not design tokens — they are listed here so that the console's CSS holds
nothing outside this document, which is the whole point of the contract.

| Token | Value | Meaning |
|---|---|---|
| `--tap-target` | `48px` | The minimum height of an interactive control |
| `--rail-width` | `232px` | The width of the sidebar |
| `--page-max` | `1440px` | The maximum width of the content frame |

`--tap-target` is the one that is not a free choice: it is the same 48 dp the
mobile theme declares as `MIN_TAP_TARGET`, so the two surfaces cannot drift
apart on the one number that is a usability requirement rather than a style
decision.

---

## 2. Radius, shadow, motion

### Radius

| Token | Value |
|---|---|
| `--r-sm` | `10px` |
| `--r-md` | `14px` |
| `--r-lg` | `18px` |
| `--r-xl` | `22px` |
| `--r-2xl` | `28px` |
| `--r-pill` | `999px` |

### Shadow

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)` |
| `--shadow-card` | `0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)` |
| `--shadow-lift` | `0 4px 8px rgba(15,23,42,0.06), 0 16px 32px rgba(15,23,42,0.10)` |
| `--shadow-fab` | `0 8px 16px rgba(124,58,237,0.28), 0 2px 6px rgba(15,23,42,0.08)` |
| `--shadow-glow` | `0 0 0 4px rgba(124,58,237,0.16), 0 8px 24px rgba(124,58,237,0.22)` |
| `--shadow-emergency` | `0 8px 16px rgba(220,38,38,0.28), 0 2px 6px rgba(15,23,42,0.08)` |

### Easing

| Token | Value |
|---|---|
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

### Duration

| Token | Value |
|---|---|
| `--dur-fast` | `150ms` |
| `--dur-base` | `220ms` |
| `--dur-slow` | `360ms` |

### Gradient

| Token | Value |
|---|---|
| `--grad-primary-soft` | `linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)` |
| `--grad-hero` | `linear-gradient(135deg, #4C2BB5 0%, #7C3AED 50%, #A78BFA 100%)` |
| `--grad-emergency` | `linear-gradient(135deg, #E94B45 0%, #F87171 100%)` |

---

## 3. Component inventory

Each entry lists the class, its declared box model / typography / color, and any pseudo-element rules.

#### `/* ===== Dark theme override =====
   :root above is the light palette. Dark is the default per DESIGN.md for
   panic-moment low-light legibility. When <html data-theme="dark"> (the
   default applied by restoreTheme() on load), these overrides flip ink +
   surface tokens. Every component auto-adapts because they read tokens. */
:root[data-theme="dark"]`

```css
/* ===== Dark theme override =====
   :root above is the light palette. Dark is the default per DESIGN.md for
   panic-moment low-light legibility. When <html data-theme="dark"> (the
   default applied by restoreTheme() on load), these overrides flip ink +
   surface tokens. Every component auto-adapts because they read tokens. */
:root[data-theme="dark"] {
  --ink-950: #F5F5FA;
  --ink-900: #E2E2EE;
  --ink-800: #C4C4D6;
  --ink-700: #B8B8CC;
  --ink-600: #9090A8;
  --ink-500: #6B6B85;
  --ink-400: #4A4A66;
  --ink-300: #2D2D44;
  --ink-200: #1A1A2E;
  --ink-100: #11112B;
  --ink-50: #0B0B1A;
  --surface-white: #11112B;
  --surface-lavender: #0B0B1A;
  --surface-card: #1A1A2E;
  --surface-outline: #3A3A52;
  /* ~3: 1 on dark surface — visible input borders */
  --app-bar-bg:       rgba(11,11,26,0.86);
  color-scheme: dark;
}
```

#### `*`

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
```

#### `*`

```css
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

#### `html, body`

```css
html, body {
  min-height: 100%;
}
```

#### `body`

```css
body {
  font-family: 'Inter', 'Noto Sans Bengali', 'Roboto', sans-serif;
  background: radial-gradient(1200px 600px at 10% -10%, rgba(167,139,250,0.18), transparent 60%),
    radial-gradient(900px 500px at 100% 110%, rgba(124,58,237,0.10), transparent 60%),
    #F7F7FB;
  color: var(--ink-950);
  font-feature-settings: "ss01", "cv11";
  letter-spacing: -0.005em;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 16px;
  overflow: hidden;
}
```

#### `/* ===== Browser Frame ===== */
.app-container`

```css
/* ===== Browser Frame ===== */
.app-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 32px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}
```

#### `.prototype-header`

```css
.prototype-header {
  text-align: center;
  color: var(--ink-950);
  max-width: 800px;
  margin-bottom: 14px;
}
```

#### `.prototype-header h1`

```css
.prototype-header h1 {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 4px;
  letter-spacing: -0.6px;
  background: var(--grad-hero);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}
```

#### `.prototype-header p`

```css
.prototype-header p {
  color: var(--ink-500);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.005em;
}
```

#### `/* ===== Phone Stage =====
   A wrapper that holds the phone and shrinks to match the
   scaled phone's visual size. The phone itself is scaled with
   transform: scale() (so all internal pixel-perfect design stays
   intact at any size), and the stage uses negative margins to
   collapse to the painted footprint — so the phone truly fits
   the viewport instead of overflowing it. */
.phone-stage`

```css
/* ===== Phone Stage =====
   A wrapper that holds the phone and shrinks to match the
   scaled phone's visual size. The phone itself is scaled with
   transform: scale() (so all internal pixel-perfect design stays
   intact at any size), and the stage uses negative margins to
   collapse to the painted footprint — so the phone truly fits
   the viewport instead of overflowing it. */
.phone-stage {
  width: calc(390px * var(--phone-scale, 1));
  height: calc(844px * var(--phone-scale, 1));
  position: relative;
  flex-shrink: 0;
}
```

#### `.phone-frame`

```css
.phone-frame {
  width: 390px;
  height: 844px;
  background: var(--surface-white);
  border-radius: 50px;
  box-shadow: 0 50px 100px rgba(0,0,0,0.4), 0 0 0 12px #1a1a2e, 0 0 0 14px #2d2d44;
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  transform: scale(var(--phone-scale, 1));
  transform-origin: top left;
}
```

#### `.phone-screen`

```css
.phone-screen {
  position: absolute;
  inset: 12px;
  background: var(--surface-lavender);
  border-radius: 38px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

#### `/* iOS Status bar (faked) */
.ios-status`

```css
/* iOS Status bar (faked) */
.ios-status {
  height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-950);
  background: transparent;
  flex-shrink: 0;
  letter-spacing: -0.01em;
}
```

#### `.ios-status .right`

```css
.ios-status .right {
  display: flex;
  gap: 6px;
  align-items: center;
}
```

#### `.ios-notch`

```css
.ios-notch {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 122px;
  height: 32px;
  background: #0B0B1A;
  border-radius: var(--r-pill);
  z-index: 100;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
}
```

#### `/* ===== Screen wrapper ===== */
.screen`

```css
/* ===== Screen wrapper ===== */
.screen {
  position: absolute;
  inset: 0;
  background: var(--surface-lavender);
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateX(40px) scale(0.98);
  transition: opacity var(--dur-slow) var(--ease-out),
              transform var(--dur-slow) var(--ease-out);
  pointer-events: none;
  overflow-y: auto;
  overflow-x: hidden;
}
```

#### `.screen::-webkit-scrollbar`

```css
.screen::-webkit-scrollbar {
  display: none;
}
```

#### `.screen.active`

```css
.screen.active {
  opacity: 1;
  transform: translateX(0) scale(1);
  pointer-events: auto;
}
```

#### `.screen.exit-left`

```css
.screen.exit-left {
  opacity: 0;
  transform: translateX(-40px) scale(0.98);
}
```

#### `/* Content area */
.content`

```css
/* Content area */
.content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 100px;
}
```

#### `.content::-webkit-scrollbar`

```css
.content::-webkit-scrollbar {
  display: none;
}
```

#### `/* ===== Top App Bar ===== */
.app-bar`

```css
/* ===== Top App Bar ===== */
.app-bar {
  background: var(--app-bar-bg);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  padding: 10px 16px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  border-bottom: 1px solid var(--ink-100);
}
```

#### `.app-bar-no-border`

```css
.app-bar-no-border {
  border-bottom: none;
  background: transparent;
  backdrop-filter: none;
}
```

#### `.app-bar-title`

```css
.app-bar-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink-950);
  letter-spacing: -0.01em;
}
```

#### `.back-btn`

```css
.back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  background: transparent;
  cursor: pointer;
  color: var(--violet-700);
  transition: background var(--dur-fast) var(--ease-out);
}
```

#### `.back-btn:hover`

```css
.back-btn:hover {
  background: var(--violet-50);
}
```

#### `.icon-btn`

```css
.icon-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  background: transparent;
  cursor: pointer;
  color: var(--ink-700);
  transition: background var(--dur-fast) var(--ease-out);
  position: relative;
}
```

#### `.icon-btn:hover`

```css
.icon-btn:hover {
  background: var(--ink-50);
}
```

#### `.badge-dot`

```css
.badge-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  background: var(--red-500);
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 0 rgba(239,68,68,0.4);
  animation: pulse-red 2s infinite;
}
```

#### `.badge-count`

```css
.badge-count {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--red-500);
  color: white;
  font-size: 10px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  border: 2px solid white;
  font-feature-settings: "tnum";
}
```

#### `/* ===== Material Symbols (Sharp/Thin, Modern App style) ===== */
.material-symbols-outlined,
.material-symbols-rounded`

```css
/* ===== Material Symbols (Sharp/Thin, Modern App style) ===== */
.material-symbols-outlined,
.material-symbols-rounded {
  font-family: 'Material Symbols Rounded';
  font-weight: 400;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  font-variation-settings: "opsz" 24, "wght" 400, "FILL" 0, "GRAD" 0;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

#### `/* Helper class to fill an icon (active nav, FAB, primary chips) */
.material-symbols-filled,
.material-symbols-filled.material-symbols-outlined,
.material-symbols-filled.material-symbols-rounded`

```css
/* Helper class to fill an icon (active nav, FAB, primary chips) */
.material-symbols-filled,
.material-symbols-filled.material-symbols-outlined,
.material-symbols-filled.material-symbols-rounded {
  font-variation-settings: "opsz" 24, "wght" 500, "FILL" 1, "GRAD" 0;
}
```

#### `/* Slightly heavier weight for icons in dense UI rows */
.material-symbols-bold`

```css
/* Slightly heavier weight for icons in dense UI rows */
.material-symbols-bold {
  font-variation-settings: "opsz" 24, "wght" 600, "FILL" 0, "GRAD" 0;
}
```

#### `/* ===== Splash Screen ===== */
.splash`

```css
/* ===== Splash Screen ===== */
.splash {
  background: var(--grad-hero);
  justify-content: center;
  align-items: center;
  text-align: center;
  color: white;
}
```

#### `.splash-logo`

```css
.splash-logo {
  width: 120px;
  height: 120px;
  margin: 0 auto 32px;
  background: rgba(255,255,255,0.10);
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.20);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 32px rgba(0,0,0,0.20);
  animation: pulse-glow 3.5s ease-in-out infinite;
}
```

#### `.splash-tagline`

```css
.splash-tagline {
  font-size: 18px;
  font-weight: 500;
  color: rgba(255,255,255,0.95);
  letter-spacing: 0.5px;
  margin-bottom: 80px;
}
```

#### `.loading-dots`

```css
.loading-dots {
  display: flex;
  gap: 8px;
}
```

#### `.loading-dots span`

```css
.loading-dots span {
  width: 8px;
  height: 8px;
  background: rgba(255,255,255,0.6);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}
```

#### `.loading-dots span:nth-child(2)`

```css
.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
```

#### `.loading-dots span:nth-child(3)`

```css
.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}
```

#### `/* ===== Login & Registration ===== */
.auth-screen`

```css
/* ===== Login & Registration ===== */
.auth-screen {
  padding: 0 24px;
  padding-top: 0;
}
```

#### `.auth-top`

```css
.auth-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 0;
  margin-bottom: 40px;
}
```

#### `.auth-brand`

```css
.auth-brand {
  font-size: 14px;
  font-weight: 700;
  color: var(--purple-700);
  letter-spacing: -0.3px;
}
```

#### `.auth-hero`

```css
.auth-hero {
  text-align: center;
  margin-bottom: 32px;
}
```

#### `.auth-hero h1`

```css
.auth-hero h1 {
  font-size: 28px;
  font-weight: 800;
  color: var(--ink-950);
  margin-bottom: 8px;
  letter-spacing: -0.6px;
  line-height: 1.15;
}
```

#### `.auth-hero p`

```css
.auth-hero p {
  font-size: 14px;
  color: var(--ink-600);
  line-height: 1.5;
  font-weight: 500;
}
```

#### `.brand-display`

```css
.brand-display {
  text-align: center;
  margin-bottom: 24px;
}
```

#### `.brand-display-logo`

```css
.brand-display-logo {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
  border-radius: var(--r-xl);
  background: var(--grad-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 28px rgba(124,58,237,0.32),
              0 2px 6px rgba(15,23,42,0.08);
  position: relative;
}
```

#### `.brand-display-logo::after`

```css
.brand-display-logo::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.18), transparent 50%);
  pointer-events: none;
}
```

#### `.brand-display-name`

```css
.brand-display-name {
  font-size: 22px;
  font-weight: 800;
  color: var(--ink-950);
  letter-spacing: -0.5px;
}
```

#### `.brand-display-tag`

```css
.brand-display-tag {
  font-size: 12px;
  color: var(--ink-500);
  margin-top: 4px;
}
```

#### `/* ===== Inputs (modern: filled, soft, focus ring) ===== */
.input-group`

```css
/* ===== Inputs (modern: filled, soft, focus ring) ===== */
.input-group {
  margin-bottom: 16px;
}
```

#### `.input-field`

```css
.input-field {
  position: relative;
  margin-bottom: 4px;
}
```

#### `.input-label`

```css
.input-label {
  position: absolute;
  top: 18px;
  left: 16px;
  font-size: 15px;
  color: var(--ink-500);
  pointer-events: none;
  transition: all var(--dur-base) var(--ease-out);
  background: transparent;
  padding: 0 4px;
}
```

#### `.input-field input`

```css
.input-field input {
  width: 100%;
  height: 56px;
  padding: 20px 16px 8px;
  border: 1.5px solid var(--surface-outline);
  border-radius: var(--r-lg);
  background: var(--surface-white);
  font-family: inherit;
  font-size: 15px;
  color: var(--ink-950);
  outline: none;
  transition: all var(--dur-base) var(--ease-out);
  box-shadow: var(--shadow-xs);
}
```

#### `.input-field input:hover`

```css
.input-field input:hover {
  border-color: var(--ink-300);
}
```

#### `.input-field input:focus`

```css
.input-field input:focus {
  border-color: var(--violet-500);
  box-shadow: var(--shadow-glow);
}
```

#### `/* Global focus-visible ring for keyboard users (a11y: H3-class). */
:focus-visible`

```css
/* Global focus-visible ring for keyboard users (a11y: H3-class). */
:focus-visible {
  outline: 3px solid var(--violet-500);
  outline-offset: 2px;
  border-radius: 6px;
}
```

#### `/* Reduced-motion: kill decorative animations. Keeps transform/colour
   transitions intact (functional feedback) but stops pulses/bounces. */
@media (prefers-reduced-motion: reduce)`

```css
/* Reduced-motion: kill decorative animations. Keeps transform/colour
   transitions intact (functional feedback) but stops pulses/bounces. */
@media (prefers-reduced-motion: reduce) {
  *, *: :before, *::after {
    animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  }: ;
}
```

#### `.input-field input:focus + .input-label,
.input-field input:not(:placeholder-shown) + .input-label`

```css
.input-field input:focus + .input-label,
.input-field input:not(:placeholder-shown) + .input-label {
  top: 10px;
  font-size: 11px;
  color: var(--violet-700);
  font-weight: 600;
  background: var(--surface-white);
}
```

#### `.input-with-icon input`

```css
.input-with-icon input {
  padding-left: 48px;
}
```

#### `.input-with-icon .leading-icon`

```css
.input-with-icon .leading-icon {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
  color: var(--ink-500);
  font-size: 20px;
}
```

#### `.input-with-icon .trailing-icon`

```css
.input-with-icon .trailing-icon {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  color: var(--ink-500);
  font-size: 20px;
  cursor: pointer;
}
```

#### `.input-helper`

```css
.input-helper {
  font-size: 12px;
  color: var(--ink-500);
  margin-top: 6px;
  padding-left: 4px;
}
```

#### `/* .password-strength CSS removed 2026-09-11: OTP-only auth model has
   no password fields. CSS retained only if password login is re-introduced. */

/* Checkbox custom (modern) */
.check-row`

```css
/* .password-strength CSS removed 2026-09-11: OTP-only auth model has
   no password fields. CSS retained only if password login is re-introduced. */

/* Checkbox custom (modern) */
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
```

#### `.custom-checkbox`

```css
.custom-checkbox {
  width: 22px;
  height: 22px;
  border: 1.5px solid var(--ink-300);
  border-radius: var(--r-xs);
  background: var(--surface-white);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}
```

#### `.custom-checkbox:hover`

```css
.custom-checkbox:hover {
  border-color: var(--violet-400);
}
```

#### `.custom-checkbox.checked`

```css
.custom-checkbox.checked {
  background: var(--violet-600);
  border-color: var(--violet-600);
}
```

#### `.custom-checkbox.checked::after`

```css
.custom-checkbox.checked::after {
  content: '';
  width: 6px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-1px, -1px);
}
```

#### `.check-label`

```css
.check-label {
  font-size: 14px;
  color: var(--ink-700);
  font-weight: 500;
}
```

#### `/* ===== Buttons (modern: gradient primary, soft shadow, press animation) ===== */
.btn`

```css
/* ===== Buttons (modern: gradient primary, soft shadow, press animation) ===== */
.btn {
  width: 100%;
  height: 52px;
  border-radius: var(--r-lg);
  border: none;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              background var(--dur-base) var(--ease-out),
              filter var(--dur-base) var(--ease-out);
  letter-spacing: -0.01em;
  position: relative;
  overflow: hidden;
}
```

#### `.btn::after`

```css
.btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.16), transparent 40%);
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
  pointer-events: none;
}
```

#### `.btn:hover::after`

```css
.btn:hover::after {
  opacity: 1;
}
```

#### `.btn:active`

```css
.btn:active {
  transform: scale(0.98);
}
```

#### `.btn-primary`

```css
.btn-primary {
  background: var(--grad-primary);
  color: white;
  box-shadow: var(--shadow-fab);
}
```

#### `.btn-primary:hover`

```css
.btn-primary:hover {
  filter: brightness(1.05);
  box-shadow: 0 12px 28px rgba(124,58,237,0.36), 0 4px 8px rgba(15,23,42,0.10);
  transform: translateY(-1px);
}
```

#### `.btn-emergency`

```css
.btn-emergency {
  background: var(--grad-emergency);
  color: white;
  box-shadow: var(--shadow-emergency);
}
```

#### `.btn-lg`

```css
.btn-lg {
  height: 56px;
  font-size: 16px;
  border-radius: var(--r-xl);
}
```

#### `.btn-secondary`

```css
.btn-secondary {
  background: var(--surface-white);
  color: var(--violet-700);
  border: 1.5px solid var(--ink-200);
  box-shadow: var(--shadow-xs);
}
```

#### `.btn-secondary:hover`

```css
.btn-secondary:hover {
  background: var(--violet-50);
  border-color: var(--violet-300);
}
```

#### `.btn-ghost`

```css
.btn-ghost {
  background: transparent;
  color: var(--violet-700);
  font-weight: 600;
}
```

#### `.btn-ghost:hover`

```css
.btn-ghost:hover {
  background: var(--violet-50);
}
```

#### `.divider-or`

```css
.divider-or {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0;
}
```

#### `.divider-or::before, .divider-or::after`

```css
.divider-or::before, .divider-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ink-100);
}
```

#### `.divider-or span`

```css
.divider-or span {
  font-size: 12px;
  color: var(--ink-500);
}
```

#### `.text-link`

```css
.text-link {
  color: var(--purple-500);
  font-weight: 600;
  cursor: pointer;
}
```

#### `.text-link:hover`

```css
.text-link:hover {
  text-decoration: underline;
}
```

#### `.text-center`

```css
.text-center {
  text-align: center;
}
```

#### `.mt-24`

```css
.mt-24 {
  margin-top: 24px;
}
```

#### `.mt-16`

```css
.mt-16 {
  margin-top: 16px;
}
```

#### `/* ===== Safety Profile Wizard ===== */
.wizard-screen`

```css
/* ===== Safety Profile Wizard ===== */
.wizard-screen {
  background: linear-gradient(180deg, #FFFFFF 0%, var(--surface-lavender) 70%);
}
```

#### `.wizard-progress`

```css
.wizard-progress {
  display: flex;
  gap: 6px;
  padding: 14px 24px 0;
}
```

#### `.wizard-progress .seg`

```css
.wizard-progress .seg {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--ink-200);
  transition: background var(--dur-base) var(--ease-out);
}
```

#### `.wizard-progress .seg.done`

```css
.wizard-progress .seg.done {
  background: var(--violet-600);
}
```

#### `.wizard-progress .seg.active`

```css
.wizard-progress .seg.active {
  background: var(--violet-400);
}
```

#### `.wizard-step-label`

```css
.wizard-step-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-500);
}
```

#### `.wizard-step-label .step-count`

```css
.wizard-step-label .step-count {
  color: var(--violet-700);
}
```

#### `.wizard-eyebrow`

```css
.wizard-eyebrow {
  padding: 28px 24px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--violet-700);
  display: flex;
  align-items: center;
  gap: 8px;
}
```

#### `.wizard-eyebrow .dot`

```css
.wizard-eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--violet-600);
}
```

#### `.wizard-hero`

```css
.wizard-hero {
  padding: 0 24px 18px;
}
```

#### `.wizard-hero h1`

```css
.wizard-hero h1 {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--ink-950);
  margin-bottom: 8px;
}
```

#### `.wizard-hero h1 em`

```css
.wizard-hero h1 em {
  font-style: normal;
  color: var(--violet-700);
}
```

#### `.wizard-hero p`

```css
.wizard-hero p {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink-600);
}
```

#### `.wizard-body`

```css
.wizard-body {
  padding: 8px 24px 24px;
  flex: 1;
  overflow-y: auto;
}
```

#### `.wizard-sticky`

```css
.wizard-sticky {
  padding: 12px 24px 22px;
  background: linear-gradient(180deg, transparent, var(--surface-lavender) 35%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

#### `.wizard-sticky .btn`

```css
.wizard-sticky .btn {
  width: 100%;
}
```

#### `.wizard-sticky .escape`

```css
.wizard-sticky .escape {
  text-align: center;
  font-size: 13px;
  color: var(--ink-500);
  cursor: pointer;
}
```

#### `.wizard-sticky .escape:hover`

```css
.wizard-sticky .escape:hover {
  color: var(--violet-700);
  text-decoration: underline;
}
```

#### `.chip-grid`

```css
.chip-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 6px;
}
```

#### `.chip-grid .chip`

```css
.chip-grid .chip {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-lg);
  background: var(--surface-white);
  border: 1.5px solid var(--ink-200);
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-900);
  cursor: pointer;
  transition: all var(--dur-base) var(--ease-out);
}
```

#### `.chip-grid .chip:hover`

```css
.chip-grid .chip:hover {
  border-color: var(--violet-400);
  background: var(--violet-50);
}
```

#### `.chip-grid .chip.selected`

```css
.chip-grid .chip.selected {
  background: var(--grad-primary);
  color: white;
  border-color: transparent;
  box-shadow: var(--shadow-glow);
}
```

#### `.blood-group-grid`

```css
.blood-group-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
```

#### `.blood-group-grid .chip.selected`

```css
.blood-group-grid .chip.selected {
  background: var(--grad-primary);
  color: white;
}
```

#### `.contact-slot-list`

```css
.contact-slot-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
```

#### `.contact-slot`

```css
.contact-slot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--r-lg);
  background: var(--surface-white);
  border: 1.5px solid var(--ink-200);
  cursor: pointer;
  transition: all var(--dur-base) var(--ease-out);
}
```

#### `.contact-slot:hover`

```css
.contact-slot:hover {
  border-color: var(--violet-400);
  background: var(--violet-50);
}
```

#### `.contact-slot.filled`

```css
.contact-slot.filled {
  border-color: var(--green-500);
  background: var(--green-50);
}
```

#### `.contact-slot .slot-num`

```css
.contact-slot .slot-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--violet-100);
  color: var(--violet-700);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
```

#### `.contact-slot.filled .slot-num`

```css
.contact-slot.filled .slot-num {
  background: var(--green-500);
  color: white;
}
```

#### `.contact-slot .slot-text`

```css
.contact-slot .slot-text {
  flex: 1;
  min-width: 0;
}
```

#### `.contact-slot .slot-title`

```css
.contact-slot .slot-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-900);
}
```

#### `.contact-slot .slot-sub`

```css
.contact-slot .slot-sub {
  font-size: 12px;
  color: var(--ink-500);
}
```

#### `.contact-slot .slot-trailing`

```css
.contact-slot .slot-trailing {
  color: var(--ink-400);
}
```

#### `.location-illustration`

```css
.location-illustration {
  margin: 12px 24px 4px;
  height: 160px;
  border-radius: var(--r-2xl);
  background: radial-gradient(circle at 50% 60%, rgba(124,58,237,0.16), transparent 70%),
    linear-gradient(180deg, var(--violet-50), #FFFFFF);
  border: 1px solid var(--ink-200);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
```

#### `.location-illustration .pin`

```css
.location-illustration .pin {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--grad-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: var(--shadow-glow);
}
```

#### `.location-illustration .ring`

```css
.location-illustration .ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid var(--violet-300);
  animation: ring-pulse 2.4s var(--ease-out) infinite;
  opacity: 0.6;
}
```

#### `.location-illustration .ring.r1`

```css
.location-illustration .ring.r1 {
  width: 120px;
  height: 120px;
}
```

#### `.location-illustration .ring.r2`

```css
.location-illustration .ring.r2 {
  width: 200px;
  height: 200px;
  animation-delay: 0.8s;
}
```

#### `.location-reassure`

```css
.location-reassure {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 16px 24px 0;
  padding: 14px;
  border-radius: var(--r-lg);
  background: var(--violet-50);
  border: 1px solid var(--violet-200);
}
```

#### `.location-reassure .icon`

```css
.location-reassure .icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--violet-600);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

#### `.location-reassure .text`

```css
.location-reassure .text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-700);
}
```

#### `.location-reassure .text strong`

```css
.location-reassure .text strong {
  color: var(--violet-800);
}
```

#### `/* Welcome / Done — centered */
.wizard-center`

```css
/* Welcome / Done — centered */
.wizard-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 24px;
}
```

#### `.wizard-center .badge`

```css
.wizard-center .badge {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: var(--grad-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: var(--shadow-glow);
  margin-bottom: 18px;
}
```

#### `.wizard-center h1`

```css
.wizard-center h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink-950);
  margin-bottom: 10px;
}
```

#### `.wizard-center h1 em`

```css
.wizard-center h1 em {
  font-style: normal;
  color: var(--violet-700);
}
```

#### `.wizard-center p`

```css
.wizard-center p {
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-600);
  max-width: 32ch;
  margin-bottom: 18px;
}
```

#### `.summary-card`

```css
.summary-card {
  margin: 8px 24px 0;
  padding: 16px;
  border-radius: var(--r-lg);
  background: var(--surface-white);
  border: 1px solid var(--ink-200);
  text-align: left;
}
```

#### `.summary-row`

```css
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--ink-100);
  font-size: 13px;
}
```

#### `.summary-row:last-child`

```css
.summary-row:last-child {
  border-bottom: 0;
}
```

#### `.summary-row .label`

```css
.summary-row .label {
  color: var(--ink-500);
  font-weight: 500;
}
```

#### `.summary-row .value`

```css
.summary-row .value {
  color: var(--ink-950);
  font-weight: 700;
}
```

#### `/* Lock screen (S-99) */
.lock-screen`

```css
/* Lock screen (S-99) */
.lock-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 24px;
  background: linear-gradient(180deg, #FFFFFF 0%, var(--violet-25) 100%);
}
```

#### `.lock-screen .badge`

```css
.lock-screen .badge {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: var(--violet-100);
  color: var(--violet-700);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}
```

#### `.lock-screen h1`

```css
.lock-screen h1 {
  font-size: 22px;
  font-weight: 800;
  color: var(--ink-950);
  margin-bottom: 8px;
}
```

#### `.lock-screen p`

```css
.lock-screen p {
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-600);
  max-width: 32ch;
  margin-bottom: 22px;
}
```

#### `.lock-screen .btn`

```css
.lock-screen .btn {
  width: 100%;
  max-width: 320px;
}
```

#### `/* ===== Home Screen ===== */
.greeting-block`

```css
/* ===== Home Screen ===== */
.greeting-block {
  flex: 1;
}
```

#### `.greeting-block .hi`

```css
.greeting-block .hi {
  font-size: 18px;
  font-weight: 600;
  color: var(--ink-950);
  margin-bottom: 2px;
}
```

#### `.greeting-block .date`

```css
.greeting-block .date {
  font-size: 12px;
  color: var(--ink-500);
}
```

#### `.avatar-sm`

```css
.avatar-sm {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--grad-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 14px;
  border: 2.5px solid var(--surface-white);
  box-shadow: var(--shadow-card);
  letter-spacing: -0.02em;
}
```

#### `/* Search bar (modern: filled, soft) */
.search-bar`

```css
/* Search bar (modern: filled, soft) */
.search-bar {
  margin: 0 20px 16px;
  height: 48px;
  background: var(--ink-50);
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 10px;
  transition: all var(--dur-base) var(--ease-out);
}
```

#### `.search-bar:focus-within`

```css
.search-bar:focus-within {
  background: var(--surface-white);
  border-color: var(--violet-300);
  box-shadow: var(--shadow-glow);
}
```

#### `.search-bar input`

```css
.search-bar input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 14.5px;
  color: var(--ink-950);
  font-weight: 500;
}
```

#### `.search-bar input::placeholder`

```css
.search-bar input::placeholder {
  color: var(--ink-500);
  font-weight: 400;
}
```

#### `.search-bar .material-symbols-rounded`

```css
.search-bar .material-symbols-rounded {
  color: var(--ink-500);
  font-size: 20px;
}
```

#### `/* Section title */
.section-title`

```css
/* Section title */
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  margin: 16px 0 12px;
}
```

#### `.section-title h3`

```css
.section-title h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-950);
  letter-spacing: -0.01em;
}
```

#### `.section-title a`

```css
.section-title a {
  font-size: 13px;
  color: var(--violet-700);
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  transition: gap var(--dur-fast) var(--ease-out);
}
```

#### `.section-title a:hover`

```css
.section-title a:hover {
  gap: 6px;
}
```

#### `/* Quick action grid (modern: cleaner cards, gradient icon backgrounds) */
.quick-actions`

```css
/* Quick action grid (modern: cleaner cards, gradient icon backgrounds) */
.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  padding: 0 20px;
}
```

#### `.action-card`

```css
.action-card {
  background: var(--surface-white);
  border: 1px solid var(--ink-100);
  border-radius: var(--r-xl);
  padding: 16px 8px 12px;
  text-align: center;
  cursor: pointer;
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out);
  position: relative;
}
```

#### `.action-card:hover`

```css
.action-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lift);
  border-color: transparent;
}
```

#### `.action-card:active`

```css
.action-card:active {
  transform: translateY(0);
}
```

#### `.action-card-icon`

```css
.action-card-icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 10px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--dur-base) var(--ease-spring);
}
```

#### `.action-card:hover .action-card-icon`

```css
.action-card:hover .action-card-icon {
  transform: scale(1.06);
}
```

#### `.action-card-icon.purple`

```css
.action-card-icon.purple {
  background: var(--violet-100);
  color: var(--violet-700);
}
```

#### `.action-card-icon.red`

```css
.action-card-icon.red {
  background: var(--red-100);
  color: var(--red-600);
}
```

#### `.action-card-icon.green`

```css
.action-card-icon.green {
  background: var(--green-100);
  color: var(--green-700);
}
```

#### `.action-card-icon.amber`

```css
.action-card-icon.amber {
  background: var(--amber-100);
  color: var(--amber-600);
}
```

#### `.action-card-icon.sky`

```css
.action-card-icon.sky {
  background: var(--sky-100);
  color: var(--sky-600);
}
```

#### `.action-card-icon .material-symbols-rounded`

```css
.action-card-icon .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: "FILL" 1;
}
```

#### `.action-card-label`

```css
.action-card-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-950);
  margin-bottom: 2px;
  letter-spacing: -0.01em;
}
```

#### `.action-card-sub`

```css
.action-card-sub {
  font-size: 10.5px;
  color: var(--ink-500);
  font-weight: 500;
}
```

#### `.action-card.alert`

```css
.action-card.alert {
  position: relative;
}
```

#### `.action-card.alert::after`

```css
.action-card.alert::after {
  content: '';
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  background: var(--red-500);
  border-radius: 50%;
  animation: pulse-red 2s infinite;
  box-shadow: 0 0 0 3px rgba(239,68,68,0.18);
}
```

#### `/* Crime news carousel */
.news-scroll`

```css
/* Crime news carousel */
.news-scroll {
  display: flex;
  gap: 12px;
  padding: 0 20px;
  overflow-x: auto;
  scrollbar-width: none;
}
```

#### `.news-scroll::-webkit-scrollbar`

```css
.news-scroll::-webkit-scrollbar {
  display: none;
}
```

#### `.news-card`

```css
.news-card {
  flex: 0 0 220px;
  background: var(--surface-white);
  border-radius: var(--r-xl);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
```

#### `.news-card:hover`

```css
.news-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lift);
}
```

#### `.news-card-img`

```css
.news-card-img {
  height: 90px;
  background: var(--grad-hero);
  position: relative;
  overflow: hidden;
}
```

#### `.news-card-img::after`

```css
.news-card-img::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(255,255,255,0.05) 10px,
    rgba(255,255,255,0.05) 20px
  );
}
```

#### `.news-card-body`

```css
.news-card-body {
  padding: 12px;
}
```

#### `.news-card-title`

```css
.news-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-950);
  margin-bottom: 6px;
  line-height: 1.35;
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

#### `.news-card-meta`

```css
.news-card-meta {
  font-size: 11px;
  color: var(--ink-500);
  font-weight: 500;
}
```

#### `/* Activity ticker */
.activity-ticker`

```css
/* Activity ticker */
.activity-ticker {
  margin: 16px 20px;
  padding: 14px 16px;
  background: var(--surface-white);
  border-radius: var(--r-lg);
  border: 1px solid var(--ink-100);
  box-shadow: var(--shadow-xs);
}
```

#### `.ticker-item`

```css
.ticker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 12.5px;
  color: var(--ink-700);
  font-weight: 500;
}
```

#### `.ticker-dot`

```css
.ticker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

#### `.ticker-dot.red`

```css
.ticker-dot.red {
  background: var(--red-500);
}
```

#### `.ticker-dot.green`

```css
.ticker-dot.green {
  background: var(--green-500);
}
```

#### `.ticker-dot.amber`

```css
.ticker-dot.amber {
  background: var(--amber-600);
}
```

#### `/* FAB */
.fab`

```css
/* FAB */
.fab {
  position: absolute;
  bottom: 110px;
  right: 20px;
  width: 60px;
  height: 60px;
  border-radius: var(--r-xl);
  background: var(--grad-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-fab);
  cursor: pointer;
  z-index: 50;
  border: none;
  transition: transform var(--dur-base) var(--ease-spring),
              box-shadow var(--dur-base) var(--ease-out);
}
```

#### `.fab:hover`

```css
.fab:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 12px 28px rgba(124,58,237,0.40), 0 4px 8px rgba(15,23,42,0.10);
}
```

#### `.fab:active`

```css
.fab:active {
  transform: scale(0.96);
}
```

#### `.fab .material-symbols-rounded`

```css
.fab .material-symbols-rounded {
  font-size: 28px;
  font-variation-settings: "FILL" 1;
}
```

#### `/* Bottom Nav (modern: floating glass pill) */
.bottom-nav`

```css
/* Bottom Nav (modern: floating glass pill) */
.bottom-nav {
  position: absolute;
  bottom: 14px;
  left: 14px;
  right: 14px;
  height: 64px;
  background: rgba(255,255,255,0.86);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  border: 1px solid rgba(255,255,255,0.6);
  border-radius: var(--r-2xl);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 0 8px;
  z-index: 40;
  box-shadow: 0 10px 30px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06);
}
```

#### `.nav-item`

```css
.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 14px;
  cursor: pointer;
  border-radius: var(--r-lg);
  transition: background var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out);
  position: relative;
  flex: 1;
  max-width: 90px;
}
```

#### `.nav-item.active`

```css
.nav-item.active {
  background: var(--violet-100);
  color: var(--violet-700);
}
```

#### `.nav-item:not(.active)`

```css
.nav-item:not(.active) {
  color: var(--ink-500);
}
```

#### `.nav-item .material-symbols-rounded`

```css
.nav-item .material-symbols-rounded {
  font-size: 22px;
  transition: font-variation-settings var(--dur-base) var(--ease-out);
}
```

#### `.nav-item.active .material-symbols-rounded`

```css
.nav-item.active .material-symbols-rounded {
  font-variation-settings: "FILL" 1, "wght" 600;
}
```

#### `.nav-item span.label`

```css
.nav-item span.label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
```

#### `/* ===== More Options Screen ===== */
.list-section`

```css
/* ===== More Options Screen ===== */
.list-section {
  background: var(--surface-white);
  margin: 0 20px 16px;
  border-radius: var(--r-xl);
  border: 1px solid var(--ink-100);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}
```

#### `.list-section-header`

```css
.list-section-header {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-500);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  padding: 14px 16px 8px;
}
```

#### `.list-row`

```css
.list-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
  border-top: 1px solid var(--ink-100);
}
```

#### `.list-row:first-of-type`

```css
.list-row:first-of-type {
  border-top: none;
}
```

#### `.list-row:hover`

```css
.list-row:hover {
  background: var(--violet-25);
}
```

#### `.list-row-icon`

```css
.list-row-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
```

#### `.list-row-icon.purple`

```css
.list-row-icon.purple {
  background: var(--violet-100);
  color: var(--violet-700);
}
```

#### `.list-row-icon.red`

```css
.list-row-icon.red {
  background: var(--red-100);
  color: var(--red-600);
}
```

#### `.list-row-icon.green`

```css
.list-row-icon.green {
  background: var(--green-100);
  color: var(--green-700);
}
```

#### `.list-row-icon.amber`

```css
.list-row-icon.amber {
  background: var(--amber-100);
  color: var(--amber-600);
}
```

#### `.list-row-icon.sky`

```css
.list-row-icon.sky {
  background: var(--sky-100);
  color: var(--sky-600);
}
```

#### `.list-row-icon.gray`

```css
.list-row-icon.gray {
  background: var(--ink-100);
  color: var(--ink-700);
}
```

#### `.list-row-icon .material-symbols-rounded`

```css
.list-row-icon .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: "FILL" 1;
}
```

#### `.list-row-content`

```css
.list-row-content {
  flex: 1;
  min-width: 0;
}
```

#### `.list-row-title`

```css
.list-row-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--ink-950);
  letter-spacing: -0.01em;
}
```

#### `.list-row-sub`

```css
.list-row-sub {
  font-size: 12px;
  color: var(--ink-500);
  margin-top: 1px;
}
```

#### `.list-row .material-symbols-rounded.arrow`

```css
.list-row .material-symbols-rounded.arrow {
  color: var(--ink-400);
  font-size: 18px;
  transition: transform var(--dur-fast) var(--ease-out);
}
```

#### `.list-row:hover .material-symbols-rounded.arrow`

```css
.list-row:hover .material-symbols-rounded.arrow {
  color: var(--violet-700);
  transform: translateX(2px);
}
```

#### `.logout-row`

```css
.logout-row {
  margin: 24px 20px;
  padding: 16px;
  text-align: center;
  background: var(--red-50);
  border-radius: var(--r-lg);
  border: 1px solid var(--red-100);
  color: var(--red-600);
  font-weight: 600;
  cursor: pointer;
  font-size: 15px;
  transition: background var(--dur-fast) var(--ease-out);
}
```

#### `.logout-row:hover`

```css
.logout-row:hover {
  background: var(--red-100);
}
```

#### `/* ===== Settings ===== */
.profile-card`

```css
/* ===== Settings ===== */
.profile-card {
  margin: 16px 20px;
  padding: 18px;
  background: white;
  border-radius: 20px;
  border: 1px solid var(--ink-100);
  display: flex;
  align-items: center;
  gap: 14px;
}
```

#### `.avatar-md`

```css
.avatar-md {
  width: 56px;
  height: 56px;
  border-radius: var(--r-lg);
  background: var(--grad-primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 20px;
  flex-shrink: 0;
  letter-spacing: -0.02em;
  box-shadow: var(--shadow-card);
}
```

#### `.profile-info`

```css
.profile-info {
  flex: 1;
  min-width: 0;
}
```

#### `.profile-name`

```css
.profile-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-950);
  letter-spacing: -0.01em;
}
```

#### `.profile-email`

```css
.profile-email {
  font-size: 12px;
  color: var(--ink-500);
  margin-top: 2px;
}
```

#### `.profile-edit`

```css
.profile-edit {
  font-size: 12px;
  color: var(--violet-700);
  font-weight: 600;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  transition: background var(--dur-fast) var(--ease-out);
}
```

#### `.profile-edit:hover`

```css
.profile-edit:hover {
  background: var(--violet-50);
}
```

#### `/* Toggle switch (modern) */
.toggle`

```css
/* Toggle switch (modern) */
.toggle {
  width: 44px;
  height: 26px;
  background: var(--ink-200);
  border-radius: var(--r-pill);
  position: relative;
  cursor: pointer;
  transition: background var(--dur-base) var(--ease-out);
  flex-shrink: 0;
}
```

#### `.toggle.on`

```css
.toggle.on {
  background: var(--violet-600);
}
```

#### `.toggle::after`

```css
.toggle::after {
  content: '';
  width: 22px;
  height: 22px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform var(--dur-base) var(--ease-spring);
  box-shadow: 0 2px 4px rgba(15,23,42,0.18);
}
```

#### `.toggle.on::after`

```css
.toggle.on::after {
  transform: translateX(18px);
}
```

#### `/* ===== Capture Page ===== */
.capture-anon`

```css
/* ===== Capture Page ===== */
.capture-anon {
  margin: 16px 20px;
  padding: 14px 16px;
  background: var(--violet-50);
  border: 1px solid var(--violet-100);
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  gap: 12px;
}
```

#### `.capture-anon .icon-circle`

```css
.capture-anon .icon-circle {
  width: 36px;
  height: 36px;
  background: var(--violet-100);
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--violet-700);
}
```

#### `.capture-anon .icon-circle .material-symbols-rounded`

```css
.capture-anon .icon-circle .material-symbols-rounded {
  font-variation-settings: "FILL" 1;
}
```

#### `.capture-anon-content`

```css
.capture-anon-content {
  flex: 1;
}
```

#### `.capture-anon-label`

```css
.capture-anon-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-950);
}
```

#### `.capture-anon-helper`

```css
.capture-anon-helper {
  font-size: 11px;
  color: var(--ink-500);
  margin-top: 2px;
}
```

#### `.upload-card`

```css
.upload-card {
  margin: 0 20px 12px;
  padding: 20px;
  background: var(--violet-25);
  border: 1.5px dashed var(--violet-300);
  border-radius: var(--r-xl);
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all var(--dur-base) var(--ease-out);
}
```

#### `.upload-card:hover`

```css
.upload-card:hover {
  border-color: var(--violet-500);
  background: var(--violet-50);
  border-style: solid;
}
```

#### `.upload-card-icon`

```css
.upload-card-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  background: var(--violet-100);
  color: var(--violet-700);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

#### `.upload-card-icon .material-symbols-rounded`

```css
.upload-card-icon .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: "FILL" 1;
}
```

#### `.upload-card-info`

```css
.upload-card-info {
  flex: 1;
}
```

#### `.upload-card-title`

```css
.upload-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-950);
  letter-spacing: -0.01em;
}
```

#### `.upload-card-sub`

```css
.upload-card-sub {
  font-size: 11px;
  color: var(--ink-500);
  margin-top: 2px;
}
```

#### `.textarea-field`

```css
.textarea-field {
  width: 100%;
  min-height: 120px;
  padding: 14px 16px;
  border: 1.5px solid var(--ink-200);
  border-radius: var(--r-lg);
  background: var(--surface-white);
  font-family: inherit;
  font-size: 15px;
  color: var(--ink-950);
  resize: none;
  outline: none;
  transition: all var(--dur-base) var(--ease-out);
}
```

#### `.textarea-field:focus`

```css
.textarea-field:focus {
  border-color: var(--violet-500);
  box-shadow: var(--shadow-glow);
}
```

#### `.location-card`

```css
.location-card {
  margin: 0 20px;
  padding: 14px 16px;
  background: var(--surface-white);
  border: 1px solid var(--ink-100);
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-xs);
}
```

#### `.location-card .material-symbols-rounded`

```css
.location-card .material-symbols-rounded {
  color: var(--violet-700);
  font-size: 22px;
  font-variation-settings: "FILL" 1;
}
```

#### `.location-card-info`

```css
.location-card-info {
  flex: 1;
}
```

#### `.location-card-title`

```css
.location-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-950);
}
```

#### `.location-card-sub`

```css
.location-card-sub {
  font-size: 11px;
  color: var(--ink-500);
}
```

#### `.location-card-edit`

```css
.location-card-edit {
  font-size: 12px;
  color: var(--purple-500);
  font-weight: 600;
}
```

#### `.sticky-cta`

```css
.sticky-cta {
  position: sticky;
  bottom: 0;
  padding: 16px 20px 20px;
  background: linear-gradient(to top, var(--surface-lavender) 75%, rgba(250,250,254,0) 100%);
  z-index: 5;
}
```

#### `/* Capture and Location Sharing: explicit bottom padding on content
   so contacts/textarea scroll above the sticky CTA. */
.screen[data-screen="17"] .content,
.screen[data-screen="19"] .content`

```css
/* Capture and Location Sharing: explicit bottom padding on content
   so contacts/textarea scroll above the sticky CTA. */
.screen[data-screen="17"] .content,
.screen[data-screen="19"] .content {
  padding-bottom: 110px;
}
```

#### `/* ===== Help Alert ===== */
.help-header`

```css
/* ===== Help Alert ===== */
.help-header {
  padding: 16px 20px;
  background: rgba(255,255,255,0.86);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--ink-100);
}
```

#### `.help-header h2`

```css
.help-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--red-600);
  margin-bottom: 2px;
  letter-spacing: -0.01em;
}
```

#### `.help-header p`

```css
.help-header p {
  font-size: 12px;
  color: var(--ink-500);
}
```

#### `.help-card`

```css
.help-card {
  margin: 12px 20px;
  padding: 20px;
  height: 80px;
  border-radius: var(--r-xl);
  color: white;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  box-shadow: 0 8px 20px rgba(15,23,42,0.10);
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
```

#### `.help-card:hover`

```css
.help-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(15,23,42,0.14);
}
```

#### `.help-card.purple`

```css
.help-card.purple {
  background: var(--grad-hero);
  box-shadow: 0 12px 28px rgba(124,58,237,0.28);
}
```

#### `.help-card.red`

```css
.help-card.red {
  background: var(--grad-emergency);
  box-shadow: 0 12px 28px rgba(220,38,38,0.30);
}
```

#### `.help-card.amber`

```css
.help-card.amber {
  background: linear-gradient(135deg, #D97706, #F59E0B);
  box-shadow: 0 12px 28px rgba(217,119,6,0.30);
}
```

#### `.help-card.green`

```css
.help-card.green {
  background: linear-gradient(135deg, #059669, #10B981);
  box-shadow: 0 12px 28px rgba(5,150,105,0.30);
}
```

#### `.help-card-icon`

```css
.help-card-icon {
  width: 56px;
  height: 56px;
  background: rgba(255,255,255,0.20);
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  backdrop-filter: blur(12px);
}
```

#### `.help-card-icon .material-symbols-rounded`

```css
.help-card-icon .material-symbols-rounded {
  font-size: 28px;
  font-variation-settings: "FILL" 1;
}
```

#### `.help-card-content`

```css
.help-card-content {
  flex: 1;
  min-width: 0;
}
```

#### `.help-card-title`

```css
.help-card-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 2px;
}
```

#### `.help-card-sub`

```css
.help-card-sub {
  font-size: 12px;
  color: rgba(255,255,255,0.85);
}
```

#### `.help-card-en`

```css
.help-card-en {
  font-size: 11px;
  font-weight: 500;
  color: #FFFFFF;
  margin-top: 2px;
  letter-spacing: 0.02em;
}
```

#### `.help-card-right`

```css
.help-card-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
```

#### `.help-card-phone`

```css
.help-card-phone {
  font-size: 14px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.5px;
}
```

#### `.help-card-circle`

```css
.help-card-circle {
  width: 36px;
  height: 36px;
  background: rgba(255,255,255,0.25);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

#### `.help-card-circle .material-symbols-outlined`

```css
.help-card-circle .material-symbols-outlined {
  font-size: 18px;
  font-variation-settings: "FILL" 1;
}
```

#### `/* ===== Location Sharing ===== */
.map-preview`

```css
/* ===== Location Sharing ===== */
.map-preview {
  height: 240px;
  margin: 16px 20px;
  border-radius: var(--r-xl);
  background: linear-gradient(135deg, #E8DFF5 0%, #F0E8FA 100%),
    repeating-linear-gradient(0deg, transparent 0, transparent 18px, var(--ink-100) 18px, var(--ink-100) 19px),
    repeating-linear-gradient(90deg, transparent 0, transparent 18px, var(--ink-100) 18px, var(--ink-100) 19px);
  background-blend-mode: normal, multiply, multiply;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--ink-100);
  box-shadow: var(--shadow-card);
}
```

#### `.map-roads`

```css
.map-roads {
  position: absolute;
  inset: 0;
  background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.6) 30%, rgba(255,255,255,0.6) 35%, transparent 35%),
    linear-gradient(-45deg, transparent 60%, rgba(255,255,255,0.6) 60%, rgba(255,255,255,0.6) 65%, transparent 65%);
}
```

#### `.map-pin`

```css
.map-pin {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}
```

#### `.map-pin-dot`

```css
.map-pin-dot {
  width: 24px;
  height: 24px;
  background: var(--violet-600);
  border: 4px solid white;
  border-radius: 50%;
  box-shadow: 0 8px 20px rgba(124,58,237,0.40);
  position: relative;
  z-index: 2;
}
```

#### `.map-pin-pulse`

```css
.map-pin-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  background: var(--violet-500);
  border-radius: 50%;
  animation: pulse-map 2.5s ease-out infinite;
}
```

#### `.map-pin-label`

```css
.map-pin-label {
  position: absolute;
  top: -34px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--ink-950);
  color: white;
  padding: 5px 10px;
  border-radius: var(--r-sm);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: var(--shadow-card);
}
```

#### `.map-pin-label::after`

```css
.map-pin-label::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid var(--ink-950);
}
```

#### `.map-live-badge`

```css
.map-live-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255,255,255,0.94);
  backdrop-filter: blur(8px);
  padding: 6px 10px;
  border-radius: var(--r-pill);
  font-size: 10px;
  font-weight: 700;
  color: var(--red-600);
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: var(--shadow-card);
  letter-spacing: 0.5px;
}
```

#### `.map-live-badge::before`

```css
.map-live-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  background: var(--red-500);
  border-radius: 50%;
  animation: pulse-red 1.5s infinite;
}
```

#### `.address-card`

```css
.address-card {
  margin: 0 20px 16px;
  padding: 16px;
  background: var(--surface-white);
  border: 1px solid var(--ink-100);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xs);
}
```

#### `.address-card-header`

```css
.address-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--ink-500);
  font-weight: 500;
}
```

#### `.address-card-address`

```css
.address-card-address {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-950);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}
```

#### `.address-card-coords`

```css
.address-card-coords {
  font-size: 11px;
  color: var(--ink-500);
  font-family: 'Roboto', monospace;
}
```

#### `.share-toggle-row`

```css
.share-toggle-row {
  margin: 16px 20px;
  padding: 16px;
  background: white;
  border-radius: 16px;
  border: 1px solid var(--ink-100);
  display: flex;
  align-items: center;
  gap: 12px;
}
```

#### `.share-toggle-content`

```css
.share-toggle-content {
  flex: 1;
}
```

#### `.share-toggle-title`

```css
.share-toggle-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-950);
}
```

#### `.share-toggle-sub`

```css
.share-toggle-sub {
  font-size: 11px;
  color: var(--ink-500);
  margin-top: 2px;
}
```

#### `/* ===== Emergency Contacts ===== */
.contact-row`

```css
/* ===== Emergency Contacts ===== */
.contact-row {
  margin: 8px 20px;
  padding: 14px;
  background: white;
  border: 1px solid var(--ink-100);
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
```

#### `.contact-avatar`

```css
.contact-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  color: white;
  flex-shrink: 0;
}
```

#### `.contact-avatar.family`

```css
.contact-avatar.family {
  background: linear-gradient(135deg, #F472B6, #EC4899);
}
```

#### `.contact-avatar.friend`

```css
.contact-avatar.friend {
  background: linear-gradient(135deg, var(--purple-500), var(--purple-400));
}
```

#### `.contact-avatar.colleague`

```css
.contact-avatar.colleague {
  background: linear-gradient(135deg, var(--green-500), var(--green-600));
}
```

#### `.contact-info`

```css
.contact-info {
  flex: 1;
}
```

#### `.contact-name`

```css
.contact-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-950);
}
```

#### `.contact-phone`

```css
.contact-phone {
  font-size: 12px;
  color: var(--ink-500);
}
```

#### `.contact-relationship`

```css
.contact-relationship {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}
```

#### `.contact-relationship.family`

```css
.contact-relationship.family {
  background: #FCE7F3;
  color: #BE185D;
}
```

#### `.contact-relationship.friend`

```css
.contact-relationship.friend {
  background: var(--purple-100);
  color: var(--purple-700);
}
```

#### `.contact-relationship.colleague`

```css
.contact-relationship.colleague {
  background: var(--green-100);
  color: var(--green-600);
}
```

#### `.contact-action`

```css
.contact-action {
  width: 36px;
  height: 36px;
  background: var(--green-100);
  color: var(--green-600);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

#### `.contact-action .material-symbols-outlined`

```css
.contact-action .material-symbols-outlined {
  font-size: 20px;
  font-variation-settings: "FILL" 1;
}
```

#### `.section-group-title`

```css
.section-group-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-500);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  padding: 16px 24px 8px;
}
```

#### `/* ===== History Pages ===== */
.location-pill`

```css
/* ===== History Pages ===== */
.location-pill {
  margin: 16px 20px;
  padding: 10px 16px;
  background: white;
  border: 1px solid var(--ink-100);
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-700);
  font-weight: 500;
  cursor: pointer;
}
```

#### `.location-pill .material-symbols-outlined`

```css
.location-pill .material-symbols-outlined {
  color: var(--purple-700);
  font-size: 18px;
}
```

#### `.segmented-tabs`

```css
.segmented-tabs {
  display: flex;
  margin: 0 20px 16px;
  background: var(--ink-100);
  border-radius: var(--r-md);
  padding: 4px;
}
```

#### `.segmented-tab`

```css
.segmented-tab {
  flex: 1;
  text-align: center;
  padding: 10px 8px;
  border-radius: var(--r-sm);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-500);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
  letter-spacing: -0.01em;
}
```

#### `.segmented-tab:hover`

```css
.segmented-tab:hover {
  color: var(--ink-700);
}
```

#### `.segmented-tab.active`

```css
.segmented-tab.active {
  background: var(--surface-white);
  color: var(--violet-700);
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.06);
}
```

#### `/* Filter chip (used on History list) */
.time-chip`

```css
/* Filter chip (used on History list) */
.time-chip {
  flex-shrink: 0;
  padding: 8px 16px;
  background: white;
  border: 1px solid var(--surface-outline);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-700);
  cursor: pointer;
  transition: all var(--dur-base) var(--ease-out);
}
```

#### `.time-chip:hover`

```css
.time-chip:hover {
  background: var(--ink-50);
}
```

#### `.time-chip.active`

```css
.time-chip.active {
  background: var(--violet-700);
  color: white;
  border-color: var(--violet-700);
}
```

#### `/* ===== Layout Columns ===== */
.phone-column`

```css
/* ===== Layout Columns ===== */
.phone-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 auto;
}
```

#### `.sidebar-column`

```css
.sidebar-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  flex: 1 1 auto;
  max-width: 380px;
  min-width: 0;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  padding-right: 4px;
}
```

#### `.sidebar-column::-webkit-scrollbar`

```css
.sidebar-column::-webkit-scrollbar {
  width: 6px;
}
```

#### `.sidebar-column::-webkit-scrollbar-thumb`

```css
.sidebar-column::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.2);
  border-radius: 3px;
}
```

#### `/* ===== Sidebar Brand (top of right panel, right-aligned) ===== */
.sidebar-brand`

```css
/* ===== Sidebar Brand (top of right panel, right-aligned) ===== */
.sidebar-brand {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 4px 6px 6px;
  text-align: right;
}
```

#### `.sidebar-brand-mark`

```css
.sidebar-brand-mark {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
  background: var(--grad-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 8px 20px rgba(124,58,237,0.32);
  flex-shrink: 0;
}
```

#### `.sidebar-brand-mark .material-symbols-rounded`

```css
.sidebar-brand-mark .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: "FILL" 1;
}
```

#### `.sidebar-brand-text`

```css
.sidebar-brand-text {
  text-align: right;
  min-width: 0;
}
```

#### `.sidebar-brand-text h1`

```css
.sidebar-brand-text h1 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.5px;
  background: var(--grad-hero);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1.1;
}
```

#### `.sidebar-brand-text p`

```css
.sidebar-brand-text p {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-500);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-top: 2px;
}
```

#### `/* ===== Bottom Navigation Controls (external) ===== */
.nav-controls`

```css
/* ===== Bottom Navigation Controls (external) ===== */
.nav-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0,0,0,0.42);
  backdrop-filter: saturate(180%) blur(24px);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  padding: 10px 16px;
  border-radius: var(--r-pill);
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 12px 32px rgba(0,0,0,0.30);
  width: 100%;
  max-width: 360px;
  align-self: center;
}
```

#### `.nav-btn`

```css
.nav-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.10);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
```

#### `.nav-btn:hover`

```css
.nav-btn:hover {
  background: rgba(255,255,255,0.20);
  transform: scale(1.05);
}
```

#### `.nav-btn:active`

```css
.nav-btn:active {
  transform: scale(0.95);
}
```

#### `.nav-btn:disabled`

```css
.nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
}
```

#### `.nav-btn .material-symbols-rounded`

```css
.nav-btn .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: "FILL" 1;
}
```

#### `.screen-indicator`

```css
.screen-indicator {
  color: white;
  font-size: 13px;
  font-weight: 700;
  min-width: 100px;
  text-align: center;
  letter-spacing: -0.01em;
}
```

#### `.screen-pill`

```css
.screen-pill {
  background: rgba(255,255,255,0.15);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  color: white;
  font-weight: 600;
  letter-spacing: 0.5px;
}
```

#### `.screen-map`

```css
.screen-map {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  width: 100%;
  padding: 14px;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(20px);
  border-radius: 16px;
}
```

#### `.screen-map-title`

```css
.screen-map-title {
  color: white;
  font-size: 11px;
  font-weight: 600;
  grid-column: 1 / -1;
  text-align: left;
  margin-bottom: 4px;
  letter-spacing: 1px;
  text-transform: uppercase;
  opacity: 0.7;
}
```

#### `.screen-map button`

```css
.screen-map button {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.75);
  padding: 7px 10px;
  border-radius: var(--r-md);
  font-size: 11.5px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
  letter-spacing: -0.01em;
}
```

#### `.screen-map button:hover`

```css
.screen-map button:hover {
  background: rgba(255,255,255,0.14);
  color: white;
  border-color: rgba(255,255,255,0.16);
}
```

#### `.screen-map button.active`

```css
.screen-map button.active {
  background: var(--grad-primary-soft);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(124,58,237,0.32);
}
```

#### `/* Responsive — on truly narrow viewports we let the JS scale
   script take over, but tighten padding and header text. */
@media (max-width: 900px)`

```css
/* Responsive — on truly narrow viewports we let the JS scale
   script take over, but tighten padding and header text. */
@media (max-width: 900px) {
  /* On narrow viewports, stack everything vertically. */
  .app-container { flex-direction: column;
  gap: 16px;
  }
  .sidebar-column { max-width: 100%;
  max-height: none;
  overflow: visible;
  }
  .phone-column { order: -1;
  }
  .screen-map { grid-template-columns: repeat(4, 1fr);
  }: ;
}
```

---

## 4. Media queries / responsive blocks

- `@keyframes pulse-glow` — 3 declaration(s)

```css
0%, 100% {
    box-shadow: 0 12px 32px rgba(0,0,0,0.20),
                0 0 0 0 rgba(255,255,255,0.0);
  }
  50% {
    box-shadow: 0 16px 40px rgba(0,0,0,0.28),
                0 0 0 16px rgba(255,255,255,0.06);
  }
```

- `@keyframes bounce` — 5 declaration(s)

```css
0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-8px); opacity: 1; }
```

- `@keyframes ring-pulse` — 5 declaration(s)

```css
0% { transform: scale(0.9); opacity: 0.7; }
  100% { transform: scale(1.2); opacity: 0; }
```

- `@keyframes pulse-red` — 3 declaration(s)

```css
0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
  50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
```

- `@keyframes pulse-map` — 5 declaration(s)

```css
0%   { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
  100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
```

- `@media (max-width: 768px)` — 6 declaration(s)

```css
body { padding: 8px; overflow-y: auto; }
  .prototype-header h1 { font-size: 20px; }
  .prototype-header p { font-size: 12px; }
  .screen-map { padding: 8px; }
```

- `@media (max-width: 480px)` — 4 declaration(s)

```css
.prototype-header h1 { font-size: 18px; }
  .prototype-header p { font-size: 11px; }
  .screen-map { grid-template-columns: repeat(2, 1fr); }
```

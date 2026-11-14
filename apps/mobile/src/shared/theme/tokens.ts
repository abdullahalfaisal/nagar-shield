/**
 * Design tokens ported 1:1 from `prototype ui.html`.
 * Source of truth: `docs/design/design-tokens.md` + the prototype's `:root` block.
 *
 * Every value here is a literal copy of the prototype. Do not "improve" a
 * colour, round a radius, or invent a spacing scale — the port contract is
 * exact. Where a CSS feature has no React Native equivalent, the documented
 * substitute lives in `shared/ui` (see `ux-guide.md` § React Native porting notes).
 *
 * Legacy `--blue-*` / `--purple-*` aliases are intentionally NOT ported: they
 * resolved onto the violet ramp, and the components reference violet tokens
 * directly.
 */

export const palette = {
  violet: {
    950: '#1E0B47',
    900: '#3B1E91',
    800: '#4C2BB5',
    700: '#6D28D9',
    600: '#7C3AED',
    500: '#8B5CF6',
    400: '#A78BFA',
    300: '#C4B5FD',
    200: '#DDD6FE',
    100: '#EDE9FE',
    50: '#F5F3FF',
    25: '#FAF8FF',
  },
  red: {
    700: '#B91C1C',
    600: '#DC2626',
    500: '#EF4444',
    100: '#FEE2E2',
    50: '#FEF2F2',
  },
  amber: {
    600: '#D97706',
    500: '#F59E0B',
    100: '#FEF3C7',
    50: '#FFFBEB',
  },
  green: {
    700: '#047857',
    600: '#059669',
    500: '#10B981',
    100: '#D1FAE5',
    50: '#ECFDF5',
  },
  sky: {
    600: '#0284C7',
    100: '#E0F2FE',
    50: '#F0F9FF',
  },
} as const

/** Gradient stops, mirroring the CSS `linear-gradient(135deg, …)` definitions. */
export const gradients = {
  primary: ['#7C3AED', '#A78BFA', '#6D28D9'],
  primarySoft: ['#8B5CF6', '#A78BFA'],
  hero: ['#4C2BB5', '#7C3AED', '#A78BFA'],
  emergency: ['#E94B45', '#F87171'],
  amber: ['#D97706', '#F59E0B'],
  green: ['#059669', '#10B981'],
  success: ['#10B981', '#059669'],
  family: ['#F472B6', '#EC4899'],
} as const

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 28,
  pill: 999,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

/**
 * Minimum tap target. Material 48 dp (FR-UX-4 / PRD-X-3).
 * Every interactive control must be at least this size in both dimensions.
 */
export const MIN_TAP_TARGET = 48

/** The prototype phone frame is 390 × 844. */
export const layout = {
  screenWidth: 390,
  screenHeight: 844,
  contentPadding: 20,
  appBarHeight: 56,
  helpCardHeight: 80,
  helpCardIconSize: 56,
  flagButtonSize: 48,
  avatarSize: 44,
} as const

export const typography = {
  /**
   * Registered faces — see `theme/fonts.ts`. The prototype's font stack is
   * `'Inter', 'Noto Sans Bengali', 'Roboto', sans-serif`; on Android the
   * system Roboto is the fallback, so Bangla text falls back to
   * Noto Sans Bengali explicitly.
   */
  fontFamily: {
    sans: 'Inter',
    sansMedium: 'Inter-Medium',
    sansSemiBold: 'Inter-SemiBold',
    sansBold: 'Inter-Bold',
    sansExtraBold: 'Inter-ExtraBold',
    bengali: 'NotoSansBengali',
    bengaliMedium: 'NotoSansBengali-Medium',
    bengaliSemiBold: 'NotoSansBengali-SemiBold',
    bengaliBold: 'NotoSansBengali-Bold',
  },
  size: {
    xs: 10,
    sm: 11,
    md: 12,
    base: 13,
    body: 14,
    lg: 15,
    xl: 18,
    xxl: 20,
    display: 24,
    brand: 26,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeight: {
    tight: 1.3,
    snug: 1.4,
    normal: 1.5,
  },
} as const

/**
 * Shadows. React Native needs one shadow config per platform:
 * iOS uses `shadow*`, Android uses `elevation`. The values are the prototype's.
 */
export const shadows = {
  xs: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lift: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  fab: {
    shadowColor: '#7C3AED',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emergency: {
    shadowColor: '#DC2626',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const

export const duration = {
  fast: 150,
  base: 220,
  slow: 360,
} as const

/**
 * The theme-independent colours. Everything else is theme-scoped because the
 * ink and surface ramps invert between light and dark.
 */
export const staticColors = {
  white: '#FFFFFF',
  transparent: 'transparent',
  scrim: 'rgba(0,0,0,0.55)',
  helpCardIconBg: 'rgba(255,255,255,0.20)',
  helpCardSub: 'rgba(255,255,255,0.85)',
  mapPinGlow: 'rgba(124,58,237,0.16)',
} as const

export interface ThemeColors {
  /** Cool slate neutrals. Inverted between themes. */
  ink: {
    950: string
    900: string
    800: string
    700: string
    600: string
    500: string
    400: string
    300: string
    200: string
    100: string
    50: string
  }
  surface: {
    white: string
    lavender: string
    card: string
    outline: string
  }
  appBarBg: string
  isDark: boolean
}

export const lightColors: ThemeColors = {
  ink: {
    950: '#0B0B1A',
    900: '#11112B',
    800: '#1A1A2E',
    700: '#2D2D44',
    600: '#4A4A66',
    500: '#6B6B85',
    400: '#9090A8',
    300: '#B8B8CC',
    200: '#E2E2EE',
    100: '#EFEFF5',
    50: '#F7F7FB',
  },
  surface: {
    white: '#FFFFFF',
    lavender: '#FAFAFE',
    card: '#FFFFFF',
    outline: '#E2E2EE',
  },
  appBarBg: 'rgba(255,255,255,0.86)',
  isDark: false,
}

export const darkColors: ThemeColors = {
  ink: {
    950: '#F5F5FA',
    900: '#E2E2EE',
    800: '#C4C4D6',
    700: '#B8B8CC',
    600: '#9090A8',
    500: '#6B6B85',
    400: '#4A4A66',
    300: '#2D2D44',
    200: '#1A1A2E',
    100: '#11112B',
    50: '#0B0B1A',
  },
  surface: {
    white: '#11112B',
    lavender: '#0B0B1A',
    card: '#1A1A2E',
    outline: '#3A3A52',
  },
  appBarBg: 'rgba(11,11,26,0.86)',
  isDark: true,
}

export interface Theme {
  name: 'light' | 'dark'
  colors: ThemeColors
  palette: typeof palette
  gradients: typeof gradients
  radius: typeof radius
  spacing: typeof spacing
  layout: typeof layout
  typography: typeof typography
  shadows: typeof shadows
  duration: typeof duration
  staticColors: typeof staticColors
}

export function buildTheme(name: 'light' | 'dark'): Theme {
  return {
    name,
    colors: name === 'dark' ? darkColors : lightColors,
    palette,
    gradients,
    radius,
    spacing,
    layout,
    typography,
    shadows,
    duration,
    staticColors,
  }
}

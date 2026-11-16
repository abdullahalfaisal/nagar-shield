import { useTheme } from '../theme'
import { mixHex } from '../theme/colorMix'
import { withAlpha } from './AlertCard'

/** The accents a tinted icon well can wear. Red stays with emergency help. */
export type Accent = 'violet' | 'green' | 'amber' | 'sky' | 'pink'

/**
 * The tinted well and glyph colour of an accent, picked to read in each theme.
 *
 * `well` and `glyph` are for a small icon tile on a plain surface. `card`,
 * `cardBorder` and `cardWell` are for a card that wears a faint wash of its own
 * accent, with a white well on top.
 */
export function useAccent(color: Accent): {
  well: string
  glyph: string
  card: string
  cardBorder: string
  cardWell: string
} {
  const theme = useTheme()
  const { palette } = theme
  const dark = theme.colors.isDark

  const accents: Record<Accent, string> = dark
    ? {
        violet: palette.violet[400],
        green: palette.green[500],
        amber: palette.amber[500],
        sky: palette.sky[600],
        pink: '#F472B6',
      }
    : {
        violet: palette.violet[700],
        green: palette.green[700],
        amber: palette.amber[600],
        sky: palette.sky[600],
        pink: '#DB2777',
      }
  const accent = accents[color]

  return {
    well: withAlpha(accent, dark ? 0.26 : 0.13),
    glyph: dark ? mixHex(accent, theme.staticColors.white, 0.3) : accent,
    card: withAlpha(accent, dark ? 0.14 : 0.08),
    cardBorder: withAlpha(accent, dark ? 0.35 : 0.2),
    cardWell: dark ? withAlpha(accent, 0.3) : theme.staticColors.white,
  }
}

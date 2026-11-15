import { StyleSheet, View } from 'react-native'
import { REPORT_CATEGORY_ACCENTS, type ReportCategory } from '@nagar-shield/shared'
import { useTheme } from '../theme'
import { mixHex } from '../theme/colorMix'
import { CATEGORY_SOLID_ICONS, withAlpha } from './AlertCard'
import { SolidIcon } from './SolidIcon'

interface CategoryTileProps {
  /** `null` is "no type chosen": a neutral tile with a question mark. */
  category: ReportCategory | null
  /** The side of the square tile; the glyph is a little over half of it. */
  size?: number
}

/**
 * An incident type's glyph on a soft tint of its own accent.
 *
 * The same treatment as the feed cards: the accent comes from the one shared
 * map, the tint is stronger and the glyph lighter on the dark theme, and a
 * missing type is neutral rather than invented.
 */
export function CategoryTile({ category, size = 40 }: CategoryTileProps) {
  const theme = useTheme()
  const dark = theme.colors.isDark
  const accent = category ? REPORT_CATEGORY_ACCENTS[category] : null

  const background = accent ? withAlpha(accent, dark ? 0.26 : 0.13) : theme.colors.ink[100]
  const glyph = accent
    ? dark
      ? mixHex(accent, theme.staticColors.white, 0.3)
      : accent
    : theme.colors.textMuted

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size >= 48 ? 14 : 12,
          backgroundColor: background,
        },
      ]}
    >
      <SolidIcon
        name={category ? CATEGORY_SOLID_ICONS[category] : 'help'}
        size={Math.round(size * 0.58)}
        color={glyph}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})

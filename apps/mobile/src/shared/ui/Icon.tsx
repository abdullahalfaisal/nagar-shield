import { StyleSheet, Text, type TextStyle } from 'react-native'
import { useTheme } from '../theme'

/**
 * Material Symbols Rounded — the exact icon font the prototype uses.
 * The prototype renders `<span class="material-symbols-outlined">` and
 * `.material-symbols-rounded` against the same variable font, switching between
 * `FILL 0` and `FILL 1` via `font-variation-settings`.
 *
 * We register two faces:
 *   - `MaterialSymbolsRounded`     → FILL 0 (outline)
 *   - `MaterialSymbolsRoundedFill` → FILL 1 (filled)
 *
 * The prototype uses the filled face for `.help-card-icon`,
 * `.action-card-icon`, `.list-row-icon` and the brand logo.
 */
export const ICON_FONT = 'MaterialSymbolsRounded'
export const ICON_FONT_FILLED = 'MaterialSymbolsRoundedFill'

interface IconProps {
  /** Material Symbols ligature name, e.g. `local_police`. */
  name: string
  size?: number
  color?: string
  filled?: boolean
  weight?: '400Regular' | '500Medium' | '600SemiBold' | '700Bold'
  style?: TextStyle
  accessibilityLabel?: string
}

export function Icon({
  name,
  size = 24,
  color,
  filled = false,
  weight = '400Regular',
  style,
  accessibilityLabel,
}: IconProps) {
  const theme = useTheme()
  const fontFamily = filled ? `${ICON_FONT}${weight}Filled` : `${ICON_FONT}${weight}`

  return (
    <Text
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.icon,
        { fontFamily, fontSize: size, color: color ?? theme.colors.ink[700] },
        style,
      ]}
    >
      {name}
    </Text>
  )
}

const styles = StyleSheet.create({
  icon: {
    includeFontPadding: false,
    textAlign: 'center',
    // Material Symbols needs a little extra leading to avoid clipping.
    lineHeight: undefined,
  },
})

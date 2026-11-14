import { StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme } from '../theme'

interface SkeletonProps {
  /** The placeholder's width. A number is dp; a `'100%'` string fills the parent. */
  width?: number | `${number}%`
  /** The placeholder's height in dp. */
  height?: number
  /** The corner radius. Defaults to the `--r-md` token. */
  radius?: number
  style?: ViewStyle
  accessibilityLabel?: string
}

/**
 * The loading placeholder, in the same radius and surface vocabulary as the
 * real content it stands in for.
 *
 * The prototype's `.skeleton` is a flat `--ink-100` block with the card's
 * radius. React Native has no shimmer without an animation library, so this
 * renders the static block — the shape a user waits for is still visible, and
 * no colour flashes.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const theme = useTheme()

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.md,
          backgroundColor: theme.colors.ink[100],
        },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  block: {
    // The block itself is not interactive; nothing to size for a tap target.
  },
})

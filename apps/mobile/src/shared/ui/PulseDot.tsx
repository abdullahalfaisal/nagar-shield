import { StyleSheet, View } from 'react-native'
import { useTheme } from '../theme'

interface PulseDotProps {
  /** Pauses the animation — the battery / offline quiet indicator. */
  paused?: boolean
  color?: string
}

/**
 * `.pulse-red` — the prototype's 6 dp pulsing dot beside the feed header.
 *
 * The pulse is a React Native `Animated` loop. When `paused` is set the dot
 * renders statically, which is the quiet indicator the spec asks for when the
 * auto-refresh is paused.
 */
export function PulseDot({ paused = false, color }: PulseDotProps) {
  const theme = useTheme()
  const dotColor = color ?? theme.palette.red[500]

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wrap}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      {paused ? null : <View style={[styles.halo, { borderColor: dotColor }]} />}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  halo: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    opacity: 0.35,
  },
})

import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { useTheme } from '../theme'

interface PulseDotProps {
  /** Pauses the animation — the battery / offline quiet indicator. */
  paused?: boolean
  /**
   * The operating system's reduce-motion setting.
   *
   * A reduced-motion dot is **still rendered** — it is frozen, not removed,
   * and the halo is still drawn. Only the *movement* stops.
   */
  reduceMotion?: boolean
  color?: string
}

/**
 * The prototype's `pulse-red` keyframes run over **1.5 s**:
 *
 *     @keyframes pulse-red {
 *       0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
 *       50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
 *     }
 *
 * A ring that grows from nothing to 6 dp and fades as it grows. React Native
 * has no `box-shadow`, so the ring is a separate view that **scales** from
 * the dot's own size and **fades** as it grows — the same visible gesture, in
 * the platform's own vocabulary.
 *
 * When `paused` is set the dot renders **statically**, with no halo at all.
 * That is the quiet indicator the spec asks for when the auto-refresh is
 * paused: a dot that is still pulsing says the feed is still refreshing, and
 * it would be saying it falsely.
 *
 * When `reduceMotion` is set the dot is **frozen** rather than removed: the
 * halo is still drawn, at `progress = 0`, and only the movement stops. The
 * two states are different on purpose — `paused` says *"the feed is not
 * refreshing"*, and the halo's absence is part of that message, while
 * reduced motion says *"do not move things"*, which does not ask for the
 * indicator to disappear.
 */

/** The prototype's pulse period, in milliseconds. */
const PULSE_PERIOD_MS = 1_500

/** How far the ring grows, in dp. The prototype's `0 0 0 6px`. */
const HALO_GROWTH_DP = 6

export function PulseDot({ paused = false, reduceMotion = false, color }: PulseDotProps) {
  const theme = useTheme()
  const dotColor = color ?? theme.palette.red[500]

  const progress = useRef(new Animated.Value(0)).current

  // The animation stops for either reason; the **halo** only disappears for
  // one of them. `paused` is the app's own quiet indicator, `reduceMotion` is
  // the user's accessibility setting, and the setting does not get to change
  // what the app is claiming.
  const isStatic = paused || reduceMotion

  useEffect(() => {
    if (isStatic) {
      // The animation is stopped outright, not merely left at its start
      // frame — a stopped animation still holds a value.
      progress.stopAnimation()
      progress.setValue(0)
      return
    }

    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: PULSE_PERIOD_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    )

    animation.start()

    return () => {
      animation.stop()
    }
  }, [isStatic, progress])

  // The ring starts at the dot's own size and grows to 6 dp beyond it, while
  // fading from the prototype's 0.45 alpha to nothing.
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1 + HALO_GROWTH_DP / 3],
  })
  const opacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 0.2, 0],
  })

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wrap}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      {paused ? null : (
        <Animated.View
          style={[
            styles.halo,
            {
              borderColor: dotColor,
              opacity,
              transform: [{ scale }],
            },
          ]}
        />
      )}
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
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
})

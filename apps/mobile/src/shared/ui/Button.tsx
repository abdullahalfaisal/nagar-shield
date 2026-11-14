import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'

export type ButtonVariant = 'primary' | 'secondary' | 'emergency' | 'ghost'
export type ButtonSize = 'md' | 'lg'

interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: string
  disabled?: boolean
  fullWidth?: boolean
  style?: ViewStyle
  accessibilityLabel?: string
  testID?: string
}

/**
 * `.btn` — 52 dp tall (56 dp for `.btn-lg`), radius `--r-lg` / `--r-xl`,
 * 15/16 px semibold, with the prototype's 0.98 press scale.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme()
  const isLarge = size === 'lg'

  const height = isLarge ? 56 : 52
  const fontSize = isLarge ? theme.typography.size.xl : theme.typography.size.body
  const borderRadius = isLarge ? theme.radius.xl : theme.radius.lg

  const content = (
    <View style={styles.content}>
      {icon ? (
        <Text style={[styles.icon, { color: iconColor(variant, theme) }]}>{icon}</Text>
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: iconColor(variant, theme),
            fontSize,
            fontWeight: theme.typography.weight.semibold,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  )

  const base: ViewStyle = {
    height,
    borderRadius,
    width: fullWidth ? '100%' : undefined,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: disabled ? 0.5 : 1,
    transform: [{ scale: 1 }],
  }

  if (variant === 'primary') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [base, pressed && styles.pressed, style]}
      >
        <LinearGradient
          colors={[...theme.gradients.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderRadius }]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    )
  }

  if (variant === 'emergency') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [base, pressed && styles.pressed, style]}
      >
        <LinearGradient
          colors={[...theme.gradients.emergency]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderRadius }]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    )
  }

  const isGhost = variant === 'ghost'
  const background = isGhost ? 'transparent' : theme.colors.surface.white
  const borderWidth = isGhost ? 0 : 1.5
  const borderColor = isGhost ? 'transparent' : theme.colors.ink[200]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        base,
        { backgroundColor: background, borderWidth, borderColor },
        pressed && styles.pressed,
        style,
      ]}
    >
      {content}
    </Pressable>
  )
}

function iconColor(variant: ButtonVariant, theme: ReturnType<typeof useTheme>): string {
  switch (variant) {
    case 'primary':
    case 'emergency':
      return theme.staticColors.white
    case 'ghost':
      return theme.palette.violet[700]
    default:
      return theme.palette.violet[700]
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 18,
    fontWeight: '400',
  },
  label: {
    letterSpacing: -0.01,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
})

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { Icon } from './Icon'

interface LocationPillProps {
  label: string
  onPress?: () => void
  accessibilityLabel?: string
}

/**
 * `.location-pill` — the History screen's origin pill.
 *
 * `margin: 16px 20px`, `padding: 10px 16px`, `background: white`,
 * `border: 1px solid var(--ink-100)`, `border-radius: 999px`, with the
 * `location_on` icon on the left and the `keyboard_arrow_down` on the right.
 */
export function LocationPill({ label, onPress, accessibilityLabel }: LocationPillProps) {
  const theme = useTheme()

  const content = (
    <>
      <Icon name="location_on" size={18} color={theme.palette.violet[700]} />
      <Text numberOfLines={1} style={[styles.label, { color: theme.colors.ink[700] }]}>
        {label}
      </Text>
      {onPress ? <Icon name="keyboard_arrow_down" size={18} color={theme.colors.ink[400]} /> : null}
    </>
  )

  if (!onPress) {
    return (
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor: theme.colors.ink[100],
          },
        ]}
      >
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
        },
      ]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 48,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
})

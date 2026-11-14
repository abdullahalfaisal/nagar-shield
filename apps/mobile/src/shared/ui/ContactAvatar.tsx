import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'

export type ContactGroupTone = 'family' | 'friend' | 'colleague' | 'other'

/**
 * `.contact-avatar` — a 44 dp circle carrying the first letter of the contact's
 * name, on a gradient that follows the contact's group.
 *
 * The prototype's gradients are literal:
 *   family    → #F472B6 → #EC4899
 *   friend    → --purple-500 → --purple-400  (violet-500 → violet-400)
 *   colleague → --green-500  → --green-600
 *   other     → the ink ramp
 */
export function ContactAvatar({
  name,
  group = 'other',
  size = 44,
}: {
  name: string
  group?: ContactGroupTone
  size?: number
}) {
  const theme = useTheme()
  const glyph = name.trim().charAt(0) || '?'

  const colors = avatarGradient(group, theme)
  const style = { width: size, height: size, borderRadius: size / 2 }

  if (!colors) {
    return (
      <View style={[styles.avatar, style, { backgroundColor: theme.colors.ink[400] }]}>
        <Text style={[styles.glyph, { fontSize: size * 0.34 }]}>{glyph}</Text>
      </View>
    )
  }

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, style]}
    >
      <Text style={[styles.glyph, { fontSize: size * 0.34 }]}>{glyph}</Text>
    </LinearGradient>
  )
}

function avatarGradient(
  group: ContactGroupTone,
  theme: ReturnType<typeof useTheme>,
): [string, string] | null {
  switch (group) {
    case 'family':
      return ['#F472B6', '#EC4899']
    case 'friend':
      return [theme.palette.violet[500], theme.palette.violet[400]]
    case 'colleague':
      return [theme.palette.green[500], theme.palette.green[600]]
    default:
      return null
  }
}

/**
 * `.contact-relationship` — the group pill under the contact's name.
 * family → #FCE7F3 / #BE185D, friend → violet-100 / violet-700,
 * colleague → green-100 / green-600.
 */
export function RelationshipPill({ group, label }: { group: ContactGroupTone; label: string }) {
  const theme = useTheme()

  const { bg, fg } =
    group === 'family'
      ? { bg: '#FCE7F3', fg: '#BE185D' }
      : group === 'friend'
        ? { bg: theme.palette.violet[100], fg: theme.palette.violet[700] }
        : group === 'colleague'
          ? { bg: theme.palette.green[100], fg: theme.palette.green[600] }
          : { bg: theme.colors.ink[100], fg: theme.colors.ink[700] }

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  )
}

/**
 * `.primary-star` — the read-only `★` marker that shows which contacts the
 * "share with all" toggle will reach.
 *
 * On the Location Sharing screen the star is **read-only**. On the Emergency
 * Contacts screen it toggles the primary flag.
 */
export function PrimaryStar({
  isPrimary,
  onPress,
  accessibilityLabel,
}: {
  isPrimary: boolean
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const theme = useTheme()
  const glyph = (
    <Text
      style={[styles.star, { color: isPrimary ? theme.palette.amber[600] : theme.colors.ink[300] }]}
    >
      ★
    </Text>
  )

  // Read-only on the Location Sharing screen; a button on the Emergency
  // Contacts screen, where it toggles the primary flag.
  if (!onPress) return glyph

  // The glyph is 13 dp; the tap target is padded to 48 dp without changing
  // the visual (FR-UX-4). A `Pressable` rather than a `Text` with an
  // `onPress`, because `Text` has no `hitSlop`.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.starHit}
    >
      {glyph}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  star: {
    fontSize: 13,
    marginLeft: 4,
  },
  starHit: {
    // The 48 dp tap target for a 13 dp glyph (FR-UX-4). The padding is
    // transparent, so the visual is unchanged.
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

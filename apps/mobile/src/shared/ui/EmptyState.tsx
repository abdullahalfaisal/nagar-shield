import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTheme } from '../theme'
import { Icon } from './Icon'

interface EmptyStateProps {
  icon: string
  title: string
  description?: string
  action?: { label: string; onPress: () => void }
  style?: ViewStyle
}

/**
 * The prototype has no dedicated empty-state component; this standardises the
 * pattern used across History (no reports in range), Alerts (no alerts) and
 * Emergency Contacts (no contacts saved).
 */
export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  const theme = useTheme()
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconTile, { backgroundColor: theme.colors.ink[100] }]}>
        <Icon name={icon} size={30} color={theme.colors.ink[400]} />
      </View>
      <Text
        style={{
          color: theme.colors.ink[950],
          fontSize: 15,
          fontWeight: theme.typography.weight.semibold,
          marginTop: 14,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: theme.colors.ink[500],
            fontSize: 13,
            marginTop: 6,
            textAlign: 'center',
            lineHeight: 19,
            paddingHorizontal: 32,
          }}
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        // A `Pressable` rather than a `Text` with an `onPress`, so the link
        // has a real 48 dp box. The text itself is unchanged — the padding
        // is transparent, so the visual is the prototype's 14 dp label.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.action}
        >
          <Text
            style={{
              color: theme.palette.violet[700],
              fontSize: 14,
              fontWeight: theme.typography.weight.semibold,
            }}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  iconTile: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    // The 48 dp tap target for a 14 dp label (FR-UX-4). The padding is
    // transparent, so the visual is unchanged.
    minHeight: 48,
    minWidth: 48,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

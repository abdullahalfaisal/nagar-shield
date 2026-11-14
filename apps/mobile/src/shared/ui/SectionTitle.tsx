import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTheme } from '../theme'

interface SectionTitleProps {
  title: string
  actionLabel?: string
  onActionPress?: () => void
}

/**
 * `.section-title` — 16/20 horizontal padding, 16 top / 12 bottom margin.
 * The optional trailing link is the prototype's `→`-style affordance.
 */
export function SectionTitle({ title, actionLabel, onActionPress }: SectionTitleProps) {
  const theme = useTheme()
  return (
    <View style={[styles.row, { paddingHorizontal: 20, marginTop: 16, marginBottom: 12 }]}>
      <Text
        style={{
          color: theme.colors.ink[950],
          fontSize: 16,
          fontWeight: theme.typography.weight.bold,
          letterSpacing: -0.01,
        }}
      >
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        // A `Pressable` rather than a `Text` with an `onPress`, so the link
        // has a real 48 dp box. The label itself is unchanged.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onActionPress}
          style={styles.action}
        >
          <Text
            style={{
              color: theme.palette.violet[700],
              fontSize: 13,
              fontWeight: theme.typography.weight.semibold,
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * `.quick-actions` — three-column grid with a 10 dp gap and 20 dp padding.
 * React Native has no CSS grid, so this lays the cards out with flex.
 */
export function QuickActionGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>
}

export function ActionCard({
  icon,
  label,
  sub,
  tone = 'purple',
  onPress,
  style,
}: {
  icon: string
  label: string
  sub?: string
  tone?: 'purple' | 'red' | 'green' | 'amber' | 'sky'
  onPress?: () => void
  style?: ViewStyle
}) {
  const theme = useTheme()
  const { bg, fg } = actionTone(tone, theme)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
          borderRadius: theme.radius.xl,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: bg }]}>
        <Text
          style={{
            fontSize: 22,
            color: fg,
            fontFamily: 'MaterialSymbolsRounded400RegularFilled',
          }}
        >
          {icon}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: theme.typography.weight.semibold,
          color: theme.colors.ink[950],
          letterSpacing: -0.01,
        }}
      >
        {label}
      </Text>
      {sub ? (
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: theme.typography.weight.medium,
            color: theme.colors.ink[500],
          }}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  )
}

/**
 * `.action-card` — the prototype's name for the quick-action grid item. The
 * story's primitive list calls it `QuickActionCard`; the app has always
 * imported it as `ActionCard`, so both names point at the same component.
 */
export const QuickActionCard = ActionCard

function actionTone(tone: string, theme: ReturnType<typeof useTheme>) {
  switch (tone) {
    case 'red':
      return { bg: theme.palette.red[100], fg: theme.palette.red[600] }
    case 'green':
      return { bg: theme.palette.green[100], fg: theme.palette.green[700] }
    case 'amber':
      return { bg: theme.palette.amber[100], fg: theme.palette.amber[600] }
    case 'sky':
      return { bg: theme.palette.sky[100], fg: theme.palette.sky[600] }
    default:
      return { bg: theme.palette.violet[100], fg: theme.palette.violet[700] }
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
  },
  action: {
    // The 48 dp tap target for a 13 dp label (FR-UX-4). The padding is
    // transparent, so the visual is unchanged.
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '31.6%',
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
})

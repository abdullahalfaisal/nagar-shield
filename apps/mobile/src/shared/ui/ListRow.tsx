import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTheme } from '../theme'
import { Icon } from './Icon'
import { usePressGuard } from './usePressGuard'

export type IconTone = 'purple' | 'red' | 'green' | 'amber' | 'sky' | 'gray'

interface ListRowProps {
  title: string
  subtitle?: string
  icon?: string
  tone?: IconTone
  onPress?: () => void
  /** Trailing badge, e.g. the unread count on More Options. */
  badge?: { text: string; background: string; color: string }
  /** Shows the `arrow_forward_ios` chevron. */
  showArrow?: boolean
  /** Custom trailing slot — a toggle, a switch, a badge. */
  trailing?: React.ReactNode
  style?: ViewStyle
  accessibilityLabel?: string
}

/**
 * `.list-row` — 14/16 padding, 14 gap, 38 dp icon tile, hairline top border.
 * The prototype's first row has no top border; the list container handles that.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  tone = 'gray',
  onPress,
  badge,
  showArrow = true,
  trailing,
  style,
  accessibilityLabel,
}: ListRowProps) {
  const theme = useTheme()
  const press = usePressGuard(onPress)

  const content = (
    <>
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: toneBg(tone, theme) }]}>
          <Icon name={icon} size={20} color={toneFg(tone, theme)} filled />
        </View>
      ) : null}
      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: theme.colors.ink[950],
              fontSize: 14.5,
              fontWeight: theme.typography.weight.semibold,
            },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.ink[500],
              fontSize: theme.typography.size.md,
              marginTop: 1,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View
          style={{
            backgroundColor: badge.background,
            borderRadius: theme.radius.pill,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{ color: badge.color, fontSize: 11, fontWeight: theme.typography.weight.bold }}
          >
            {badge.text}
          </Text>
        </View>
      ) : null}
      {trailing}
      {showArrow ? <Icon name="arrow_forward_ios" size={18} color={theme.colors.ink[400]} /> : null}
    </>
  )

  if (!onPress) {
    return <View style={[styles.row, style]}>{content}</View>
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={press}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.palette.violet[25] },
        style,
      ]}
    >
      {content}
    </Pressable>
  )
}

function toneBg(tone: IconTone, theme: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'purple':
      return theme.palette.violet[100]
    case 'red':
      return theme.palette.red[100]
    case 'green':
      return theme.palette.green[100]
    case 'amber':
      return theme.palette.amber[100]
    case 'sky':
      return theme.palette.sky[100]
    default:
      return theme.colors.ink[100]
  }
}

function toneFg(tone: IconTone, theme: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'purple':
      return theme.palette.violet[700]
    case 'red':
      return theme.palette.red[600]
    case 'green':
      return theme.palette.green[700]
    case 'amber':
      return theme.palette.amber[600]
    case 'sky':
      return theme.palette.sky[600]
    default:
      return theme.colors.ink[700]
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    letterSpacing: -0.01,
  },
})

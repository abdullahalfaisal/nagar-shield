import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Icon } from './Icon'

/** `.badge-dot` — the red notification dot on the More Options button. */
const BADGE_DOT_COLOR = '#EF4444'

interface AppBarProps {
  title: string
  subtitle?: string
  onBack?: () => void
  /** Right-hand action, e.g. the Home screen's `more_horiz` button. */
  action?: { icon: string; onPress: () => void; accessibilityLabel: string; badge?: boolean }
  /** `.app-bar-no-border` — used by the Capture screen. */
  noBorder?: boolean
  transparent?: boolean
  /** Centres the title instead of left-aligning it (Capture screen). */
  centered?: boolean
}

/**
 * `.app-bar` — translucent background (`--app-bar-bg`), 10/16/14 padding,
 * bottom hairline in `--ink-100`.
 *
 * React Native has no `backdrop-filter`, so the translucency is approximated
 * with a semi-opaque background colour. On Android this reads the same because
 * the app bar sits on a flat surface.
 */
export function AppBar({
  title,
  subtitle,
  onBack,
  action,
  noBorder = false,
  transparent = false,
  centered = false,
}: AppBarProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: 10,
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: transparent ? 'transparent' : theme.colors.appBarBg,
          borderBottomWidth: noBorder ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.ink[100],
          marginTop: insets.top,
        },
      ]}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            { borderRadius: theme.radius.md },
            pressed && { backgroundColor: theme.palette.violet[50] },
          ]}
        >
          <Icon name="arrow_back" size={22} color={theme.palette.violet[700]} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}

      <View style={centered ? styles.centeredTitle : styles.titleBlock}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: theme.colors.ink[950],
              fontSize: 17,
              fontWeight: theme.typography.weight.bold,
            },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.ink[500], fontSize: theme.typography.size.sm }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            { borderRadius: theme.radius.md },
            pressed && { backgroundColor: theme.colors.ink[50] },
          ]}
        >
          <Icon name={action.icon} size={22} color={theme.colors.ink[700]} />
          {action.badge ? <View style={styles.badgeDot} /> : null}
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    paddingHorizontal: 8,
  },
  centeredTitle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  title: {
    letterSpacing: -0.01,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: BADGE_DOT_COLOR,
  },
})

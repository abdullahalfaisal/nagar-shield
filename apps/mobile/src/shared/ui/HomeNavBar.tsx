import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { withAlpha } from './AlertCard'
import { LineIcon, type LineIconName } from './LineIcon'
import { surfaceShadow } from './surface'
import { usePressGuard } from './usePressGuard'

export interface NavAction {
  key: string
  icon: LineIconName
  label: string
  /** The one main action gets a solid violet pill; the others a bare icon. */
  primary?: boolean
  onPress: () => void
}

/** Home's bottom bar: five quick actions in one oval capsule, Report Crime filled. */
export function HomeNavBar({ actions }: { actions: NavAction[] }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.outer, { paddingBottom: 8 + insets.bottom }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor: theme.colors.ink[100],
          },
        ]}
      >
        {actions.map((action) => (
          <NavItem key={action.key} action={action} />
        ))}
      </View>
    </View>
  )
}

function NavItem({ action }: { action: NavAction }) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const press = usePressGuard(action.onPress)
  const dark = theme.colors.isDark

  const glyph = action.primary
    ? dark
      ? theme.palette.violet[950]
      : theme.staticColors.white
    : theme.colors.ink[600]
  const pill = action.primary
    ? dark
      ? theme.palette.violet[500]
      : theme.palette.violet[700]
    : null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label.replace('\n', ' ')}
      onPress={press}
      style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.pill, pill ? { backgroundColor: pill } : null]}>
        <LineIcon
          name={action.icon}
          size={26}
          color={glyph}
          strokeWidth={1.9}
          duotone={action.primary ? undefined : withAlpha(glyph, dark ? 0.26 : 0.14)}
        />
      </View>
      <Text
        numberOfLines={2}
        style={[
          styles.label,
          {
            color: theme.colors.ink[950],
            fontFamily: appFont(action.primary ? 'bold' : 'semibold', i18n.language),
          },
        ]}
      >
        {twoLines(action.label)}
      </Text>
    </Pressable>
  )
}

/**
 * Breaks a label onto two lines at the space nearest its middle, so "Report
 * Crime" wraps instead of shrinking to fit one line.
 */
function twoLines(label: string): string {
  const mid = label.length / 2
  let best = -1
  for (let i = 0; i < label.length; i += 1) {
    if (label[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  return best === -1
    ? label
    : `${label.slice(0, best)}
${label.slice(best + 1)}`
}

const styles = StyleSheet.create({
  outer: {
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  // One oval capsule: fully rounded ends, floating just above the bottom edge.
  bar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 36,
    borderWidth: 1,
    ...surfaceShadow,
    shadowOpacity: 0.14,
    elevation: 6,
  },
  item: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    width: 64,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    // Two lines are always reserved, so the labels sit on one baseline.
    minHeight: 28,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
})

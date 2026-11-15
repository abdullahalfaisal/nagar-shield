import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { mixHex } from '../theme/colorMix'
import { withAlpha } from './AlertCard'
import { SolidIcon, type SolidIconName } from './SolidIcon'
import { surfaceShadow } from './surface'
import { usePressGuard } from './usePressGuard'

/** The accent of a tile. Red is left out: it belongs to emergency help. */
export type QuickActionColor = 'violet' | 'green' | 'amber' | 'sky'

export interface QuickAction {
  key: string
  icon: SolidIconName
  color: QuickActionColor
  label: string
  /** The one main action gets a solid tile; the others a soft tint. */
  solid?: boolean
  onPress: () => void
}

/**
 * The Home screen's shortcuts: four icons together in one card, each with the
 * full name of what it does underneath.
 *
 * The icons are solid and flat. Report Crime is the main action, so its tile is
 * filled; the other three sit on a soft tint of their own accent. There are no
 * gradients or glows, so nothing competes with the red help banner above.
 */
export function QuickActionRow({ actions }: { actions: QuickAction[] }) {
  const theme = useTheme()

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface.white, borderRadius: theme.radius.lg },
      ]}
    >
      {actions.map((action) => (
        <QuickActionTile key={action.key} action={action} />
      ))}
    </View>
  )
}

function QuickActionTile({ action }: { action: QuickAction }) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const press = usePressGuard(action.onPress)
  const dark = theme.colors.isDark
  const { palette } = theme

  // One accent per colour name, picked so the glyph reads on its own tint in
  // each theme.
  const accents: Record<QuickActionColor, string> = dark
    ? {
        violet: palette.violet[400],
        green: palette.green[500],
        amber: palette.amber[500],
        sky: palette.sky[600],
      }
    : {
        violet: palette.violet[700],
        green: palette.green[700],
        amber: palette.amber[600],
        sky: palette.sky[600],
      }
  const accent = accents[action.color]

  let background: string
  let glyph: string
  if (action.solid) {
    background = dark ? palette.violet[500] : palette.violet[700]
    glyph = dark ? palette.violet[950] : theme.staticColors.white
  } else {
    background = withAlpha(accent, dark ? 0.26 : 0.13)
    glyph = dark ? mixHex(accent, theme.staticColors.white, 0.3) : accent
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={press}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.iconWell, { backgroundColor: background }]}>
        <SolidIcon name={action.icon} size={28} color={glyph} />
      </View>
      <Text
        numberOfLines={2}
        style={[
          styles.label,
          { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
        ]}
      >
        {action.label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 8,
    ...surfaceShadow,
  },
  tile: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 3,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    // Two lines are always reserved, so the four labels sit on one baseline
    // whether a name takes one line or two.
    minHeight: 32,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
})

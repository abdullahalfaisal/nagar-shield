import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { appFont } from '../theme/appFont'
import { useTranslation } from 'react-i18next'
import { withAlpha } from './AlertCard'
import { Button } from './Button'
import { SolidIcon, type SolidIconName } from './SolidIcon'
import { surfaceShadow } from './surface'

interface StateCardProps {
  icon: SolidIconName
  tone?: 'violet' | 'danger'
  title: string
  body: string
  /** One button under the text, if the person can do something about it. */
  action?: { label: string; icon: string; onPress: () => void }
}

/**
 * A card for an empty list or a failed load: a tinted tile with a glyph, a
 * title, one line of help and at most one button.
 */
export function StateCard({ icon, tone = 'violet', title, body, action }: StateCardProps) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const step = theme.colors.isDark ? 400 : 700
  const color =
    tone === 'danger'
      ? theme.palette.red[theme.colors.isDark ? 500 : 700]
      : theme.palette.violet[step]

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
      <View style={[styles.tile, { backgroundColor: withAlpha(color, 0.12) }]}>
        <SolidIcon name={icon} size={30} color={color} />
      </View>
      <Text
        style={[
          styles.title,
          { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.body,
          { color: theme.colors.textMuted, fontFamily: appFont('regular', i18n.language) },
        ]}
      >
        {body}
      </Text>
      {action ? (
        <Button
          label={action.label}
          icon={action.icon}
          variant="secondary"
          size="md"
          onPress={action.onPress}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    paddingTop: 24,
    borderRadius: 18,
    alignItems: 'stretch',
    ...surfaceShadow,
  },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  body: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
})

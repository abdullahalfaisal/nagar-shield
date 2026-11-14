import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Icon } from './Icon'

/**
 * The offline indication for a cached feed.
 *
 * The story's promise is *"the offline behaviour is a cached page, not an empty
 * screen"*: when the network is down the feed renders the **last cached page**
 * with an offline indication, and it never blanks the list. The indication is
 * therefore a quiet line above the rows — not a toast, not a dialog, and not
 * an empty state.
 *
 * Two things are deliberately **not** claimed here:
 *
 *   * the rows are **not** stamped with a time — the copy says "the last
 *     results", which is true without having to compute how stale they are;
 *   * the app does **not** claim the data is current, because it may not be.
 *     An offline feed says what it has, not what it knows.
 *
 * The banner sits on the ink ramp rather than a coloured palette, because a
 * connectivity notice is a state the app is in — and a state does not shout.
 */
export function OfflineNotice() {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={t('alerts.offline')}
      style={[styles.row, { borderColor: theme.colors.ink[200] }]}
    >
      <Icon name="cloud_off" size={16} color={theme.colors.ink[500]} />
      <Text style={[styles.text, { color: theme.colors.ink[500] }]}>{t('alerts.offline')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
})

import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { Icon } from './Icon'

/**
 * The configuration-error screen.
 *
 * The app is missing its Supabase credentials. That is a **build** fault — a
 * mis-built bundle — and not something the person holding the phone can fix
 * or caused.
 *
 * The module used to `throw` at import time, which took the whole app down
 * before a single screen rendered: a red-screen crash on every route, because
 * twenty-two modules import the Supabase client. The failure is now
 * **localised** to this screen.
 *
 * The copy says what happened and what to do, and it does **not** blame the
 * user. It never names the missing environment variables — that is a
 * developer's detail, and putting it on the screen would only tell a user
 * something they cannot act on.
 */
export function ConfigErrorView() {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface.lavender }]}>
      <View style={[styles.iconTile, { backgroundColor: theme.colors.ink[100] }]}>
        <Icon name="error" size={30} color={theme.palette.red[600]} />
      </View>

      <Text
        style={{
          color: theme.colors.ink[950],
          fontSize: 17,
          fontWeight: theme.typography.weight.bold,
          marginTop: 16,
          textAlign: 'center',
        }}
      >
        {t('config.title')}
      </Text>

      <Text
        style={{
          color: theme.colors.ink[600],
          fontSize: 14,
          lineHeight: 21,
          marginTop: 8,
          textAlign: 'center',
          paddingHorizontal: 28,
        }}
      >
        {t('config.message')}
      </Text>

      <Text
        style={{
          color: theme.colors.ink[400],
          fontSize: 12,
          lineHeight: 18,
          marginTop: 18,
          textAlign: 'center',
          paddingHorizontal: 40,
        }}
      >
        {t('config.detail')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Button, WizardBadge, WizardScreen } from '@/shared/ui'

/**
 * Screen 1 — S-00 Welcome.
 *
 * The prototype shows English copy on this screen ("Welcome to Nagar
 * Shield", "New here? Let's set up your safety profile…"). The build uses the
 * localised Bangla copy — the layout, the badge, the divider row and the two
 * CTAs are ported 1:1.
 */
export default function WelcomeScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <WizardScreen
      footer={
        <>
          <Button
            label={t('auth.getStarted')}
            variant="primary"
            size="lg"
            onPress={() => router.push('/(auth)/phone')}
          />
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.ink[200] }]} />
            <Text style={[styles.dividerText, { color: theme.colors.ink[500] }]}>
              {t('common.appName')}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.colors.ink[200] }]} />
          </View>
          <Button
            label={t('auth.signIn')}
            variant="secondary"
            size="lg"
            onPress={() => router.push('/(auth)/login')}
          />
          <View style={styles.footnoteRow}>
            <Text style={[styles.footnote, { color: theme.colors.ink[500] }]}>
              {t('auth.noAccount')}{' '}
            </Text>
            <Text
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/register')}
              style={[styles.link, { color: theme.palette.violet[500] }]}
            >
              {t('auth.createAccount')}
            </Text>
          </View>
        </>
      }
    >
      <View style={styles.center}>
        <WizardBadge icon="shield" />
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
          {t('auth.welcomeTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {t('auth.welcomeSubtitle')}
        </Text>
        <View style={styles.whatYouAdd}>
          <Text style={[styles.label, { color: theme.colors.ink[500] }]}>
            {t('home.helpSubtitle')}
          </Text>
          <Text style={[styles.list, { color: theme.colors.ink[700] }]}>
            {t('auth.phoneLabel')} · {t('auth.alternatePhoneTitle')} · {t('more.emergencyContacts')}{' '}
            · {t('capture.locationOn')}
          </Text>
        </View>
      </View>
    </WizardScreen>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.52,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 18,
  },
  whatYouAdd: {
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  list: {
    fontSize: 13,
    lineHeight: 22,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  footnote: {
    fontSize: 13,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
  },
})

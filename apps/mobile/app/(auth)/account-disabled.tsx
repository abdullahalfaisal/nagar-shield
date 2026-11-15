import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Button, WizardScreen } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { softDeleteAccount } from '@/shared/api/account'
import { logOut } from '@/shared/auth/authService'

/**
 * Screen — Account Disabled.
 *
 * `002-identity / 005-remote-account-disable` AC #2: when an account is
 * disabled, "any API write is attempted → rejected with `AUTH_DISABLED`
 * (HTTP 403)".
 *
 * The database now enforces that (migration 019 — every client write policy
 * and every SECURITY DEFINER RPC refuses a disabled account). This screen is
 * the other half: the app must **notice** the disable and explain it, rather
 * than letting the user press buttons that will fail.
 *
 * The screen offers exactly two things:
 *
 *   * **Delete the account.** The database deliberately keeps
 *     `soft_delete_account` reachable for a disabled account — a disable is a
 *     moderation action, and the user must still be able to ask for their
 *     own data to be removed. Guarding it would make the disable a
 *     permanent imprisonment with no exit.
 *
 *   * **Sign out.** The local session is ended so the app stops offering
 *     writes the database will refuse.
 *
 * It deliberately does NOT offer "appeal" or "restore": re-enabling an
 * account is a moderator's decision, made in the admin console.
 */
export default function AccountDisabledScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const onDelete = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await softDeleteAccount()
      await logOut()
      router.replace('/(auth)/welcome')
    } catch {
      setError(t('errors.internal'))
      setBusy(false)
    }
  }

  // Deleting is destructive, so it asks first. The body says what happens: the
  // account is kept for 30 days, then removed.
  const confirmDelete = () => {
    Alert.alert(t('disabled.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.deleteConfirm'), style: 'destructive', onPress: () => void onDelete() },
    ])
  }

  const onSignOut = async () => {
    setBusy(true)
    try {
      await logOut()
      router.replace('/(auth)/welcome')
    } catch {
      setError(t('errors.internal'))
      setBusy(false)
    }
  }

  return (
    <WizardScreen
      eyebrow={t('errors.authDisabled')}
      title={t('disabled.title')}
      subtitle={t('disabled.message')}
      footer={
        <>
          <Button
            label={t('disabled.signOut')}
            variant="primary"
            size="lg"
            disabled={busy}
            onPress={onSignOut}
          />
          <Button
            label={t('disabled.deleteTitle')}
            variant="secondary"
            size="lg"
            disabled={busy}
            onPress={confirmDelete}
          />
        </>
      }
    >
      <View style={styles.noticeRow}>
        <Icon name="block" size={18} color={theme.palette.red[600]} />
        <Text style={[styles.noticeText, { color: theme.colors.ink[600] }]}>
          {t('disabled.subtitle')}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.ink[950] }]}>
        {t('disabled.whatYouCanDo')}
      </Text>

      <View style={[styles.card, { backgroundColor: theme.colors.surface.white }]}>
        <Icon name="delete" size={20} color={theme.palette.red[600]} />
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, { color: theme.colors.ink[950] }]}>
            {t('disabled.deleteTitle')}
          </Text>
          <Text style={[styles.cardBody, { color: theme.colors.ink[500] }]}>
            {t('disabled.deleteBody')}
          </Text>
        </View>
      </View>

      <Text style={[styles.support, { color: theme.colors.textMuted }]}>
        {t('disabled.support')}
      </Text>

      {busy ? (
        <ActivityIndicator
          style={styles.spinner}
          color={theme.palette.violet[600]}
          accessibilityLabel={t('common.loading')}
        />
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: theme.palette.red[600] }]}>{error}</Text>
      ) : null}
    </WizardScreen>
  )
}

const styles = StyleSheet.create({
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  cardBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  support: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
  spinner: {
    marginTop: 18,
  },
  error: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
})

import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Button, WizardScreen } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { restoreAccount } from '@/shared/api/account'
import { logOut } from '@/shared/auth/authService'

/**
 * Screen — Account Deleted.
 *
 * The counterpart to `account-disabled`: the account is inside its 30-day
 * recovery window, so the data is still there and the user can take it back.
 *
 * The app must not simply ignore the delete. A soft-deleted account that
 * signs in again still has a session, and the database will refuse its
 * writes — the same trap the disable screen exists to avoid. But unlike a
 * disable, a delete is the **user's own** decision, and it is reversible
 * inside the window. So this screen offers the one action that matters:
 * restore.
 *
 * Restoring clears `deleted_at` and the account becomes fully usable again —
 * the reports it authored are never touched by the delete (FR-DATA-3 keeps
 * the identity server-side for moderation).
 */
export default function AccountDeletedScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const onRestore = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await restoreAccount()
      router.replace('/(app)/home')
    } catch {
      // The RPC raises CONFLICT when there is nothing to restore — the
      // window has closed and the purge job has taken the row.
      setError(t('errors.internal'))
      setBusy(false)
    }
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
      eyebrow={t('settings.deleteAccount')}
      title={t('disabled.deletedTitle')}
      subtitle={t('disabled.deletedBody')}
      footer={
        <>
          <Button
            label={t('disabled.restore')}
            variant="primary"
            size="lg"
            disabled={busy}
            onPress={onRestore}
          />
          <Button
            label={t('disabled.signOut')}
            variant="secondary"
            size="lg"
            disabled={busy}
            onPress={onSignOut}
          />
        </>
      }
    >
      <View style={styles.noticeRow}>
        <Icon name="delete" size={18} color={theme.palette.amber[600]} />
        <Text style={[styles.noticeText, { color: theme.colors.ink[600] }]}>
          {t('disabled.deletedBody')}
        </Text>
      </View>

      <Text style={[styles.support, { color: theme.colors.ink[400] }]}>
        {t('settings.deleteWarning')}
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

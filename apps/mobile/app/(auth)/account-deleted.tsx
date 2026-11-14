import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import { Button, WizardScreen } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { restoreAccount } from '@/shared/api/account'
import { recoveryWindowSummary, restoreErrorCopy } from '@/shared/api/recovery-window'
import { logOut } from '@/shared/auth/authService'
import { useAccountStatus } from '@/shared/auth/useAccountStatus'
import { useAuthSession } from '@/shared/auth/useAuthSession'

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
 *
 * ## The window is stated, not implied
 *
 * "Sign in again within 30 days" is a rule, not a date. The user needs to
 * know **when** the promise runs out — the day it runs out is the day they
 * have to act. So the screen reads the deadline from the account row and
 * states it, and the Restore button is disabled once the window has closed.
 *
 * The screen is also honest about the failure. The RPC refuses an expired
 * restore with `VALIDATION_FAILED`; the citizen is told *"the recovery period
 * has ended"* rather than *"something went wrong"*, because the second is a
 * lie and the first is the answer.
 */
export default function AccountDeletedScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  const { session } = useAuthSession()
  const { recoverableUntil } = useAccountStatus(session?.user?.id)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const window = recoveryWindowSummary(recoverableUntil)
  const locale = i18n.language === 'bn' ? 'bn-BD' : 'en-GB'

  const onRestore = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await restoreAccount()
      router.replace('/(app)/home')
    } catch (caught) {
      setError(restoreErrorCopy(caught, t, window.open))
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
            disabled={busy || !window.open}
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

      {/*
        The deadline. The fact comes from the account row, so it is the
        server's own clock rather than the device's — and the device's clock
        is not the authority on when the promise runs out.
      */}
      {recoverableUntil ? (
        <View style={[styles.deadlineCard, { backgroundColor: theme.colors.surface.white }]}>
          <Icon
            name={window.open ? 'schedule' : 'block'}
            size={20}
            color={window.open ? theme.palette.violet[600] : theme.palette.red[600]}
          />
          <View style={styles.deadlineText}>
            <Text style={[styles.deadlineTitle, { color: theme.colors.ink[950] }]}>
              {window.open
                ? t('disabled.recoverableUntilDays', { count: window.daysLeft })
                : t('disabled.recoveryWindowClosed')}
            </Text>
            <Text style={[styles.deadlineBody, { color: theme.colors.ink[500] }]}>
              {new Date(recoverableUntil).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>
      ) : null}

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

/**
 * The message for a failed restore lives in `@/shared/api/recovery-window`,
 * beside the window rules it depends on — so it is a pure function of
 * (failure, window state) and can be tested against the real bundles
 * without a React tree.
 */

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
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    marginTop: 20,
  },
  deadlineText: {
    flex: 1,
  },
  deadlineTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  deadlineBody: {
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

import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppError, passwordSchema } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { AppBar, Button, InputField } from '@/shared/ui'
import { supabase } from '@/shared/api/supabase'
import {
  isRateLimited,
  readAttemptsRemaining,
  readRetryAfterSeconds,
  stagePasswordReset,
  takePendingReset,
  verifyPasswordResetOtp,
} from '@/shared/auth/passwordResetService'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * Screen 13c — the new-password step.
 *
 * The code was entered on the previous screen; this one collects the new
 * password and sends both together. The server checks the code, sets the
 * password and issues a session **in one operation**, so the user lands
 * signed in without a second credential entry.
 *
 * The failure modes, and what the user is told
 * --------------------------------------------
 *   * **The code was wrong** (`VALIDATION_FAILED`, with
 *     `details.attempts_remaining`). The screen says how many attempts are
 *     left and sends the user back to the code step. A wrong password is a
 *     different matter: the password policy is checked **client-side** first,
 *     so a password that is too short never reaches the server and never
 *     consumes one of the three attempts — the story's edge case: "the OTP is
 *     not consumed, so the user can retry with a compliant password".
 *
 *   * **The challenge is in cooldown** (`OTP_RATE_LIMIT`, with
 *     `details.retry_after_sec`). The screen shows the remaining wait and
 *     sends the user back. The wait comes from the **server**; the client
 *     never invents one.
 *
 *   * **The code expired** (ten minutes). Same treatment as a wrong code —
 *     the server's answer is the only thing that distinguishes them, and
 *     neither is worth telling apart from the user's side.
 *
 * No SMS
 * ------
 * `EXPO_PUBLIC_SMS_OTP_ENABLED` is off for Phase 1. No SMS option, no SMS
 * delivery claim and no carrier-charge copy is rendered here — there is no
 * branch in this screen that could show any.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  // The code and the identifier are read from the in-memory hand-off, not
  // from the route params — a URL ends up in navigation state and in any
  // route log, and the code is a credential.
  //
  // `takePendingReset` clears the hand-off as it reads it, so a second pass
  // through this screen cannot replay the code.
  const staged = useMemo(() => takePendingReset(), [])

  const identifier = staged?.identifier ?? ''
  const code = staged?.code ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  /**
   * Returns to the code step with the server's answer.
   *
   * The code is cleared there, because a consumed or rejected code is worth
   * re-entering — the user may have mistyped it, and the challenge may have
   * been superseded by a resend.
   *
   * The remaining wait and the remaining attempts travel back with it, so
   * the code step can show the server's numbers rather than guessing them.
   * Those are not secrets — they are the server's own answer about the
   * attempt counter — so they travel in the route params.
   *
   * The **identifier** does not: it is PII, so it goes back through the
   * in-memory hand-off. It is staged with an empty code, because there is no
   * code any more — the one that was typed was refused.
   */
  const backToCode = useCallback(
    (message: string, retryAfter?: number, attempts?: number) => {
      setFormError(message)
      stagePasswordReset(identifier, '')
      router.replace({
        pathname: '/(auth)/verify-otp',
        params: {
          ...(retryAfter !== undefined ? { retryAfter: String(retryAfter) } : {}),
          ...(attempts !== undefined ? { attemptsRemaining: String(attempts) } : {}),
        },
      })
    },
    [identifier, router],
  )

  const onSubmit = useCallback(async () => {
    const parsed = passwordSchema.safeParse(newPassword)

    const nextErrors: Record<string, string> = {}
    if (!parsed.success) nextErrors.newPassword = t('auth.passwordTooShort')
    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = t('auth.passwordsDoNotMatch')
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setFormError(undefined)

    try {
      const result = await verifyPasswordResetOtp(identifier, code, newPassword)

      // The server applied the password and issued a session. The client
      // adopts it, so the user is signed in without a second credential
      // entry.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      })

      if (sessionError) {
        // The password **was** changed — the server said so. The client
        // simply could not adopt the session. Sending the user to the login
        // screen is the honest outcome: they sign in with the new password
        // they just chose.
        router.replace('/(auth)/login')
        return
      }

      // The password is changed and the session is adopted. The `(app)`
      // group has no index route of its own, so the replace names a concrete
      // screen — Home — rather than the group.
      router.replace('/(app)/home')
    } catch (error) {
      const appError = error instanceof AppError ? error : null

      if (isRateLimited(error)) {
        const retryAfter = readRetryAfterSeconds(error)
        backToCode(
          retryAfter !== undefined
            ? t('auth.otpCooldown', { minutes: Math.ceil(retryAfter / 60) })
            : t('errors.otpRateLimit'),
          retryAfter,
        )
        return
      }

      if (appError?.code === 'VALIDATION_FAILED') {
        const remaining = readAttemptsRemaining(error)
        backToCode(
          remaining !== undefined
            ? t('auth.otpWrongAttempts', { count: remaining })
            : t('auth.otpWrong'),
          undefined,
          remaining,
        )
        return
      }

      setFormError(appError ? errorCopy(t, appError.code) : t('errors.internal'))
    } finally {
      setSubmitting(false)
    }
  }, [backToCode, code, confirmPassword, identifier, newPassword, router, t])

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('auth.accountRecovery')} onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
          {t('auth.newPasswordTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {t('auth.newPasswordSubtitle')}
        </Text>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
          </View>
        ) : null}

        <InputField
          label={t('auth.newPasswordTitle')}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          textContentType="newPassword"
          icon="lock"
          helper={t('auth.passwordPolicyHint')}
          error={errors.newPassword}
          testID="reset-new-password"
        />

        <InputField
          label={t('auth.confirmPasswordTitle')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          icon="lock"
          error={errors.confirmPassword}
          testID="reset-confirm-password"
        />

        <Button
          label={submitting ? t('capture.submitting') : t('auth.resetPasswordCta')}
          variant="primary"
          size="lg"
          disabled={newPassword.length === 0 || submitting}
          onPress={onSubmit}
          style={styles.cta}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.52,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cta: {
    marginTop: 20,
  },
})

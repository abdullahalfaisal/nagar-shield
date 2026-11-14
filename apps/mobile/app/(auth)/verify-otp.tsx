import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppError, otpCodeSchema } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { AppBar, Button, InputField } from '@/shared/ui'
import {
  clearPendingReset,
  peekPendingReset,
  sendPasswordResetOtp,
  stagePasswordReset,
} from '@/shared/auth/passwordResetService'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * Screen 13b — the reset-code entry step.
 *
 * The user has asked for a password-reset code; this is where they type it.
 * The code is six digits, and it is compared **server-side** — the client
 * never decides whether a code is right.
 *
 * What this screen must not do
 * ----------------------------
 *   * **It must not claim the code was delivered.** Email deliverability on
 *     a free tier is not guaranteed, so the copy says a code was *sent* and
 *     never says it *arrived*. This is the story's edge case: "the app never
 *     states the email was delivered and never claims the code was received".
 *
 *   * **It must not offer SMS.** `EXPO_PUBLIC_SMS_OTP_ENABLED` is off for
 *     Phase 1, and no SMS option, no SMS copy and no carrier-charge
 *     disclosure is rendered here at all. The channel is email only.
 *
 *   * **It must not become the authority.** The countdown below mirrors the
 *     server's cooldown; it never replaces it. A client that skips the
 *     countdown still gets rejected, and the rejection carries the remaining
 *     wait in `details.retry_after_sec` — which is where the countdown is
 *     seeded from.
 *
 * The client-side 6-digit check
 * -----------------------------
 * A malformed code is refused here, before the request is sent, so a typo
 * never consumes one of the three server-side attempts. The story's edge-case
 * table says so: "rejected client-side by the shared OTP schema; no attempt
 * is consumed server-side".
 *
 * The code is a **string** throughout. `000123` is a valid code, and
 * `parseInt` would turn it into `123` — a different code.
 */
export default function VerifyOtpScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()
  const params = useLocalSearchParams<{
    /** The server's remaining cooldown, in seconds. */
    retryAfter?: string
    /** The server's remaining attempts. */
    attemptsRemaining?: string
  }>()

  // The identifier is read from the in-memory hand-off, not from the route
  // params: it is PII, and a route param is part of a URL.
  //
  // The hand-off is **peeked**, not taken — the identifier has to survive the
  // round trip to the password step and back again, so it is read without
  // being consumed. The code is not read here at all.
  const identifier = useMemo(() => peekPendingReset()?.identifier ?? '', [])

  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [sending, setSending] = useState(false)

  // The cooldown, mirrored from the server. `null` means "no cooldown".
  //
  // The seed comes from the route params, because the server's answer to the
  // previous attempt is the only authority on the wait. The user is sent
  // back here from the password step carrying that answer.
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(() => {
    const value = Number(params.retryAfter)
    return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
  })

  const [attemptsRemaining, setAttemptsRemaining] = useState<number | undefined>(() => {
    const value = Number(params.attemptsRemaining)
    return Number.isFinite(value) ? value : undefined
  })

  // The 10-minute validity window, mirrored from the server's answer.
  //
  // It is seeded on mount: the code the user is about to type was issued
  // moments ago, so the window starts now. The countdown is a **mirror** —
  // it is the server that decides whether a code has expired.
  const [validitySeconds, setValiditySeconds] = useState<number | null>(10 * 60)

  /**
   * Ticks the mirrored countdown.
   *
   * The countdown is a **mirror**, not a gate: it stops the button being
   * pressed for no reason, and it never rejects anything on its own. The
   * server's answer is the only thing that decides.
   */
  useEffect(() => {
    if (cooldownSeconds === null || cooldownSeconds <= 0) return

    const timer = setInterval(() => {
      setCooldownSeconds((current) => {
        if (current === null) return null
        const next = current - 1
        return next <= 0 ? null : next
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [cooldownSeconds])

  useEffect(() => {
    if (validitySeconds === null || validitySeconds <= 0) return

    const timer = setInterval(() => {
      setValiditySeconds((current) => {
        if (current === null) return null
        const next = current - 1
        return next <= 0 ? null : next
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [validitySeconds])

  const inCooldown = cooldownSeconds !== null && cooldownSeconds > 0

  const onVerify = useCallback(async () => {
    const parsed = otpCodeSchema.safeParse(code)

    if (!parsed.success) {
      setErrors({ code: t('auth.otpCodeInvalid') })
      return
    }

    setErrors({})
    setSubmitting(true)
    setFormError(undefined)

    try {
      // The code is checked, the password is set and the session is issued by
      // the server, in one operation — so the code is carried forward to the
      // next step rather than checked here.
      //
      // It is carried **in memory**, not in the route params. A route param
      // is part of a URL, and a URL ends up in navigation state and in any
      // route log; the code is a credential. `stagePasswordReset` keeps it in
      // the module's memory and nowhere else.
      //
      // It is still never the client's decision: the server compares it
      // against the challenge's bcrypt hash whatever the client says.
      stagePasswordReset(identifier, parsed.data)
      router.push('/(auth)/reset-password')
    } finally {
      setSubmitting(false)
    }
  }, [code, identifier, router, t])

  const onResend = useCallback(async () => {
    setSending(true)
    setFormError(undefined)

    try {
      await sendPasswordResetOtp(identifier)

      // A fresh code supersedes the old one. The server's window restarts
      // with it, so the mirror restarts too — and any code that was staged
      // for the password step is now a code the server has already
      // superseded, so it is discarded.
      clearPendingReset()
      setValiditySeconds(10 * 60)
      setCooldownSeconds(null)
      setAttemptsRemaining(undefined)
      setCode('')
    } catch (error) {
      const appError = error instanceof AppError ? error : null
      setFormError(appError ? errorCopy(t, appError.code) : t('errors.internal'))
    } finally {
      setSending(false)
    }
  }, [identifier, t])

  const validityLabel = useMemo(() => {
    if (validitySeconds === null) return null
    const minutes = Math.floor(validitySeconds / 60)
    const seconds = validitySeconds % 60
    return t('auth.otpExpiresIn', {
      minutes,
      seconds: String(seconds).padStart(2, '0'),
    })
  }, [t, validitySeconds])

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('auth.accountRecovery')} onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>{t('auth.otpTitle')}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {t('auth.otpEmailSubtitle')}
        </Text>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
          </View>
        ) : null}

        {inCooldown ? (
          <View style={[styles.cooldownBanner, { backgroundColor: theme.palette.amber[50] }]}>
            <Text style={{ color: theme.palette.amber[600], fontSize: 13 }}>
              {t('auth.otpCooldown', {
                minutes: Math.ceil((cooldownSeconds ?? 0) / 60),
              })}
            </Text>
          </View>
        ) : null}

        <InputField
          label={t('auth.otpLabel')}
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          icon="lock"
          helper={validityLabel ?? undefined}
          error={errors.code}
          testID="reset-otp-code"
        />

        {attemptsRemaining !== undefined ? (
          <Text style={[styles.attempts, { color: theme.colors.ink[500] }]}>
            {t('auth.otpAttemptsRemaining', { count: attemptsRemaining })}
          </Text>
        ) : null}

        <Button
          label={submitting ? t('capture.submitting') : t('auth.verifyCta')}
          variant="primary"
          size="lg"
          disabled={inCooldown || code.length !== 6 || submitting}
          onPress={onVerify}
          style={styles.cta}
        />

        <Text
          accessibilityRole="button"
          onPress={onResend}
          style={[styles.resend, { color: theme.palette.violet[700] }]}
        >
          {sending ? t('capture.submitting') : t('auth.resendOtp')}
        </Text>
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
  cooldownBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  attempts: {
    fontSize: 12,
    marginTop: 8,
  },
  cta: {
    marginTop: 20,
  },
  resend: {
    alignSelf: 'center',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 12,
  },
})

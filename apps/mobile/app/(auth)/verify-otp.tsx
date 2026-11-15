import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppError, otpCodeSchema } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { AppBar, Button, InputField, KeyboardScroll, useToast } from '@/shared/ui'
import {
  clearPendingReset,
  isRateLimited,
  isResetNetworkError,
  isValidityMilestone,
  parseResetNotice,
  peekPendingReset,
  readRetryAfterSeconds,
  remainingValiditySeconds,
  sendPasswordResetOtp,
  stagePasswordReset,
} from '@/shared/auth/passwordResetService'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * How long Resend stays greyed after a code was sent. It only spares the user
 * an accidental double tap; the server's own limits are what actually apply.
 */
const RESEND_COOLDOWN_SECONDS = 30

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
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const params = useLocalSearchParams<{
    /** The server's remaining cooldown, in seconds. */
    retryAfter?: string
    /** The server's remaining attempts. */
    attemptsRemaining?: string
    /** Why the user was sent back here: a key, rendered in the banner. */
    notice?: string
  }>()
  const toast = useToast()

  // The identifier is read from the in-memory hand-off, not from the route
  // params: it is PII, and a route param is part of a URL.
  //
  // The hand-off is **peeked**, not taken — the identifier has to survive the
  // round trip to the password step and back again, so it is read without
  // being consumed. The code is not read here at all.
  const staged = useMemo(() => peekPendingReset(), [])
  const identifier = staged?.identifier ?? ''

  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>(() => {
    // The notice is the reason the password step sent the user back. It is
    // shown here because that screen unmounts and takes its own message along.
    const notice = parseResetNotice(params.notice)
    const attempts = Number(params.attemptsRemaining)
    if (notice === 'wrong') {
      return params.attemptsRemaining !== undefined && Number.isFinite(attempts)
        ? t('auth.otpWrongAttempts', { count: attempts })
        : t('auth.otpWrong')
    }
    // With a wait the server sent, the cooldown banner already says it.
    if (notice === 'rateLimited' && !(Number(params.retryAfter) > 0)) {
      return t('errors.otpRateLimit')
    }
    return undefined
  })
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

  // The 10-minute validity window, mirrored from when the code was issued.
  //
  // The issue time rides the hand-off, so coming back from the password step
  // does not restart the window at 10:00. Without one (the hand-off was lost)
  // the window starts now. The countdown is a **mirror** — it is the server
  // that decides whether a code has expired.
  const [issuedAt, setIssuedAt] = useState<number>(() => staged?.issuedAt ?? Date.now())
  const [now, setNow] = useState(() => Date.now())
  const validitySeconds = remainingValiditySeconds(issuedAt, now)
  const expired = validitySeconds <= 0

  // The wait before Resend may be pressed again; `null` means none.
  const [resendWait, setResendWait] = useState<number | null>(null)

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

  // The clock reads the wall time each tick instead of counting ticks, so a
  // backgrounded app catches up when it returns.
  useEffect(() => {
    if (expired) return

    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expired])

  useEffect(() => {
    if (resendWait === null) return

    const timer = setTimeout(
      () => setResendWait((current) => (current && current > 1 ? current - 1 : null)),
      1000,
    )
    return () => clearTimeout(timer)
  }, [resendWait])

  // A screen reader hears the countdown at a few milestones, not every second.
  useEffect(() => {
    if (!isValidityMilestone(validitySeconds)) return

    void AccessibilityInfo.announceForAccessibility(
      validitySeconds === 0
        ? t('auth.otpExpired')
        : t('auth.otpExpiresIn', {
            minutes: Math.floor(validitySeconds / 60),
            seconds: String(validitySeconds % 60).padStart(2, '0'),
          }),
    )
  }, [t, validitySeconds])

  const inCooldown = cooldownSeconds !== null && cooldownSeconds > 0
  const canSubmit = !inCooldown && code.length === 6 && !submitting

  const resendBlocked = sending || inCooldown || resendWait !== null

  const onVerify = useCallback(async () => {
    // Nothing staged means the app was restored mid-flow. The password step
    // would bounce straight back, so say so here and start over instead.
    if (identifier.length === 0) {
      router.replace({ pathname: '/(auth)/forgot-password', params: { notice: 'sessionLost' } })
      return
    }

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
      stagePasswordReset(identifier, parsed.data, issuedAt)
      router.push('/(auth)/reset-password')
    } finally {
      setSubmitting(false)
    }
  }, [code, identifier, issuedAt, router, t])

  const onResend = useCallback(async () => {
    if (identifier.length === 0) {
      router.replace({ pathname: '/(auth)/forgot-password', params: { notice: 'sessionLost' } })
      return
    }

    setSending(true)
    setFormError(undefined)

    try {
      await sendPasswordResetOtp(identifier)

      // A fresh code supersedes the old one. The server's window restarts
      // with it, so the mirror restarts too — and any code that was staged
      // for the password step is now a code the server has already
      // superseded, so it is discarded.
      const issued = Date.now()
      clearPendingReset()
      stagePasswordReset(identifier, '', issued)
      setIssuedAt(issued)
      setNow(issued)
      setCooldownSeconds(null)
      setAttemptsRemaining(undefined)
      setCode('')
      setResendWait(RESEND_COOLDOWN_SECONDS)
      toast.show({ message: t('auth.otpResent'), tone: 'success' })
    } catch (error) {
      const appError = error instanceof AppError ? error : null

      if (isRateLimited(error)) {
        const retryAfter = readRetryAfterSeconds(error)
        if (retryAfter !== undefined && retryAfter > 0) setCooldownSeconds(Math.ceil(retryAfter))
      }

      setFormError(
        isResetNetworkError(error)
          ? t('errors.network')
          : appError
            ? errorCopy(t, appError.code)
            : t('errors.internal'),
      )
    } finally {
      setSending(false)
    }
  }, [identifier, router, t, toast])

  const validityLabel = useMemo(() => {
    if (expired) return t('auth.otpExpired')
    const minutes = Math.floor(validitySeconds / 60)
    const seconds = validitySeconds % 60
    return t('auth.otpExpiresIn', {
      minutes,
      seconds: String(seconds).padStart(2, '0'),
    })
  }, [expired, t, validitySeconds])

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('auth.accountRecovery')} onBack={() => router.back()} />

      <KeyboardScroll contentStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>{t('auth.otpTitle')}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {t('auth.otpEmailSubtitle')}
        </Text>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ color: theme.palette.red[600], fontSize: 13 }}
            >
              {formError}
            </Text>
          </View>
        ) : null}

        {inCooldown ? (
          <View style={[styles.cooldownBanner, { backgroundColor: theme.palette.amber[50] }]}>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ color: theme.palette.amber[600], fontSize: 13 }}
            >
              {t('auth.otpCooldown', {
                minutes: Math.ceil((cooldownSeconds ?? 0) / 60),
              })}
            </Text>
          </View>
        ) : null}

        <InputField
          label={t('auth.otpLabel')}
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
          placeholder={t('auth.otpPlaceholder')}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canSubmit) void onVerify()
          }}
          icon="lock"
          helper={validityLabel ?? undefined}
          error={errors.code}
          testID="reset-otp-code"
        />

        {attemptsRemaining !== undefined && !formError ? (
          <Text style={[styles.attempts, { color: theme.colors.ink[500] }]}>
            {t('auth.otpAttemptsRemaining', { count: attemptsRemaining })}
          </Text>
        ) : null}

        <Button
          label={submitting ? t('capture.submitting') : t('auth.verifyCta')}
          variant={expired ? 'secondary' : 'primary'}
          size="lg"
          disabled={!canSubmit}
          onPress={onVerify}
          style={styles.cta}
        />

        {expired ? (
          // An expired code can only be replaced, so Resend becomes the main
          // action instead of a small link.
          <Button
            label={sending ? t('capture.submitting') : t('auth.resendOtp')}
            variant="primary"
            size="lg"
            disabled={resendBlocked}
            onPress={onResend}
            style={styles.cta}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: resendBlocked }}
            disabled={resendBlocked}
            onPress={onResend}
            hitSlop={8}
            style={[styles.resendHit, resendBlocked && styles.resendDisabled]}
          >
            <Text style={[styles.resend, { color: theme.palette.violet[700] }]}>
              {sending
                ? t('capture.submitting')
                : resendWait !== null
                  ? t('auth.resendIn', { seconds: resendWait })
                  : t('auth.resendOtp')}
            </Text>
          </Pressable>
        )}
      </KeyboardScroll>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
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
  resendHit: {
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  resendDisabled: {
    opacity: 0.5,
  },
  resend: {
    fontSize: 13,
    fontWeight: '600',
  },
})

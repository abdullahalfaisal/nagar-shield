import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppError } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { AppBar, Button, InputField, KeyboardScroll } from '@/shared/ui'
import {
  isRateLimited,
  isResetNetworkError,
  isValidResetIdentifier,
  sendPasswordResetOtp,
  stagePasswordReset,
} from '@/shared/auth/passwordResetService'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * Screen 13 — Forgot Password.
 *
 * The prototype's screen-13 layout: the back button, the "অ্যাকাউন্ট পুনরুদ্ধার"
 * app-bar title, the "পাসওয়ার্ড ভুলে গেছেন?" heading, the `mail` icon, the
 * identifier input and the "OTP কোড পাঠান" primary button, with the
 * "← লগইনে ফিরে যান" escape link.
 *
 * The prototype's copy says a reset **link** is sent. The shipped flow sends
 * a **code**, so the helper copy is reworded through i18n to describe a code
 * — and it never claims delivery. Email deliverability on a free tier is not
 * guaranteed, so the app says a code was *sent*, never that it *arrived*.
 *
 * **No account-existence oracle.** An unknown identifier and a registered one
 * produce the same answer and the same screen — the identifier is resolved
 * server-side, and the server's answer does not vary.
 *
 * **The code step is a separate screen.** The prototype put the new-password
 * field on the same screen because the reset *link* landed the user straight
 * there. A code has to be typed first, so the flow is: this screen asks for
 * the identifier and sends the code, `verify-otp` collects the code, and
 * `reset-password` collects the new password.
 *
 * **No SMS.** `EXPO_PUBLIC_SMS_OTP_ENABLED` is off for Phase 1. There is no
 * SMS option, no SMS delivery claim and no carrier-charge copy in this
 * screen — the channel is email only.
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  const params = useLocalSearchParams<{ notice?: string }>()

  const [identifier, setIdentifier] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  // A screen that sent the user back here (the code step, after the app was
  // restored mid-flow) says why, by key, so the message is in their language.
  const [formError, setFormError] = useState<string | undefined>(() =>
    params.notice === 'sessionLost' ? t('auth.resetSessionLost') : undefined,
  )
  const [submitting, setSubmitting] = useState(false)
  // The cooldown rejection: the user cannot ask for another code, but may
  // already hold one — so the screen offers to go straight to entering it.
  const [rateLimited, setRateLimited] = useState(false)

  const onSendCode = async () => {
    const trimmed = identifier.trim()

    // The button stays enabled so a press always answers; the message under
    // the field says what is wrong.
    if (!isValidResetIdentifier(trimmed)) {
      setErrors({
        identifier:
          trimmed.length === 0 ? t('errors.validationFailed') : t('auth.identifierInvalid'),
      })
      return
    }

    setErrors({})
    setSubmitting(true)
    setFormError(undefined)
    setRateLimited(false)

    try {
      await sendPasswordResetOtp(trimmed)

      // The answer is the same for a known identifier and an unknown one, so
      // the screen cannot say which happened — and does not try.
      //
      // The identifier travels in **memory**, not in the route params: it is
      // PII, and a route param is part of a URL.
      stagePasswordReset(trimmed, '', Date.now())
      router.push('/(auth)/verify-otp')
    } catch (error) {
      const appError = error instanceof AppError ? error : null

      if (isRateLimited(error)) setRateLimited(true)

      setFormError(
        isResetNetworkError(error)
          ? t('errors.network')
          : appError
            ? errorCopy(t, appError.code)
            : t('errors.internal'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // The code the user already holds was issued by an earlier request, so its
  // issue time is unknown; the code step then counts from now and the server
  // remains the judge of expiry.
  const onHaveCode = () => {
    stagePasswordReset(identifier.trim(), '')
    router.push('/(auth)/verify-otp')
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('auth.accountRecovery')} onBack={() => router.back()} />

      <KeyboardScroll contentStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
          {t('auth.forgotTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {t('auth.forgotSubtitle')}
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

        <InputField
          label={t('auth.identifierLabel')}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => {
            if (!submitting) void onSendCode()
          }}
          icon="mail"
          error={errors.identifier}
          testID="forgot-identifier"
        />

        <Button
          label={submitting ? t('capture.submitting') : t('auth.resetCta')}
          variant="primary"
          size="lg"
          disabled={submitting}
          onPress={onSendCode}
          style={styles.cta}
        />

        {rateLimited ? (
          <Pressable
            accessibilityRole="button"
            onPress={onHaveCode}
            hitSlop={8}
            style={styles.haveCodeHit}
          >
            <Text style={[styles.haveCode, { color: theme.palette.violet[700] }]}>
              {t('auth.haveCode')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(auth)/login')}
          hitSlop={8}
          style={styles.backToLoginHit}
        >
          <Text style={[styles.backToLogin, { color: theme.colors.ink[500] }]}>
            ← {t('auth.backToLogin')}
          </Text>
        </Pressable>
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
  cta: {
    marginTop: 20,
  },
  haveCodeHit: {
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  haveCode: {
    fontSize: 14,
    fontWeight: '600',
  },
  backToLoginHit: {
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  backToLogin: {
    fontSize: 13,
  },
})

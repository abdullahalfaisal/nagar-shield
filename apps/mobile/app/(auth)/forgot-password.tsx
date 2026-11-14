import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppError } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { AppBar, Button, InputField } from '@/shared/ui'
import { sendPasswordResetOtp, stagePasswordReset } from '@/shared/auth/passwordResetService'
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
  const { t } = useTranslation()

  const [identifier, setIdentifier] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const onSendCode = async () => {
    const trimmed = identifier.trim()

    if (trimmed.length === 0) {
      setErrors({ identifier: t('errors.validationFailed') })
      return
    }

    setErrors({})
    setSubmitting(true)
    setFormError(undefined)

    try {
      await sendPasswordResetOtp(trimmed)

      // The answer is the same for a known identifier and an unknown one, so
      // the screen cannot say which happened — and does not try.
      //
      // The identifier travels in **memory**, not in the route params: it is
      // PII, and a route param is part of a URL.
      stagePasswordReset(trimmed, '')
      router.push('/(auth)/verify-otp')
    } catch (error) {
      const appError = error instanceof AppError ? error : null
      setFormError(appError ? errorCopy(t, appError.code) : t('errors.internal'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar title={t('auth.accountRecovery')} onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.ink[950] }]}>
          {t('auth.forgotTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.ink[600] }]}>
          {t('auth.forgotSubtitle')}
        </Text>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
            <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
          </View>
        ) : null}

        <InputField
          label={t('auth.identifierLabel')}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={t('auth.phonePlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          icon="mail"
          error={errors.identifier}
          testID="forgot-identifier"
        />

        <Button
          label={submitting ? t('capture.submitting') : t('auth.resetCta')}
          variant="primary"
          size="lg"
          disabled={identifier.trim().length === 0 || submitting}
          onPress={onSendCode}
          style={styles.cta}
        />

        <Text
          accessibilityRole="button"
          onPress={() => router.replace('/(auth)/login')}
          style={[styles.backToLogin, { color: theme.colors.ink[500] }]}
        >
          ← {t('auth.backToLogin')}
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
  cta: {
    marginTop: 20,
  },
  backToLogin: {
    alignSelf: 'center',
    fontSize: 13,
    paddingVertical: 14,
  },
})

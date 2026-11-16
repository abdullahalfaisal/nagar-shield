import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppError, bnDigitsToAscii } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { Brand, Button, EscapeLink, InputField, KeyboardScroll, Toggle } from '@/shared/ui'
import { isInvalidCredentials, logIn } from '@/shared/auth/authService'
import { completePasswordSignIn } from '@/shared/auth/completePasswordSignIn'
import { fromSupabaseError } from '@/shared/api/errors'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * Screen 11 — Login.
 *
 * The prototype's login is a phone/email + OTP flow with a simulated
 * `display:block` toggle. The build replaces that with the **real**
 * email-primary Supabase password flow (waiver W-1), keeping the prototype's
 * layout, brand block, hero, input styling and the "no account" footer.
 *
 * The password input and the Remember-me switch are additions that use the
 * prototype's own input and toggle styles.
 */
export default function LoginScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { t } = useTranslation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !submitting

  const onSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setFormError(undefined)
    try {
      // The user just proved who they are with a password. The shared
      // finish-sign-in step records the Remember-me window before the session
      // is written, keeps the biometric gate from asking for a fingerprint
      // straight after the password, and clears the failure count that led
      // here. Sign-up and the password reset go through the same step.
      await completePasswordSignIn({ rememberMe }, () =>
        logIn({ identifier, password, rememberMe }),
      )

      router.replace('/(app)/home')
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error)
      // The message is shown once, in the banner — repeating it under the
      // password field would read the same text twice.
      // A wrong password is not an ended session: "Please sign in again" tells
      // someone who just typed a password nothing useful.
      setFormError(
        isInvalidCredentials(appError)
          ? t('errors.invalidCredentials')
          : errorCopy(t, appError.code),
      )
      setSubmitting(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <KeyboardScroll revealEnd contentStyle={[styles.content, { paddingTop: 24 + insets.top }]}>
        <View style={styles.brand}>
          <Brand name={t('common.appName')} tagline={t('common.brandTagline')} />
        </View>

        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { color: theme.colors.ink[950] }]}>
            {t('auth.loginTitle')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.colors.ink[600] }]}>
            {t('auth.loginSubtitle')}
          </Text>
        </View>

        <View style={styles.field}>
          <InputField
            label={t('auth.identifierLabel')}
            value={identifier}
            // Bangla digits in a phone number are converted as they are typed; an
            // email has none, so it passes through unchanged.
            onChangeText={(next) => setIdentifier(bnDigitsToAscii(next))}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            icon="mail"
            testID="login-identifier"
          />
        </View>

        <View style={styles.field}>
          <InputField
            label={t('auth.passwordLabel')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            icon="lock"
            onSubmitEditing={onSubmit}
            returnKeyType="go"
            testID="login-password"
          />
        </View>

        <View style={styles.optionsRow}>
          <View style={styles.rememberRow}>
            <Toggle
              value={rememberMe}
              onValueChange={setRememberMe}
              accessibilityLabel={t('auth.rememberMe')}
            />
            <Text style={[styles.rememberLabel, { color: theme.colors.ink[600] }]}>
              {t('auth.rememberMe')}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/forgot-password')}
            hitSlop={8}
            style={styles.forgotHit}
          >
            <Text style={[styles.forgotLink, { color: theme.palette.violet[700] }]}>
              {t('auth.forgotPassword')}
            </Text>
          </Pressable>
        </View>

        {/*
          The banner sits just above the button, not at the top of the form:
          the button is where the finger is, and the form scrolls on a small
          screen, so a message at the top could be off screen after the tap.
        */}
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

        <Button
          label={submitting ? t('capture.submitting') : t('auth.signIn')}
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          onPress={onSubmit}
          style={styles.cta}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: theme.colors.ink[600] }]}>
            {t('auth.noAccount')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/register')}
            hitSlop={8}
            style={styles.linkHit}
          >
            <Text style={[styles.link, { color: theme.palette.violet[500] }]}>
              {t('auth.createAccount')}
            </Text>
          </Pressable>
        </View>

        <EscapeLink label={t('common.back')} onPress={() => router.back()} />
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
    paddingTop: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  field: {
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  rememberLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  forgotHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  linkHit: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cta: {
    marginTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
  },
})

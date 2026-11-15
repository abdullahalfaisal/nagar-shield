import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { clearSignupDraft, readSignupDraft } from '@/shared/auth/signupDraft'
import { clearWizardContacts } from '@/shared/wizard/ContactCaptureScreen'
import { useTranslation } from 'react-i18next'
import { AppError, bnDigitsToAscii, phoneSchema } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { Button, EscapeLink, InputField, WizardScreen } from '@/shared/ui'
import { signUp } from '@/shared/auth/authService'
import { validateSignupFields } from '@/shared/auth/signupValidation'
import { completePasswordSignIn } from '@/shared/auth/completePasswordSignIn'
import { setAlternatePhone } from '@/shared/api/profile'
import { fromSupabaseError } from '@/shared/api/errors'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * Screen 12 — Registration.
 *
 * MVP Phase 1 is email-primary (waiver W-1): the account is created with the
 * email + password and the phone is stored on `profiles`.
 *
 * The prototype's "SMS-এও OTP পাঠান" checkbox is **hidden** while the SMS
 * flag is off — the copy claims SMS delivery, and the checkbox would be a
 * promise the build cannot keep.
 */
export default function RegisterScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()
  const draft = readSignupDraft()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(draft.email)
  const [password, setPassword] = useState(draft.password)
  const [phone, setPhone] = useState(draft.phone)
  // The alternate phone comes from the S-02 step, already normalised there.
  // It is not editable on this screen — the wizard collected it one step ago,
  // and the prototype does not repeat the field.
  const [alternatePhone] = useState(draft.alternatePhone)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  // The email is already registered: shown under the email field with a link
  // to sign in, which is what the person with an existing account wants.
  const [emailTaken, setEmailTaken] = useState(false)

  const clearError = (field: string) => {
    setErrors((current) => ({ ...current, [field]: '' }))
    if (field === 'email') setEmailTaken(false)
  }

  // The button stays enabled and the fields are checked on press, so each
  // failing field says what is wrong. The checks are the shared schemas: the
  // phone is normalised to E.164 and must be a valid Bangladesh number, and a
  // length check would let `1234567890` through to a less useful server error.
  const onSubmit = async () => {
    if (submitting) return
    const nextErrors: Record<string, string> = {}
    for (const [field, key] of Object.entries(validateSignupFields({ phone, email, password }))) {
      nextErrors[field] = t(key)
    }

    // The same primary-versus-alternate check as the alternate-phone step: the
    // phone is editable here, so it can be changed to match the alternate
    // number after that step passed. Compared in E.164, not as typed.
    const parsedPhone = phoneSchema.safeParse(phone)
    if (!nextErrors.phone && alternatePhone && parsedPhone.success) {
      if (parsedPhone.data === alternatePhone) {
        nextErrors.phone = t('errors.alternatePhoneSameAsPrimary')
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setFormError(undefined)
    try {
      // The new account's session goes through the same finish-sign-in step
      // as a login. Sign-up has no Remember-me switch, so the session gets the
      // 24-hour window rather than the 30-day one — before, it got no window
      // at all and never expired on the device. The user can choose the
      // longer window the next time they sign in.
      const userId = await completePasswordSignIn({ rememberMe: false }, () =>
        signUp({
          email,
          password,
          phone,
          // Trimmed first, so a name of spaces counts as no name rather than
          // failing the schema with no field marked.
          fullName: fullName.trim() || undefined,
        }),
      )

      // The alternate phone is written **after** the signup, not before.
      //
      // The `profiles` row is created by a trigger on `auth.users`, and that
      // trigger writes `id, email, phone, full_name` — it does not carry the
      // alternate phone, so there is no way to set the column as part of the
      // signup itself. The owner may write it afterwards, and it is a
      // client-owned column, so this is the only step it needs.
      //
      // A failure here must not fail the signup: the account exists, the user
      // is signed in, and the alternate phone is a convenience detail. The
      // user is told, but they are not thrown back to the form.
      let alternatePhoneSaved = true
      if (alternatePhone) {
        try {
          await setAlternatePhone(userId, alternatePhone)
        } catch {
          alternatePhoneSaved = false
        }
      }

      // The account exists, so the draft (and its password) is done with.
      clearSignupDraft()

      if (!alternatePhoneSaved) {
        // Navigating away in the same tick would unmount the form before the
        // user could read the notice, so it is shown as an alert instead.
        Alert.alert(t('auth.alternatePhoneNotSaved'))
      }

      // The account exists and is signed in. The next stop is the **contact
      // capture** step (S-04a) — the wizard's first of three emergency
      // contacts. The account is not "complete" until the safety profile
      // has been set up, so the wizard is entered here rather than the home
      // screen.
      //
      // The signup forms are dropped from the stack first: Back from the
      // first contact step must not return to a form that would submit the
      // signup again for an account that already exists. A new onboarding
      // run also starts with empty contact slots.
      clearWizardContacts()
      if (router.canDismiss()) router.dismissAll()
      router.replace('/(auth)/contact-1')
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error)

      // A validation failure that names the phone field is shown **on that
      // field**, not as a banner above the form. The user has to know which
      // input is wrong, or the message is just noise.
      if (appError.code === 'VALIDATION_FAILED' && appError.details?.field === 'phone') {
        setErrors((current) => ({
          ...current,
          phone: t('errors.phoneAlreadyRegistered'),
        }))
        setFormError(undefined)
      } else if (appError.code === 'CONFLICT' && appError.details?.field === 'email') {
        setErrors((current) => ({ ...current, email: t('errors.emailAlreadyRegistered') }))
        setEmailTaken(true)
        setFormError(undefined)
      } else {
        setFormError(errorCopy(t, appError.code))
      }

      setSubmitting(false)
    }
  }

  return (
    <WizardScreen
      step={3}
      totalSteps={4}
      eyebrow={t('auth.registerTitle')}
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          <Button
            label={submitting ? t('capture.submitting') : t('auth.registerCta')}
            variant="primary"
            size="lg"
            disabled={submitting}
            onPress={onSubmit}
          />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
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
        label={t('auth.fullNameLabel')}
        value={fullName}
        onChangeText={setFullName}
        placeholder={t('auth.fullNameLabel')}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="next"
        icon="person"
        testID="reg-name"
      />
      <InputField
        label={t('auth.emailLabel')}
        value={email}
        onChangeText={(next) => {
          setEmail(next)
          clearError('email')
        }}
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        returnKeyType="next"
        icon="mail"
        error={errors.email}
        testID="reg-email"
      />
      {emailTaken ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/login')}
          hitSlop={8}
          style={styles.signInHit}
        >
          <Text style={[styles.signInLink, { color: theme.palette.violet[700] }]}>
            {t('auth.signIn')}
          </Text>
        </Pressable>
      ) : null}
      <InputField
        label={t('auth.phoneLabel')}
        value={phone}
        onChangeText={(next) => {
          setPhone(bnDigitsToAscii(next))
          clearError('phone')
        }}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel-national"
        returnKeyType="next"
        icon="phone"
        error={errors.phone}
        testID="reg-phone"
      />
      <InputField
        label={t('auth.passwordLabel')}
        value={password}
        onChangeText={(next) => {
          setPassword(next)
          clearError('password')
        }}
        secureTextEntry
        textContentType="password"
        autoComplete="password-new"
        returnKeyType="done"
        onSubmitEditing={() => {
          void onSubmit()
        }}
        icon="lock"
        error={errors.password}
        helper={t('auth.newPasswordSubtitle')}
        testID="reg-password"
      />
    </WizardScreen>
  )
}

const styles = StyleSheet.create({
  signInHit: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
  },
  signInLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
})

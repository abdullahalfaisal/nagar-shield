import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { stageSignupDraft } from '@/shared/auth/signupDraft'
import { useTranslation } from 'react-i18next'
import { bnDigitsToAscii, emailSchema, phoneSchema } from '@nagar-shield/shared'
import { validateSignupFields } from '@/shared/auth/signupValidation'
import { useTheme } from '@/shared/theme'
import { Button, EscapeLink, InputField, WizardScreen } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'

/**
 * Screen 2 — S-01 Own Phone.
 *
 * The prototype collects a phone number and advances to the alternate-phone
 * step. Because MVP Phase 1 is email-primary (waiver W-1), this screen also
 * collects the email and password that the Auth user is actually created
 * with. The phone stays a required unique profile attribute.
 *
 * The primary phone is normalised to E.164 **here**, before it is handed to
 * the next screen. The alternate-phone step has to compare the two numbers
 * to enforce "must be different from your primary number", and a comparison
 * is only meaningful in one canonical form — `01711-111111` and
 * `+8801711111111` are the same number written two ways.
 */
export default function PhoneScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // The button stays enabled and the fields are checked on press: a greyed
  // button gave no reason, and the per-field messages could never show. The
  // checks are the shared schemas, which normalise the phone to E.164 and
  // refuse anything that is not a valid Bangladesh number.
  const clearError = (field: string) => setErrors((current) => ({ ...current, [field]: '' }))

  const onContinue = () => {
    const found = validateSignupFields({ phone, email, password })
    const nextErrors: Record<string, string> = {}
    for (const [field, key] of Object.entries(found)) nextErrors[field] = t(key)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const parsedPhone = phoneSchema.parse(phone)
    const parsedEmail = emailSchema.parse(email)

    // The **normalised** number, so the next screen compares like with like.
    // Held in memory, not in route params: the password must not reach
    // navigation state or logs.
    stageSignupDraft({ phone: parsedPhone, email: parsedEmail, password, alternatePhone: '' })
    router.push('/(auth)/alternate-phone')
  }

  return (
    <WizardScreen
      step={1}
      totalSteps={4}
      eyebrow={t('auth.phoneTitle')}
      title={
        <>
          {t('auth.phoneLabel')} <Text style={{ color: theme.palette.violet[700] }}>·</Text>{' '}
          {t('auth.emailLabel')}
        </>
      }
      subtitle={t('auth.phoneSubtitle')}
      footer={
        <>
          <Button label={t('common.continue')} variant="primary" size="lg" onPress={onContinue} />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
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
        testID="wiz-phone-1"
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
        testID="wiz-email-1"
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
        icon="lock"
        error={errors.password}
        helper={t('auth.passwordPolicyHint')}
        testID="wiz-password-1"
      />

      <View style={styles.lockRow}>
        <Icon name="lock" size={16} color={theme.palette.violet[600]} />
        <Text style={[styles.lockText, { color: theme.colors.ink[500] }]}>
          {t('auth.phonePrivacyNote')}
        </Text>
      </View>
    </WizardScreen>
  )
}

const styles = StyleSheet.create({
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  lockText: {
    fontSize: 12,
    flex: 1,
  },
})

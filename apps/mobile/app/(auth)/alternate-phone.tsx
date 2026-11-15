import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { readSignupDraft, stageSignupDraft } from '@/shared/auth/signupDraft'
import { useTranslation } from 'react-i18next'
import { alternatePhoneSchema, bnDigitsToAscii, phoneSchema } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { Button, EscapeLink, InputField, WizardScreen } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'

/**
 * Screen 3 — S-02 Alternate Phone.
 *
 * The prototype collects a second number: "A second way to reach you if your
 * primary number is unreachable. A close family member works well." The
 * layout, label, helper copy and "must be different" validation are ported
 * 1:1 from the prototype.
 *
 * The value is optional — the prototype's "Continue" is not gated on it, and
 * the column is nullable. A user who has no second number should be able to
 * move on, not be trapped on this step.
 *
 * Two things the comparison has to get right:
 *
 *   1. **Normalise before comparing.** The primary number arrives here
 *      already in E.164 (`phone.tsx` normalises it), and the alternate is
 *      normalised here. Without that, `01711-111111` and
 *      `+8801711111111` — the same number — would pass as different, and the
 *      "must be different" rule would be trivially evaded by typing the
 *      primary number in the local format.
 *
 *   2. **Compare the numbers, not the strings.** Once both are normalised,
 *      equality is exact. The old code compared raw input, which is why the
 *      rule could be evaded.
 */
export default function AlternatePhoneScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()
  const draft = readSignupDraft()

  const [alternatePhone, setAlternatePhone] = useState('')
  const [error, setError] = useState<string | undefined>()

  const primary = draft.phone

  /**
   * Validates the alternate number.
   *
   * Returns the normalised number, or `null` when the input is empty — an
   * empty alternate phone is allowed, because the column is nullable and the
   * step is not mandatory.
   */
  const validate = (): string | null | undefined => {
    const trimmed = alternatePhone.trim()

    if (!trimmed) {
      // No alternate number. Not an error — the user may not have one.
      setError(undefined)
      return null
    }

    const parsed = alternatePhoneSchema.safeParse(trimmed)
    if (!parsed.success) {
      setError(t('errors.phoneInvalid'))
      return undefined
    }

    // The primary arrives normalised from `phone.tsx`, but normalising it
    // again costs nothing and makes this screen correct on its own terms.
    const parsedPrimary = phoneSchema.safeParse(primary)
    if (parsedPrimary.success && parsed.data === parsedPrimary.data) {
      setError(t('errors.alternatePhoneSameAsPrimary'))
      return undefined
    }

    setError(undefined)
    return parsed.data
  }

  const onContinue = () => {
    const validated = validate()
    if (validated === undefined) return

    // Empty means "no alternate phone" — the register screen stores NULL.
    stageSignupDraft({ alternatePhone: validated ?? '' })
    router.push('/(auth)/register')
  }

  return (
    <WizardScreen
      step={2}
      totalSteps={4}
      eyebrow={t('auth.alternatePhoneTitle')}
      title={t('auth.alternatePhoneTitle')}
      subtitle={t('auth.alternatePhoneSubtitle')}
      footer={
        <>
          <Button label={t('common.continue')} variant="primary" size="lg" onPress={onContinue} />
          <EscapeLink label={t('common.back')} onPress={() => router.back()} />
        </>
      }
    >
      <InputField
        label={t('auth.alternatePhoneLabel')}
        value={alternatePhone}
        onChangeText={(next) => {
          setAlternatePhone(bnDigitsToAscii(next))
          // Clear a stale error as soon as the user edits the field, so the
          // message does not describe the previous input.
          if (error) setError(undefined)
        }}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel-national"
        returnKeyType="done"
        onSubmitEditing={onContinue}
        icon="phone"
        error={error}
        helper={t('auth.alternatePhoneMustDiffer')}
        testID="wiz-phone-2"
      />

      <View style={styles.noteRow}>
        <Icon name="info" size={16} color={theme.palette.violet[600]} />
        <Text style={[styles.noteText, { color: theme.colors.ink[500] }]}>
          {t('auth.alternatePhoneOptional')}
        </Text>
      </View>
    </WizardScreen>
  )
}

const styles = StyleSheet.create({
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
  },
  noteText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
})

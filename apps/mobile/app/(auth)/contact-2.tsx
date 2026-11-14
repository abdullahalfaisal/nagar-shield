import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ContactCaptureScreen } from '@/shared/wizard/ContactCaptureScreen'

/**
 * Screen 6 — S-04b, Contact 2 of 3.
 *
 * The second of the three onboarding contact steps. The layout is the
 * prototype's screen 6 1:1 — the slot list now shows contact 1 as filled,
 * and the hero copy changes.
 */
export default function WizardContact2Screen() {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <ContactCaptureScreen
      slot={2}
      eyebrow={t('wizardContacts.step2Eyebrow')}
      title={t('wizardContacts.step2Title')}
      highlight={t('wizardContacts.step2Highlight')}
      subtitle={t('wizardContacts.step2Subtitle')}
      cta={t('wizardContacts.saveCta')}
      onBack={() => router.back()}
      onComplete={() => router.push('/(auth)/contact-3')}
    />
  )
}

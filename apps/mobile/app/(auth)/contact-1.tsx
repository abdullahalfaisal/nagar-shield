import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ContactCaptureScreen } from '@/shared/wizard/ContactCaptureScreen'

/**
 * Screen 5 — S-04a, Contact 1 of 3.
 *
 * The first of the three onboarding contact steps. The layout is the
 * prototype's screen 5 1:1: the `.contact-slot-list` with three slots, the
 * name and phone fields, and the sticky "Save & continue" CTA with a "Back"
 * escape link.
 *
 * The step writes the contact through the owner-scoped API **before**
 * advancing, so an abandoned wizard leaves the contact saved and editable
 * from the Emergency Contacts screen.
 */
export default function WizardContact1Screen() {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <ContactCaptureScreen
      slot={1}
      eyebrow={t('wizardContacts.step1Eyebrow')}
      title={t('wizardContacts.step1Title')}
      highlight={t('wizardContacts.step1Highlight')}
      subtitle={t('wizardContacts.step1Subtitle')}
      cta={t('wizardContacts.saveCta')}
      onBack={() => router.back()}
      onComplete={() => router.push('/(auth)/contact-2')}
    />
  )
}

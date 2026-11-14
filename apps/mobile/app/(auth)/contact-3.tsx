import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ContactCaptureScreen, clearWizardContacts } from '@/shared/wizard/ContactCaptureScreen'

/**
 * Screen 7 — S-04c, Contact 3 of 3.
 *
 * The last of the three onboarding contact steps. The layout is the
 * prototype's screen 7 1:1: the slot list with all three filled, the violet
 * "All three saved." panel with the `verified_user` glyph, and the sticky
 * "Continue to location" CTA.
 *
 * The prototype renders the third slot already filled, because the prototype
 * has no data layer. A live screen has to capture contact 3 somewhere, so the
 * fields are shown until the third contact is saved; the "All three saved."
 * panel appears once it is.
 *
 * The CTA advances to **S-05 Location**, which belongs to
 * `001-signup-with-email-and-phone` — that story owns the just-in-time
 * permission surface. This screen owns the capture; it does not own the
 * permission.
 */
export default function WizardContact3Screen() {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <ContactCaptureScreen
      slot={3}
      eyebrow={t('wizardContacts.step3Eyebrow')}
      title={t('wizardContacts.step3Title')}
      highlight={t('wizardContacts.step3Highlight')}
      subtitle={t('wizardContacts.step3Subtitle')}
      cta={t('wizardContacts.saveCta')}
      onBack={() => router.back()}
      onComplete={() => {
        // The wizard's captures are done. The module's memory is cleared so a
        // later onboarding run starts from empty slots rather than replaying
        // this run's contacts.
        clearWizardContacts()
        router.replace('/(auth)/location-permission')
      }}
    />
  )
}

import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { ContactCaptureScreen } from '@/shared/wizard/ContactCaptureScreen'

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
      onSkip={() => router.replace('/(auth)/location-permission')}
      onComplete={() => {
        // The captures are **not** cleared here: Back from the location step
        // returns to contact 2, which must still find its saved contact and
        // update it rather than create a duplicate. A later onboarding run
        // clears the module's memory when its signup succeeds (register).
        router.replace('/(auth)/location-permission')
      }}
    />
  )
}

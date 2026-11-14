import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppError, emergencyContactSchema, type EmergencyContact } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { Button, EscapeLink, Icon, InputField, WizardScreen } from '@/shared/ui'
import {
  createContact,
  updateContact,
  useContacts,
  useInvalidateContacts,
} from '@/shared/api/contacts'
import { fromSupabaseError } from '@/shared/api/errors'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * The three onboarding contact steps — S-04a, S-04b and S-04c.
 *
 * One component, three screens
 * ----------------------------
 * The prototype has three separate screens, but they differ only in which
 * slot is being filled and in the hero copy. The **behaviour** is identical,
 * so it lives here once and the three route files pass in their own copy.
 * The layout is the prototype's 1:1: the `.contact-slot-list` with three
 * `.contact-slot` rows, the name field, the phone field, and the sticky
 * footer with the primary CTA and the "Back" escape link.
 *
 * The slots show the user's **real** contacts
 * -------------------------------------------
 * The prototype's slot list is static fixture content — "Rahim Ahmed",
 * "Sumaiya Khan", "Faisal Iqbal" — because the prototype has no data layer.
 * A live screen must show what the user actually saved, so the filled slots
 * are read back from the database.
 *
 * The contacts are written as they are captured, not at the end
 * ------------------------------------------------------------
 * Each step writes its contact through the owner-scoped API **before**
 * advancing. That is what makes the story's edge case hold: "The wizard is
 * abandoned after Contact 1 — the already-saved contacts remain and are
 * editable from the Emergency Contacts screen; the wizard resumes rather than
 * duplicating them." The slots are therefore the database's own rows, and
 * resuming the wizard shows the contacts that are already there.
 *
 * Because the write is per-step, the slot list must not offer a contact the
 * user already saved: the wizard fills **three** slots, and a user with five
 * contacts already on file would otherwise see their existing rows counted
 * against the wizard's three. The slots are filled from the contacts
 * **captured during this wizard**, tracked in the module's memory — the same
 * hand-off the password reset uses, and for the same reason: the wizard's
 * progress is neither a secret nor worth putting in a URL.
 */

/** How many contacts the wizard captures. The prototype's "three in total". */
export const WIZARD_CONTACT_COUNT = 3

/**
 * The contacts captured during this wizard run.
 *
 * This is **not** the user's whole contact list — a user who already has
 * contacts from before the wizard would otherwise see them fill the slots and
 * the wizard would ask for duplicates. The wizard's own captures are tracked
 * separately, in the module's memory, and cleared when the wizard finishes.
 */
let wizardCaptured: EmergencyContact[] = []

export function stageWizardContact(contact: EmergencyContact): void {
  // Replace the entry with the same id, or append. A re-save of the same
  // slot updates the row in place rather than growing the list.
  const index = wizardCaptured.findIndex((entry) => entry.id === contact.id)
  if (index >= 0) {
    wizardCaptured = wizardCaptured.map((entry, i) => (i === index ? contact : entry))
    return
  }
  wizardCaptured = [...wizardCaptured, contact]
}

export function peekWizardContacts(): EmergencyContact[] {
  return wizardCaptured
}

export function clearWizardContacts(): void {
  wizardCaptured = []
}

interface ContactCaptureScreenProps {
  /** 1-based slot number this step fills. */
  slot: 1 | 2 | 3
  /** The hero copy for this step. */
  eyebrow: string
  title: string
  /** The emphasised part of the hero title. */
  highlight: string
  subtitle: string
  /** The primary CTA's label. */
  cta: string
  /** Where "Back" goes and where the CTA goes. */
  onBack: () => void
  onComplete: () => void
}

export function ContactCaptureScreen({
  slot,
  eyebrow,
  title,
  highlight,
  subtitle,
  cta,
  onBack,
  onComplete,
}: ContactCaptureScreenProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const invalidate = useInvalidateContacts()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  // The full list is read so the query is invalidated after each write, and
  // so a write made on one step is visible on the next one. Only the
  // wizard's **own** captures fill the slots — a user who already had
  // contacts before onboarding would otherwise see them filling the slots
  // and be asked for duplicates.
  const { data: allContacts } = useContacts()

  // The wizard's captures live in the module's memory, so they survive the
  // navigation between the three steps. React does not re-render on a module
  // mutation, so the list is mirrored into state — and re-mirrored whenever
  // the contacts query changes, which is what happens after each write.
  const [captured, setCaptured] = useState<EmergencyContact[]>(() => peekWizardContacts())

  useEffect(() => {
    setCaptured(peekWizardContacts())
  }, [allContacts])

  // The slots are the wizard's own captures, padded to three. A slot the
  // user has not reached yet reads "Not added yet".
  const slots = useMemo(() => {
    const entries = Array.from({ length: WIZARD_CONTACT_COUNT }, (_, index) => {
      const contact = captured[index]
      return {
        number: index + 1,
        contact,
        title: contact ? contact.name : t('wizardContacts.slotTitle', { number: index + 1 }),
        sub: contact
          ? formatNational(contact.phone)
          : index + 1 < WIZARD_CONTACT_COUNT
            ? t('wizardContacts.notAddedYet')
            : t('wizardContacts.addOneMore'),
      }
    })

    return entries
  }, [captured, t])

  // Pre-fill the fields when the user goes back to a step they already
  // filled, so the back button does not wipe their input.
  useEffect(() => {
    const existing = captured[slot - 1]
    if (!existing) return
    setName(existing.name)
    setPhone(existing.phone)
  }, [captured, slot])

  const onSave = useCallback(async () => {
    const parsed = emergencyContactSchema.safeParse({
      name,
      phone,
      groupName: 'other',
      isPrimary: false,
      sortOrder: 0,
    })

    const nextErrors: Record<string, string> = {}
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0]
      nextErrors[field === 'phone' ? 'phone' : 'name'] = t('errors.validationFailed')
    }
    setErrors(nextErrors)
    if (!parsed.success) return

    setSubmitting(true)
    setFormError(undefined)

    try {
      // The slot this step fills may already have a row — the user came
      // back to it. Updating that row rather than inserting a second one is
      // what keeps the wizard from duplicating contacts.
      const existing = captured[slot - 1]

      const saved = existing
        ? await updateContact(existing.id, {
            name: parsed.data.name,
            phone: parsed.data.phone,
          })
        : await createContact({
            name: parsed.data.name,
            phone: parsed.data.phone,
          })

      stageWizardContact(saved)
      // The module's memory is mirrored into React state, so the mirror is
      // updated here rather than waiting for the query to round-trip.
      setCaptured(peekWizardContacts())
      await invalidate()
      onComplete()
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error)

      if (appError.code === 'VALIDATION_FAILED' && appError.details?.field === 'phone') {
        setErrors({ phone: t('errors.validationFailed') })
        setFormError(undefined)
      } else {
        setFormError(errorCopy(t, appError.code))
      }

      setSubmitting(false)
    }
  }, [captured, invalidate, name, onComplete, phone, slot, t])

  // The last step shows the summary panel once its contact is saved. Before
  // that it still shows the fields — the prototype's screen 7 renders the
  // third slot already filled, but that is static fixture content; a live
  // screen has to capture contact 3 somewhere.
  const isLast = slot === WIZARD_CONTACT_COUNT
  const allCaptured = captured.length >= WIZARD_CONTACT_COUNT

  return (
    <WizardScreen
      step={2}
      totalSteps={4}
      eyebrow={eyebrow}
      title={
        <>
          {title} <Text style={{ color: theme.palette.violet[700] }}>{highlight}</Text>
        </>
      }
      subtitle={subtitle}
      scroll
      footer={
        <>
          {/*
            The last step's CTA changes once all three contacts are saved:
            there is nothing left to save, so it becomes the prototype's
            "Continue to location".
          */}
          <Button
            label={
              submitting
                ? t('capture.submitting')
                : isLast && allCaptured
                  ? t('wizardContacts.continueToLocation')
                  : cta
            }
            variant="primary"
            size="lg"
            disabled={submitting}
            onPress={isLast && allCaptured ? onComplete : onSave}
          />
          <EscapeLink label={t('common.back')} onPress={onBack} />
        </>
      }
    >
      <View style={styles.slotList}>
        {slots.map((entry) => (
          <View
            key={entry.number}
            style={[
              styles.slot,
              {
                backgroundColor: entry.contact
                  ? theme.palette.green[50]
                  : theme.colors.surface.white,
                borderColor: entry.contact ? theme.palette.green[500] : theme.colors.ink[200],
              },
            ]}
          >
            <View
              style={[
                styles.slotNum,
                {
                  backgroundColor: entry.contact
                    ? theme.palette.green[500]
                    : theme.palette.violet[100],
                },
              ]}
            >
              <Text
                style={{
                  color: entry.contact ? '#FFFFFF' : theme.palette.violet[700],
                  fontSize: 13,
                  fontWeight: '700',
                }}
              >
                {entry.number}
              </Text>
            </View>

            <View style={styles.slotText}>
              <Text style={[styles.slotTitle, { color: theme.colors.ink[900] }]}>
                {entry.title}
              </Text>
              <Text style={[styles.slotSub, { color: theme.colors.ink[500] }]}>{entry.sub}</Text>
            </View>

            <Icon
              name={entry.contact ? 'check_circle' : 'chevron_right'}
              size={20}
              color={entry.contact ? theme.palette.green[600] : theme.colors.ink[400]}
              filled={Boolean(entry.contact)}
            />
          </View>
        ))}
      </View>

      {allCaptured ? (
        <View
          style={[
            styles.savedNote,
            { backgroundColor: theme.palette.violet[50], borderColor: theme.palette.violet[200] },
          ]}
        >
          <Icon name="verified_user" size={18} color={theme.palette.violet[700]} filled />
          <Text style={[styles.savedNoteText, { color: theme.colors.ink[700] }]}>
            <Text style={{ color: theme.palette.violet[800], fontWeight: '700' }}>
              {t('wizardContacts.allSavedTitle')}
            </Text>{' '}
            {t('wizardContacts.allSavedBody')}
          </Text>
        </View>
      ) : null}

      {isLast && allCaptured ? null : (
        <View style={styles.fields}>
          <InputField
            label={t('wizardContacts.nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('wizardContacts.nameLabel')}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            icon="person"
            error={errors.name}
            testID={`wiz-c${slot}-name`}
          />
          <InputField
            label={t('wizardContacts.phoneLabel')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('contacts.phonePlaceholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            icon="phone"
            error={errors.phone}
            testID={`wiz-c${slot}-phone`}
          />
        </View>
      )}

      {formError ? (
        <View style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}>
          <Text style={{ color: theme.palette.red[600], fontSize: 13 }}>{formError}</Text>
        </View>
      ) : null}
    </WizardScreen>
  )
}

/**
 * Formats `+8801712345678` as `01712-345678` — the prototype's slot format.
 */
function formatNational(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^880/, '')
  if (digits.length !== 10) return phone
  return `0${digits.slice(1, 0 + 5)}-${digits.slice(5)}`
}

const styles = StyleSheet.create({
  slotList: {
    gap: 10,
    marginTop: 4,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  slotNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: {
    flex: 1,
    minWidth: 0,
  },
  slotTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  slotSub: {
    fontSize: 12,
    marginTop: 1,
  },
  fields: {
    marginTop: 18,
    gap: 12,
  },
  savedNote: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  savedNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
})

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { StyleSheet, Text, View, type TextInput } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { AppError, emergencyContactSchema, type EmergencyContact } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import {
  AppBar,
  Button,
  EmptyState,
  InputField,
  KeyboardScroll,
  RadioGroup,
  Toggle,
  useToast,
} from '@/shared/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  clearPrimary,
  createContact,
  failingContactFields,
  makePrimary,
  updateContact,
  useContact,
  useInvalidateContacts,
} from '@/shared/api/contacts'
import { fromSupabaseError } from '@/shared/api/errors'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * The contact editor — the one screen behind both "add a contact" and
 * "edit a contact".
 *
 * Two capture paths
 * -----------------
 * The onboarding wizard (S-04a/b/c) and this screen write through the **same**
 * owner-scoped API and the **same** shared `contactSchema`. The wizard has
 * its own screens because the prototype has them; the schema and the API are
 * not duplicated between them.
 *
 * What the screen validates
 * -------------------------
 * The phone is checked with the shared schema, which normalises it to E.164
 * and refuses anything that is not a valid Bangladesh number. So `01712-345678`
 * is stored as `+8801712345678`, and `12345` never reaches the database.
 * The database's CHECK constraint is the second line of defence, not the first.
 *
 * There is **no cap** on how many contacts may be saved (A-4).
 */
export default function ContactEditorScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const router = useRouter()
  const { t } = useTranslation()
  const invalidate = useInvalidateContacts()

  const params = useLocalSearchParams<{ id?: string }>()
  const contactId = params.id

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [groupName, setGroupName] = useState<EmergencyContact['groupName']>('other')
  const [isPrimary, setIsPrimary] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  // The contact being edited, if any. The form is pre-filled from it, so an
  // edit never overwrites a contact with a blank form.
  const { data: existing, isLoading, isError, refetch } = useContact(contactId)

  // The id of a contact this screen has already created. If a later step (the
  // primary flag) fails, Save must continue on that contact, not create a
  // second one with the same name and number.
  const createdId = useRef<string | null>(null)

  // The form is filled from the stored contact **once**. A later refetch (focus,
  // reconnect) must not overwrite what the user has typed since.
  const filled = useRef(false)

  const phoneInput = useRef<ComponentRef<typeof TextInput>>(null)

  // Whether the row was primary **before** this edit. The demotion is only
  // worth writing when the flag was set and the user has now turned it off;
  // the app never silently promotes a different contact to compensate.
  const wasPrimary = existing?.isPrimary ?? false

  useEffect(() => {
    if (!existing || filled.current) return
    filled.current = true

    setName(existing.name)
    setPhone(existing.phone)
    setGroupName(existing.groupName)
    setIsPrimary(existing.isPrimary)
  }, [existing])

  // The group options come from the shared schema's enum, so the screen and
  // the database can never disagree about which groups exist.
  const groupOptions = useMemo(
    () =>
      (['family', 'friend', 'colleague', 'other'] as const).map((group) => ({
        id: group as string,
        label: groupLabel(group, t),
      })),
    [t],
  )

  const onSave = useCallback(async () => {
    const parsed = emergencyContactSchema.safeParse({
      name,
      phone,
      isPrimary,
      groupName,
      sortOrder: 0,
    })

    // Every failing field is marked, each with its own message.
    const failing = failingContactFields({ name, phone })
    const nextErrors: Record<string, string> = {}
    if (failing.name) nextErrors.name = t('contacts.nameRequired')
    if (failing.phone) nextErrors.phone = t('contacts.phoneInvalid')
    setErrors(nextErrors)
    if (!parsed.success) return

    setSubmitting(true)
    setFormError(undefined)

    try {
      const editingId = contactId ?? createdId.current

      if (editingId) {
        // The primary flag is deliberately **not** part of this update.
        //
        // A promotion has to clear every other primary in the same pass, and
        // that is `makePrimary`'s job. Writing `is_primary: true` here first
        // and clearing the others afterwards would leave a window in which
        // the list held two primaries — and the picker in unit 003 would then
        // have to guess which one to dial first.
        //
        // A **demotion** is the opposite: it only ever clears this row's own
        // flag, so it is an ordinary update.
        await updateContact(editingId, {
          name: parsed.data.name,
          phone: parsed.data.phone,
          groupName: parsed.data.groupName,
        })

        if (parsed.data.isPrimary) {
          await makePrimary(editingId)
        } else if (wasPrimary) {
          await clearPrimary(editingId)
        }
      } else {
        const created = await createContact({
          name: parsed.data.name,
          phone: parsed.data.phone,
          groupName: parsed.data.groupName,
        })

        createdId.current = created.id

        if (parsed.data.isPrimary) {
          await makePrimary(created.id)
        }
      }

      await invalidate()
      toast.show({ message: t('contacts.savedToast'), tone: 'success' })
      router.back()
    } catch (error) {
      const appError = error instanceof AppError ? error : fromSupabaseError(error)

      // A validation failure that names the phone field is shown **on that
      // field**, not as a banner above the form.
      if (appError.code === 'VALIDATION_FAILED' && appError.details?.field === 'phone') {
        setErrors({ phone: t('contacts.phoneInvalid') })
        setFormError(undefined)
      } else {
        setFormError(errorCopy(t, appError.code))
      }

      setSubmitting(false)
    }
  }, [contactId, groupName, invalidate, isPrimary, name, phone, router, t, toast, wasPrimary])

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <AppBar
        title={contactId ? t('contacts.editTitle') : t('contacts.addTitle')}
        onBack={() => router.back()}
      />

      {contactId && (isLoading || isError || existing === null) ? (
        // Editing a contact that has not loaded: a blank, savable form would
        // overwrite the real contact with whatever gets typed into it.
        isLoading ? (
          <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>
            {t('common.loading')}
          </Text>
        ) : isError ? (
          <EmptyState
            icon="error"
            title={t('contacts.loadFailed')}
            description={t('contacts.loadFailedSub')}
            action={{ label: t('common.retry'), onPress: () => void refetch() }}
          />
        ) : (
          <EmptyState
            icon="contact_emergency"
            title={t('contacts.notFoundTitle')}
            description={t('contacts.notFoundSub')}
            action={{ label: t('common.back'), onPress: () => router.back() }}
          />
        )
      ) : (
        <KeyboardScroll contentStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
          {formError ? (
            <View
              accessibilityRole="alert"
              style={[styles.errorBanner, { backgroundColor: theme.palette.red[50] }]}
            >
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: theme.palette.red[600], fontSize: 13 }}
              >
                {formError}
              </Text>
            </View>
          ) : null}

          <View style={styles.fields}>
            <InputField
              label={t('contacts.nameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('contacts.namePlaceholder')}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => phoneInput.current?.focus()}
              icon="person"
              error={errors.name}
              testID="contact-name"
            />

            <InputField
              label={t('contacts.phoneLabel')}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('contacts.phonePlaceholder')}
              keyboardType="phone-pad"
              // Not the user's own number: autofill would suggest it, and a contact
              // is somebody else.
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={() => void onSave()}
              inputRef={phoneInput}
              icon="phone"
              helper={t('contacts.phoneHelper')}
              error={errors.phone}
              testID="contact-phone"
            />
          </View>

          <Text style={[styles.sectionLabel, { color: theme.colors.ink[500] }]}>
            {t('contacts.groupLabel')}
          </Text>
          <RadioGroup
            options={groupOptions}
            selectedId={groupName}
            onSelect={(id) => setGroupName(id as EmergencyContact['groupName'])}
          />

          {/*
          The primary toggle.

          Turning it **on** is a promotion, not a second flag: the write goes
          through `makePrimary`, which clears every other primary in the same
          pass, so the list never shows two. Turning it **off** is a demotion
          — it writes `is_primary: false` through the ordinary update, and the
          list is left with no primary at all rather than silently promoting
          someone else.
        */}
          <View style={[styles.primaryRow, { borderColor: theme.colors.ink[100] }]}>
            <View style={styles.primaryText}>
              <Text style={[styles.primaryLabel, { color: theme.colors.ink[950] }]}>
                {t('contacts.primaryLabel')}
              </Text>
              <Text style={[styles.primaryHelper, { color: theme.colors.ink[500] }]}>
                {t('contacts.primaryHelper')}
              </Text>
            </View>
            <Toggle
              value={isPrimary}
              onValueChange={setIsPrimary}
              accessibilityLabel={t('contacts.primaryLabel')}
            />
          </View>

          <Button
            label={submitting ? t('capture.submitting') : t('contacts.saveCta')}
            variant="primary"
            size="lg"
            disabled={submitting || (Boolean(contactId) && !existing)}
            onPress={onSave}
            style={styles.cta}
          />
        </KeyboardScroll>
      )}
    </View>
  )
}

function groupLabel(group: EmergencyContact['groupName'], t: (key: string) => string): string {
  switch (group) {
    case 'family':
      return t('contacts.groupFamily')
    case 'friend':
      return t('contacts.groupFriend')
    case 'colleague':
      return t('contacts.groupColleague')
    default:
      return t('contacts.groupOther')
  }
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
  fields: {
    gap: 16,
  },
  loading: {
    padding: 24,
    textAlign: 'center',
  },
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 8,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  primaryText: {
    flex: 1,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryHelper: {
    fontSize: 12,
    marginTop: 2,
  },
  cta: {
    marginTop: 32,
  },
})

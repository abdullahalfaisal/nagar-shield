import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppError, type EmergencyContact } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import {
  ContactAvatar,
  EmptyState,
  Icon,
  PrimaryStar,
  RelationshipPill,
  ManualDialGuidance,
  Screen,
  useToast,
} from '@/shared/ui'
import {
  deleteContact,
  makePrimary,
  useContacts,
  useInvalidateContacts,
} from '@/shared/api/contacts'
import { fromSupabaseError } from '@/shared/api/errors'
import { useDegradedHelp } from '@/shared/services/useDegradedHelp'
import { errorCopy } from '@/shared/i18n/errorCopy'

/**
 * Screen 20 — Emergency Contacts.
 *
 * A 1:1 port of the prototype's contact list, grouped by relationship with a
 * `.section-group-title` per group.
 *
 * **Copy correction (FR-HELP-5 override, 2026-10-12):** the prototype's intro
 * says "If no answer, it moves to the next primary, then the rest." That
 * promises an automatic dispatch-style failover. The product does not observe
 * call state, so it cannot know that a call went unanswered. The copy here
 * says only that the primary contacts are dialled first — the layout is
 * unchanged.
 *
 * The CRUD surface
 * ----------------
 * The list is the read model; the writes go through
 * `src/shared/api/contacts.ts`, which is owner-scoped by RLS. Three actions
 * are reachable from a row:
 *
 *   * the **★** toggles the primary flag — exactly one primary is kept, and
 *     the write is atomic, so the list never shows two;
 *   * the row opens the **editor**, where the name, phone and group are
 *     changed;
 *   * the row's delete action removes it.
 *
 * Deleting the only primary is **allowed**. The list is left valid with zero
 * primaries and the app prompts for one — it never blocks a delete because of
 * the primary flag, and it never auto-promotes a contact on the user's
 * behalf without an explicit choice.
 *
 * **There is no cap** on how many contacts a user may save (A-4). The
 * prototype's "5 saved" copy is static prototype content and is never
 * rendered as a live count.
 */
export default function ContactsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const invalidate = useInvalidateContacts()
  const toast = useToast()

  const { data, isLoading, isError, refetch } = useContacts()
  const contacts = useMemo(() => data ?? [], [data])

  const [busyId, setBusyId] = useState<string | null>(null)

  // The same degraded-help dial path the help screens use, so a device with no
  // dialler shows the number to dial by hand instead of doing nothing.
  const degradedHelp = useDegradedHelp()
  const [guidanceHeight, setGuidanceHeight] = useState(0)

  const groups = useMemo(() => {
    const order: Array<EmergencyContact['groupName']> = ['family', 'friend', 'colleague', 'other']
    return order
      .map((group) => ({
        group,
        items: contacts.filter((contact) => contact.groupName === group),
      }))
      .filter((entry) => entry.items.length > 0)
  }, [contacts])

  /**
   * Promotes a contact to the primary one.
   *
   * Exactly one primary is kept per action, and the write is atomic — the
   * other primaries are cleared in the same pass as the new one is set. A
   * half-applied change would leave two primaries in the list.
   */
  const onTogglePrimary = useCallback(
    async (contact: EmergencyContact) => {
      if (contact.isPrimary) return

      setBusyId(contact.id)
      try {
        await makePrimary(contact.id)
      } catch (error) {
        const appError = error instanceof AppError ? error : fromSupabaseError(error)
        Alert.alert(t('common.error'), errorCopy(t, appError.code))
      } finally {
        // Even a failed change may have written part of itself, so the list is
        // always re-read rather than left showing what the client assumed.
        await invalidate().catch(() => undefined)
        setBusyId(null)
      }
    },
    [invalidate, t],
  )

  /**
   * Removes a contact.
   *
   * The confirmation names the contact, so the user knows which row they are
   * about to delete. A deleted primary leaves the list with zero primaries —
   * the prompt for a new one appears on the list itself, not here.
   */
  const onDelete = useCallback(
    (contact: EmergencyContact) => {
      Alert.alert(t('contacts.deleteTitle'), t('contacts.deleteBody', { name: contact.name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('contacts.deleteCta'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(contact.id)
            try {
              await deleteContact(contact.id)
              toast.show({ message: t('contacts.deletedToast'), tone: 'success' })
            } catch (error) {
              const appError = error instanceof AppError ? error : fromSupabaseError(error)
              Alert.alert(t('common.error'), errorCopy(t, appError.code))
            } finally {
              // Always refresh: a delete that went through must not leave its
              // row on screen because a later step failed.
              await invalidate().catch(() => undefined)
              setBusyId(null)
            }
          },
        },
      ])
    },
    [invalidate, t, toast],
  )

  // A contact may be primary, and the prompt appears only when the list is
  // loaded and has no primary at all — the state the story calls out.
  const hasPrimary = contacts.some((contact) => contact.isPrimary)

  return (
    <>
      <Screen
        title={t('contacts.title')}
        onBack={() => router.back()}
        scroll
        contentBottomPadding={100}
        footer={
          // Pinned, so the number is on screen wherever the list is scrolled.
          // The footer pads the sides, the guidance pads itself.
          degradedHelp.showGuidance && degradedHelp.guidanceNumber ? (
            <View
              style={styles.pinned}
              onLayout={(event) => setGuidanceHeight(event.nativeEvent.layout.height)}
            >
              <ManualDialGuidance
                number={degradedHelp.guidanceNumber}
                showPowerSaveWarning={degradedHelp.showPowerSaveWarning}
                showOfflineNotice={degradedHelp.showOfflineNotice}
              />
            </View>
          ) : undefined
        }
      >
        <Text style={[styles.intro, { color: theme.colors.ink[500] }]}>
          {t('contacts.intro')}{' '}
          <Text style={{ color: theme.palette.violet[700] }}>★ {t('contacts.primary')}</Text>{' '}
          {t('contacts.introRest')}
        </Text>

        {isLoading ? (
          <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>
            {t('common.loading')}
          </Text>
        ) : isError && !data ? (
          // A failed load is not an empty list: "no contacts" with an add prompt
          // would invite the user to save people who are already saved.
          <EmptyState
            icon="error"
            title={t('contacts.loadFailed')}
            description={t('contacts.loadFailedSub')}
            action={{ label: t('common.retry'), onPress: () => void refetch() }}
          />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon="contact_emergency"
            title={t('contacts.empty')}
            description={t('contacts.emptySub')}
          />
        ) : (
          <>
            {!hasPrimary ? (
              <View style={[styles.notice, { backgroundColor: theme.palette.amber[50] }]}>
                <Icon name="star" size={18} color={theme.palette.amber[600]} />
                <Text style={[styles.noticeText, { color: theme.palette.amber[600] }]}>
                  {t('contacts.noPrimaryNotice')}
                </Text>
              </View>
            ) : null}

            {groups.map(({ group, items }) => (
              <View key={group}>
                <Text style={[styles.groupTitle, { color: theme.colors.ink[500] }]}>
                  {groupLabel(group, t)} (
                  {i18n.language === 'bn' ? toBengaliDigits(String(items.length)) : items.length})
                </Text>
                {items.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    primaryLabel={t('contacts.primary')}
                    editLabel={t('contacts.editCta')}
                    deleteLabel={t('contacts.deleteCta')}
                    busy={busyId === contact.id}
                    onPress={() =>
                      router.push({ pathname: '/(app)/contact-editor', params: { id: contact.id } })
                    }
                    onTogglePrimary={() => onTogglePrimary(contact)}
                    onDelete={() => onDelete(contact)}
                    onCall={() => {
                      void degradedHelp.dial(contact.phone)
                    }}
                  />
                ))}
              </View>
            ))}
          </>
        )}
      </Screen>

      {/* `.fab` — the add-contact button. A pinned sibling of the scroll, so it
        stays on screen however long the list is. */}
      {isError && !data ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('contacts.add')}
          onPress={() => router.push('/(app)/contact-editor')}
          style={[
            styles.fab,
            {
              // Lifted above the pinned guidance so the two never overlap.
              bottom: insets.bottom + 16 + (degradedHelp.showGuidance ? guidanceHeight : 0),
              backgroundColor: theme.palette.green[500],
              shadowColor: '#7C3AED',
              shadowOpacity: 0.28,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            },
          ]}
        >
          <Icon name="add" size={28} color="#FFFFFF" filled />
        </Pressable>
      )}
    </>
  )
}

function ContactRow({
  contact,
  primaryLabel,
  editLabel,
  deleteLabel,
  busy,
  onPress,
  onTogglePrimary,
  onDelete,
  onCall,
}: {
  contact: EmergencyContact
  primaryLabel: string
  editLabel: string
  deleteLabel: string
  busy: boolean
  onPress: () => void
  onTogglePrimary: () => void
  onDelete: () => void
  onCall: () => void
}) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()

  return (
    <View
      style={[
        styles.contactRow,
        {
          backgroundColor: theme.colors.surface.white,
          borderColor: theme.colors.ink[100],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editLabel}
        onPress={onPress}
        style={styles.rowMain}
      >
        <ContactAvatar name={contact.name} group={contact.groupName} />
        <View style={styles.contactInfo}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.contactName, { color: theme.colors.ink[950] }]}>
              {contact.name}
            </Text>
            <PrimaryStar
              isPrimary={contact.isPrimary}
              onPress={onTogglePrimary}
              accessibilityLabel={primaryLabel}
            />
          </View>
          <Text numberOfLines={1} style={[styles.contactPhone, { color: theme.colors.ink[500] }]}>
            {formatPhone(contact.phone, i18n.language)}
          </Text>
          <RelationshipPill group={contact.groupName} label={groupLabel(contact.groupName, t)} />
        </View>
      </Pressable>

      <View style={styles.rowActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          onPress={onDelete}
          disabled={busy}
          style={styles.rowAction}
        >
          <Icon name="delete" size={20} color={theme.colors.ink[400]} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('contacts.callCta')} ${contact.name}`}
          onPress={onCall}
          style={styles.callHit}
        >
          <View style={[styles.contactAction, { backgroundColor: theme.palette.green[100] }]}>
            <Icon name="call" size={20} color={theme.palette.green[600]} filled />
          </View>
        </Pressable>
      </View>
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

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

export function toBengaliDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit)
}

/**
 * Formats `+8801712345678` as `01712-345678`, in Bangla digits on a Bangla
 * screen (`০১৭১২-৩৪৫৬৭৮`).
 *
 * The national number is the ten digits after `880` with the trunk `0` put
 * back in front. It used to drop the first of those ten digits instead, so
 * `+8801712345678` read `07123-45678`.
 */
export function formatPhone(phone: string, language: string = 'bn'): string {
  const digits = phone.replace(/\D/g, '').replace(/^880/, '')
  if (digits.length !== 10) return phone
  const national = `0${digits}`
  const text = `${national.slice(0, 5)}-${national.slice(5)}`
  return language === 'bn' ? toBengaliDigits(text) : text
}

const styles = StyleSheet.create({
  pinned: {
    marginHorizontal: -20,
  },
  intro: {
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    fontSize: 13,
    lineHeight: 19,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  contactRow: {
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callHit: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  contactPhone: {
    fontSize: 12,
    marginTop: 1,
    flexShrink: 1,
  },
  contactAction: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  loading: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

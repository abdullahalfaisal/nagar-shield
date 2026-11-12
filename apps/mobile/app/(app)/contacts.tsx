import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { EmergencyContact } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { ContactAvatar, EmptyState, Icon, PrimaryStar, RelationshipPill, Screen } from '@/shared/ui';
import { useContacts } from '@/shared/api/contacts';

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
 * The prototype's `★` is a clickable toggle; here it is **read-only**, because
 * changing the primary flag belongs to the contact CRUD flow and the star on
 * this screen is a status marker.
 */
export default function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const { data, isLoading } = useContacts();
  const contacts = useMemo(() => data ?? [], [data]);

  const groups = useMemo(() => {
    const order: Array<EmergencyContact['groupName']> = ['family', 'friend', 'colleague', 'other'];
    return order
      .map((group) => ({
        group,
        items: contacts.filter((contact) => contact.groupName === group),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [contacts]);

  return (
    <Screen
      title={t('contacts.title')}
      onBack={() => router.back()}
      scroll
      contentBottomPadding={100}
    >
      <Text style={[styles.intro, { color: theme.colors.ink[500] }]}>
        {t('contacts.intro')}{' '}
        <Text style={{ color: theme.palette.violet[700] }}>★ {t('contacts.primary')}</Text>{' '}
        {t('contacts.introRest')}
      </Text>

      {isLoading ? (
        <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>{t('common.loading')}</Text>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon="contact_emergency"
          title={t('contacts.empty')}
          description={t('contacts.emptySub')}
        />
      ) : (
        groups.map(({ group, items }) => (
          <View key={group}>
            <Text style={[styles.groupTitle, { color: theme.colors.ink[500] }]}>
              {groupLabel(group, t)} ({toBengaliDigits(String(items.length))})
            </Text>
            {items.map((contact) => (
              <ContactRow key={contact.id} contact={contact} primaryLabel={t('contacts.primary')} />
            ))}
          </View>
        ))
      )}

      {/* `.fab` — the add-contact button. */}
      <View
        accessibilityRole="button"
        accessibilityLabel={t('contacts.add')}
        style={[
          styles.fab,
          {
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
      </View>
    </Screen>
  );
}

function ContactRow({
  contact,
  primaryLabel,
}: {
  contact: EmergencyContact;
  primaryLabel: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

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
      <ContactAvatar name={contact.name} group={contact.groupName} />
      <View style={styles.contactInfo}>
        <View style={styles.nameRow}>
          <Text style={[styles.contactName, { color: theme.colors.ink[950] }]}>
            {contact.name}
          </Text>
          <PrimaryStar isPrimary={contact.isPrimary} accessibilityLabel={primaryLabel} />
        </View>
        <Text style={[styles.contactPhone, { color: theme.colors.ink[500] }]}>
          {formatPhone(contact.phone)}
        </Text>
        <RelationshipPill group={contact.groupName} label={groupLabel(contact.groupName, t)} />
      </View>
      <View style={[styles.contactAction, { backgroundColor: theme.palette.green[100] }]}>
        <Icon name="call" size={20} color={theme.palette.green[600]} filled />
      </View>
    </View>
  );
}

function groupLabel(group: EmergencyContact['groupName'], t: (key: string) => string): string {
  switch (group) {
    case 'family':
      return t('contacts.groupFamily');
    case 'friend':
      return t('contacts.groupFriend');
    case 'colleague':
      return t('contacts.groupColleague');
    default:
      return t('contacts.groupOther');
  }
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[Number(digit)] ?? digit);
}

/** Formats `+8801712345678` as the prototype's `০১৭১২-৩৪৫৬৭৮`. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^880/, '');
  if (digits.length !== 10) return phone;
  const national = `0${digits.slice(1)}`;
  return toBengaliDigits(`${national.slice(0, 5)}-${national.slice(5)}`);
}

const styles = StyleSheet.create({
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
  contactInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: 12,
    marginTop: 1,
  },
  contactAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

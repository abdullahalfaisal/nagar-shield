import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/theme';
import { Button, ContactAvatar, EmptyState, Icon, PrimaryStar, Screen } from '@/shared/ui';
import { useContacts } from '@/shared/api/contacts';
import { formatAddressLine, formatCoordinates, useReverseGeocode } from '@/shared/api/geocode';

/**
 * Screen 19 — Location Sharing.
 *
 * A 1:1 port of the prototype's screen, with one enforced data deviation:
 *
 * - The `.map-preview` is a **static illustration**, not a live map. It keeps
 *   the prototype's road grid, the centre pin, the "আপনি এখানে" label and the
 *   pulse. The live map belongs to the History surface (unit 006).
 * - The address card shows the **live** reverse-geocode and the **live**
 *   coordinates. The prototype's hardcoded `বাড়ি ১২, রোড ৭, বসুন্ধরা R/A, ঢাকা`
 *   and `23.7806° N, 90.4066° E` are placeholders and must never ship.
 *
 * The share-with-all toggle reaches **primary contacts only** — the sub-line
 * says so, unlike the prototype's "all your emergency contacts will see it".
 */
export default function LocationSharingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const { data: contacts } = useContacts();
  const contactList = useMemo(() => contacts ?? [], [contacts]);

  // The fix itself comes from the device. Until the permission flow lands
  // (unit 005 story 05) the coordinates are null and the card degrades.
  const [fix] = useState<{ lat: number; lng: number; accuracyM: number | null } | null>(null);

  const { data: geocode, isLoading: geocoding } = useReverseGeocode(
    fix?.lat ?? null,
    fix?.lng ?? null,
    fix?.accuracyM ?? null,
  );

  const [shareWithAll, setShareWithAll] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const primaries = contactList.filter((contact) => contact.isPrimary);
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const hasRecipient = shareWithAll ? primaries.length > 0 : selectedCount > 0;

  const toggle = (id: string) =>
    setSelected((current) => ({ ...current, [id]: !current[id] }));

  const addressLine = geocode ? formatAddressLine(geocode) : '';
  const coordsLine = fix ? formatCoordinates(fix.lat, fix.lng) : t('location.coordsUnavailable');

  return (
    <Screen
      title={t('location.title')}
      onBack={() => router.back()}
      scroll
      contentBottomPadding={110}
    >
      {/* `.map-preview` — a static illustration, not a live map. */}
      <View
        style={[
          styles.mapPreview,
          {
            borderColor: theme.colors.ink[100],
            shadowColor: '#0F172A',
            shadowOpacity: 0.05,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 3,
          },
        ]}
      >
        <View style={styles.mapRoads} />
        <View style={styles.mapPin}>
          <View style={[styles.mapPinLabel, { backgroundColor: theme.colors.ink[950] }]}>
            <Text style={styles.mapPinLabelText}>{t('location.pinLabel')}</Text>
          </View>
          <View style={[styles.mapPinDot, { backgroundColor: theme.palette.violet[600] }]} />
          <View style={[styles.mapPinPulse, { backgroundColor: theme.palette.violet[500] }]} />
        </View>
      </View>

      {/* `.address-card` */}
      <View
        style={[
          styles.addressCard,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor: theme.colors.ink[100],
          },
        ]}
      >
        <View style={styles.addressHeader}>
          <Icon name="location_on" size={14} color={theme.colors.ink[500]} />
          <Text style={[styles.addressHeaderText, { color: theme.colors.ink[500] }]}>
            {t('location.addressTitle')}
          </Text>
        </View>

        {geocoding ? (
          <Text style={[styles.addressResolving, { color: theme.colors.ink[500] }]}>
            {t('location.resolving')}
          </Text>
        ) : addressLine ? (
          <Text style={[styles.addressText, { color: theme.colors.ink[950] }]}>{addressLine}</Text>
        ) : (
          <Text style={[styles.addressResolving, { color: theme.colors.ink[500] }]}>
            {t('location.resolving')}
          </Text>
        )}

        <Text style={[styles.coordsText, { color: theme.colors.ink[500] }]}>{coordsLine}</Text>

        {fix?.accuracyM != null ? (
          <Text style={[styles.accuracyText, { color: theme.colors.ink[500] }]}>
            {t('location.autoDetected', { accuracy: fix.accuracyM })}
          </Text>
        ) : null}
      </View>

      {/* `.share-toggle-row` */}
      <View
        style={[
          styles.shareToggleRow,
          {
            backgroundColor: theme.colors.surface.white,
            borderColor: theme.colors.ink[100],
          },
        ]}
      >
        <View style={styles.shareToggleContent}>
          <Text style={[styles.shareToggleTitle, { color: theme.colors.ink[950] }]}>
            {t('location.toggleTitle')}
          </Text>
          <Text style={[styles.shareToggleSub, { color: theme.colors.ink[500] }]}>
            {t('location.toggleSub')}
          </Text>
        </View>
        <ShareToggle
          value={shareWithAll}
          onValueChange={setShareWithAll}
          accessibilityLabel={t('location.toggleTitle')}
        />
      </View>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.ink[100] }]} />
        <Text style={[styles.dividerText, { color: theme.colors.ink[500] }]}>
          {t('location.specific')}
        </Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.ink[100] }]} />
      </View>

      {/* Specific contacts */}
      {contactList.length === 0 ? (
        <EmptyState
          icon="contact_emergency"
          title={t('location.empty')}
          description={t('location.noContacts')}
        />
      ) : (
        <View style={styles.contactList}>
          {contactList.map((contact) => (
            <View
              key={contact.id}
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
                  {contact.isPrimary ? (
                    <PrimaryStar isPrimary accessibilityLabel={t('contacts.primary')} />
                  ) : null}
                </View>
                <Text style={[styles.contactPhone, { color: theme.colors.ink[500] }]}>
                  {contact.phone}
                </Text>
              </View>
              <Checkbox
                checked={Boolean(selected[contact.id])}
                onPress={() => toggle(contact.id)}
                accessibilityLabel={contact.name}
              />
            </View>
          ))}
        </View>
      )}

      {/* `.sticky-cta` */}
      <View style={styles.stickyCta}>
        <Button
          label={t('location.cta')}
          icon="ios_share"
          variant="primary"
          size="lg"
          disabled={!hasRecipient}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

/**
 * `.custom-checkbox` — a 22 dp box with a 1.5 dp `--ink-300` border that
 * fills `--violet-600` when checked. The tap target is padded to 48 dp.
 */
function Checkbox({
  checked,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={13}
      style={styles.checkboxHit}
    >
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: checked ? theme.palette.violet[600] : theme.colors.surface.white,
            borderColor: checked ? theme.palette.violet[600] : theme.colors.ink[300],
          },
        ]}
      >
        {checked ? <View style={styles.checkboxTick} /> : null}
      </View>
    </Pressable>
  );
}

/** The prototype's `.toggle` — 44 × 26 with a 22 dp knob. */
function ShareToggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange(!value)}
      hitSlop={11}
      style={styles.toggleHit}
    >
      <View
        style={[
          styles.toggleTrack,
          { backgroundColor: value ? theme.palette.violet[600] : theme.colors.ink[200] },
        ]}
      >
        <View
          style={[
            styles.toggleKnob,
            {
              backgroundColor: theme.staticColors.white,
              transform: [{ translateX: value ? 18 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mapPreview: {
    height: 240,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#EFE6F8',
  },
  mapRoads: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F3ECFB',
  },
  mapPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 24,
    height: 24,
    marginTop: -12,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  mapPinPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    opacity: 0.35,
  },
  mapPinLabel: {
    position: 'absolute',
    top: -34,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  mapPinLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  addressCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addressHeaderText: {
    fontSize: 12,
    fontWeight: '500',
  },
  addressText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.01,
    marginBottom: 4,
  },
  addressResolving: {
    fontSize: 14,
    marginBottom: 4,
  },
  coordsText: {
    fontSize: 11,
  },
  accuracyText: {
    fontSize: 11,
    marginTop: 2,
  },
  shareToggleRow: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shareToggleContent: {
    flex: 1,
  },
  shareToggleTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  shareToggleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
  },
  contactList: {
    marginHorizontal: 20,
  },
  contactRow: {
    marginBottom: 8,
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
  checkboxHit: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    width: 6,
    height: 10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }, { translateY: -1 }],
  },
  toggleHit: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    position: 'absolute',
    left: 2,
  },
  stickyCta: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});

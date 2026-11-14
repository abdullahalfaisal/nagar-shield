import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import {
  BottomSheet,
  Button,
  ContactAvatar,
  EmptyState,
  Icon,
  InputField,
  PrimaryStar,
  Screen,
  StatusBanner,
  Toggle,
} from '@/shared/ui'
import { useContacts } from '@/shared/api/contacts'
import { formatAddressLine, formatCoordinates, useReverseGeocode } from '@/shared/api/geocode'
import {
  takeLocationFix,
  parseManualCoordinates,
  type FixOutcome,
} from '@/shared/services/locationFix'
import {
  selectExplicitRecipients,
  selectPrimaryRecipients,
  shareLocation,
  type ShareResult,
} from '@/shared/services/shareLocation'
import type { SharePosition } from '@/shared/api/locationShares'

/**
 * Screen 19 — Location Sharing.
 *
 * A 1:1 port of the prototype's screen, with these enforced deviations:
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
 *
 * The permission prompt fires **just-in-time** — at the CTA, never on mount
 * (FR-PERMS-1). The screen opens with the address card in its degraded
 * "location unavailable" state, and the two fallbacks — manual coordinate
 * entry and share-without-location — are always reachable (FR-PERMS-2).
 */
export default function LocationSharingScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t } = useTranslation()

  const { data: contacts } = useContacts()
  const contactList = useMemo(() => contacts ?? [], [contacts])

  // The fix is taken **just-in-time** — from the CTA handler, never from a
  // mount effect. Until it is taken, the card renders in its degraded state.
  const [fix, setFix] = useState<SharePosition | null>(null)
  const [fixState, setFixState] = useState<'idle' | 'acquiring'>('idle')

  const { data: geocode, isLoading: geocoding } = useReverseGeocode(
    fix?.lat ?? null,
    fix?.lng ?? null,
    fix?.accuracyM ?? null,
  )

  // The toggle's **ON default is kept** — it is the panic-friendly default.
  const [shareWithAll, setShareWithAll] = useState(true)
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  // The manual coordinate entry.
  const [manualVisible, setManualVisible] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  // The post-share confirmation.
  const [result, setResult] = useState<ShareResult | null>(null)
  const [busy, setBusy] = useState(false)

  const primaries = useMemo(() => selectPrimaryRecipients(contactList), [contactList])

  // The toggle's **default selector**: it selects every primary, and the
  // per-contact checkboxes stay authoritative at confirm time. A primary the
  // user unchecked is excluded — deselection wins.
  const deselectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, isSelected]) => !isSelected)
        .map(([id]) => id),
    [selected],
  )

  const recipients = useMemo(
    () =>
      shareWithAll
        ? selectPrimaryRecipients(contactList, deselectedIds)
        : selectExplicitRecipients(
            contactList,
            Object.entries(selected)
              .filter(([, isSelected]) => isSelected)
              .map(([id]) => id),
          ),
    [contactList, shareWithAll, deselectedIds, selected],
  )

  const selectedCount = Object.values(selected).filter(Boolean).length
  const hasRecipient = shareWithAll ? recipients.length > 0 : selectedCount > 0

  const toggle = (id: string) => setSelected((current) => ({ ...current, [id]: !current[id] }))

  /** The address card's coordinate line. */
  const coordsLine = fix
    ? formatCoordinates(fix.lat as number, fix.lng as number)
    : t('location.coordsUnavailable')

  const addressLine = geocode ? formatAddressLine(geocode) : ''

  /**
   * Takes the fix, just-in-time.
   *
   * The permission prompt fires **here** — at the moment the user asked for
   * the share — and nowhere else. A failed or refused permission leaves the
   * screen fully rendered with both fallbacks available.
   */
  const acquireFix = useCallback(async (): Promise<FixOutcome> => {
    setFixState('acquiring')
    const outcome = await takeLocationFix()

    if (outcome.status === 'ready') {
      setFix({ lat: outcome.lat, lng: outcome.lng, accuracyM: outcome.accuracyM })
      setFixState('idle')
    } else {
      setFixState('idle')
    }

    return outcome
  }, [])

  /**
   * The share.
   *
   * The share is **never blocked**: a refused permission, a failed fix, and a
   * failed write are all reported, never thrown.
   */
  const onShare = useCallback(async () => {
    if (busy) return
    setBusy(true)

    // The clock starts at the confirm tap.
    const startedAt = Date.now()

    let position: SharePosition | null = fix

    if (!position) {
      // No fix yet — take one, just-in-time. A refusal is not an error: the
      // share continues without a location.
      const outcome = await acquireFix()

      if (outcome.status === 'ready') {
        position = { lat: outcome.lat, lng: outcome.lng, accuracyM: outcome.accuracyM }
      }
    }

    const shareResult = await shareLocation({
      recipients,
      position,
      withoutLocationNote: t('location.shareWithoutLocationNote'),
      startedAt,
      locale: 'bn',
    })

    setResult(shareResult)
    setBusy(false)
  }, [acquireFix, busy, fix, recipients, t])

  /** Saves the manual coordinate entry. */
  const onSaveManual = useCallback(() => {
    const parsed = parseManualCoordinates(manualLat, manualLng)

    if (!parsed.ok) {
      setManualError(t('location.manualErrorInvalid'))
      return
    }

    setManualError(null)
    setFix({ lat: parsed.lat, lng: parsed.lng, accuracyM: null })
    setManualVisible(false)
  }, [manualLat, manualLng, t])

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

        {fixState === 'acquiring' || geocoding ? (
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

        {/* The degraded state. The card never shows a stale coordinate and
            never shows a fabricated address. */}
        {!fix ? (
          <View style={styles.degradedBlock}>
            <Text style={[styles.degradedTitle, { color: theme.colors.ink[950] }]}>
              {t('location.addressUnavailable')}
            </Text>
            <Text style={[styles.degradedBody, { color: theme.colors.ink[500] }]}>
              {t('location.addressUnavailableBody')}
            </Text>
            <Button
              label={t('location.manualEntry')}
              variant="secondary"
              size="md"
              onPress={() => setManualVisible(true)}
            />
            <Button
              label={t('location.shareWithoutLocation')}
              variant="ghost"
              size="md"
              onPress={() => {
                setFix(null)
                void onShare()
              }}
            />
          </View>
        ) : null}
      </View>

      {/* The post-share confirmation. It names the recipients and what was
          shared, and it claims no receipt (ADR-005). */}
      {result ? (
        <View style={styles.confirmationBlock}>
          <StatusBanner
            tone="saved"
            title={t('location.confirmedTitle')}
            body={t('location.confirmedBody')}
          />
          {result.shared.app + result.shared.os_share_sheet === 0 ? (
            <Text style={[styles.confirmationNote, { color: theme.colors.ink[500] }]}>
              {t('location.dismissed')}
            </Text>
          ) : null}
          {result.failed.app > 0 ? (
            <Text style={[styles.confirmationNote, { color: theme.colors.ink[500] }]}>
              {t('location.failedRecord')}
            </Text>
          ) : null}
        </View>
      ) : null}

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
            {t('location.shareAllPrimaries')}
          </Text>
        </View>
        <Toggle
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

      {/* The sticky CTA. It is disabled **only** when there is nobody to
          share with — never by a pending permission dialog, a slow fix, or
          a failed write. */}
      <View style={styles.stickyCta}>
        <Button
          label={t('location.cta')}
          icon="ios_share"
          variant="primary"
          size="lg"
          disabled={!hasRecipient || busy}
          onPress={() => void onShare()}
        />
        {shareWithAll && primaries.length === 0 ? (
          <Text style={[styles.ctaHint, { color: theme.colors.ink[500] }]}>
            {t('location.shareNoPrimaries')}
          </Text>
        ) : null}
      </View>

      {/* The manual coordinate entry. */}
      <BottomSheet
        visible={manualVisible}
        title={t('location.manualTitle')}
        helper={t('location.addressUnavailableBody')}
        onClose={() => setManualVisible(false)}
      >
        <InputField
          label={t('location.manualLatLabel')}
          value={manualLat}
          onChangeText={setManualLat}
          keyboardType="numbers-and-punctuation"
          error={manualError ?? undefined}
          placeholder={t('location.manualLatPlaceholder')}
        />
        <View style={styles.manualGap} />
        <InputField
          label={t('location.manualLngLabel')}
          value={manualLng}
          onChangeText={setManualLng}
          keyboardType="numbers-and-punctuation"
          placeholder={t('location.manualLngPlaceholder')}
        />
        <View style={styles.manualGap} />
        <Button
          label={t('location.manualSave')}
          variant="primary"
          size="lg"
          onPress={onSaveManual}
        />
      </BottomSheet>
    </Screen>
  )
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
  checked: boolean
  onPress: () => void
  accessibilityLabel: string
}) {
  const theme = useTheme()
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
  )
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
  degradedBlock: {
    marginTop: 12,
    gap: 8,
  },
  degradedTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  degradedBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  confirmationBlock: {
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  confirmationNote: {
    fontSize: 12,
    lineHeight: 18,
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
  stickyCta: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  ctaHint: {
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  manualGap: {
    height: 12,
  },
})

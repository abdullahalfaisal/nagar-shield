import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import {
  BottomSheet,
  Button,
  ContactAvatar,
  InputField,
  PrimaryStar,
  Screen,
  Toggle,
  useToast,
  withAlpha,
} from '@/shared/ui'
import { FormCard } from '@/shared/ui/FormCard'
import { SolidIcon, type SolidIconName } from '@/shared/ui/SolidIcon'
import { appFont, type FontWeightName } from '@/shared/theme/appFont'
import { mixHex } from '@/shared/theme/colorMix'
import { TileMapFallback } from '@/shared/ui/TileMapFallback'
import { TILE_ATTRIBUTION } from '@/shared/ui/tileSource'
import { DHAKA_FALLBACK_ORIGIN } from '@/shared/services/location'
import { useContacts } from '@/shared/api/contacts'
import { toBengaliDigits } from '@/shared/utils/relativeTime'
import { formatAddressLine, formatCoordinatesShort, useReverseGeocode } from '@/shared/api/geocode'
import { useAreaName } from '@/shared/api/areas'
import {
  takeLocationFix,
  raceFixAgainstTimeout,
  takeLastKnownFix,
  takeSilentLocationFix,
  parseManualCoordinates,
  type FixOutcome,
} from '@/shared/services/locationFix'
import {
  selectExplicitRecipients,
  selectPrimaryRecipients,
  shareLocation,
  type ShareResult,
} from '@/shared/services/shareLocation'
import {
  isRecipientChecked,
  selectionForToggle,
  toggleRecipient,
} from '@/shared/services/recipientSelection'
import type { EmergencyContact } from '@nagar-shield/shared'
import type { SharePosition } from '@/shared/api/locationShares'

/**
 * Screen 19 — Location Sharing.
 *
 * Two cards on one scrolling page, built like the Report Crime cards: "Your
 * location" (the map and one row saying where you are) and "Send to" (the
 * primary-contacts switch, then the people). The map shows the city until a fix
 * exists; when location is already allowed the position is taken silently as
 * the screen opens (it never prompts on open), otherwise the prompt comes from a
 * tap. The row shows the **live** reverse-geocode and the **live** coordinates,
 * never a placeholder.
 *
 * The share-with-all toggle reaches **primary contacts only** — the sub-line
 * says so, unlike the prototype's "all your emergency contacts will see it".
 *
 * The permission prompt fires **just-in-time** — at the CTA, never on mount
 * (FR-PERMS-1). The screen opens with the address card in its degraded
 * "location unavailable" state, and the two fallbacks — manual coordinate
 * entry and share-without-location — are always reachable (FR-PERMS-2).
 */
/** A GPS fix older than this is retaken before a share. */
const FIX_MAX_AGE_MS = 60_000

export default function LocationSharingScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const areaName = useAreaName()
  const toast = useToast()
  const font = useFont()
  const violet = theme.palette.violet[600]
  const locale = i18n.language === 'bn' ? 'bn' : 'en'

  // A failed load is not an empty list: sharing would look disabled with no
  // way out, so the failure is shown with a retry.
  const { data: contacts, isError: contactsFailed, refetch: refetchContacts } = useContacts()
  const contactList = useMemo(() => contacts ?? [], [contacts])

  // The fix is taken **just-in-time**: the *prompt* comes from a tap (the share
  // CTA or "use my location"), never from a mount effect. When the permission
  // is already granted the screen takes the fix silently on open, so the map
  // preview shows where the user is. Until a fix exists, the card renders in
  // its degraded state.
  const [fix, setFix] = useState<SharePosition | null>(null)
  const [fixState, setFixState] = useState<'idle' | 'acquiring'>('idle')

  // Where the fix came from and when, so a share minutes later takes a fresh
  // GPS fix rather than reusing a stale one — but never replaces a coordinate
  // the user typed in.
  const fixMeta = useRef<{ at: number; source: 'gps' | 'manual' } | null>(null)

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
  // The message and which field it belongs under.
  const [manualError, setManualError] = useState<{ field: 'lat' | 'lng'; message: string } | null>(
    null,
  )
  const [manualWarning, setManualWarning] = useState<string | null>(null)

  // The post-share confirmation.
  const [result, setResult] = useState<ShareResult | null>(null)
  const [busy, setBusy] = useState(false)
  // True while a share waits on a fresh fix, so the CTA can say so.
  const [waitingForFix, setWaitingForFix] = useState(false)

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

  const hasRecipient = recipients.length > 0

  const toggle = (contact: EmergencyContact) => {
    const next = toggleRecipient(contact, contactList, shareWithAll, selected)
    setShareWithAll(next.shareWithAll)
    setSelected(next.selected)
  }

  const onToggleAll = (turnOn: boolean) => {
    setSelected(selectionForToggle(contactList, turnOn, shareWithAll, selected))
    setShareWithAll(turnOn)
  }

  /** The address card's coordinate line. */
  const addressLine = geocode ? formatAddressLine(geocode, areaName) : ''
  const addressKnown = Boolean(fix && !geocoding && addressLine)

  // What the card's headline says. "Resolving" only while a lookup is really
  // running: a lookup that finished with nothing says so instead of spinning
  // forever (the geocoder knows no address for some places, and fails offline).
  const addressMain = !fix
    ? fixState === 'acquiring'
      ? t('location.locating')
      : t('location.addressUnavailable')
    : geocoding
      ? t('location.resolving')
      : addressLine || t('location.addressNotFound')

  const accuracyLabel =
    fix?.accuracyM != null
      ? `±${locale === 'bn' ? toBengaliDigits(String(Math.round(fix.accuracyM))) : Math.round(fix.accuracyM)} ${t('location.meterUnit')}`
      : null

  // A share without a location carries null coordinates; there is nothing to
  // centre the map on or to pin.
  const mapFix = fix && fix.lat !== null && fix.lng !== null ? { lat: fix.lat, lng: fix.lng } : null

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
      fixMeta.current = { at: Date.now(), source: 'gps' }
      setFix({ lat: outcome.lat, lng: outcome.lng, accuracyM: outcome.accuracyM })
      setFixState('idle')
    } else {
      setFixState('idle')
    }

    return outcome
  }, [])

  /**
   * The explicit "refresh my location" tap.
   *
   * Unlike the share flow — where a refused or failed fix is silently absorbed
   * because the share carries on regardless — an explicit relocate tap that
   * comes back with nothing is told to the user: the button did something, the
   * map just did not move, and silence would read as a broken button.
   *
   * A GPS fix **replaces whatever is on the map**, including coordinates the
   * user typed in: that protection (never auto-replace a manual entry) guards
   * the *automatic* fix against overwriting a deliberate choice. This tap is
   * itself the deliberate choice to go back to the GPS.
   */
  const onRelocate = useCallback(async () => {
    if (fixState === 'acquiring') return
    const outcome = await acquireFix()
    if (outcome.status !== 'ready') {
      toast.show({ message: t('location.relocateFailed'), tone: 'error' })
    }
  }, [acquireFix, fixState, t, toast])

  // On open: if location is already allowed, show the user's position in the
  // map preview. This never prompts — a screen that asks for permission before
  // the user has asked for anything is what FR-PERMS-1 rules out.
  //
  // Two steps, because a fresh GPS reading can take 10 – 30 s on a cold start:
  // the phone's last known position goes on the map at once, and the fresh fix
  // replaces it when it arrives.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      setFixState('acquiring')

      const known = await takeLastKnownFix()
      if (cancelled) return

      if (known.status === 'ready') {
        fixMeta.current = { at: known.takenAt ?? Date.now(), source: 'gps' }
        setFix({ lat: known.lat, lng: known.lng, accuracyM: known.accuracyM })
      }

      const fresh = await takeSilentLocationFix()
      if (cancelled) return

      // A fix the user typed in while this ran is theirs; do not replace it.
      if (fresh.status === 'ready' && fixMeta.current?.source !== 'manual') {
        fixMeta.current = { at: Date.now(), source: 'gps' }
        setFix({ lat: fresh.lat, lng: fresh.lng, accuracyM: fresh.accuracyM })
      }

      setFixState('idle')
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * The share.
   *
   * The share is **never blocked**: a refused permission, a failed fix, and a
   * failed write are all reported, never thrown.
   */
  const onShare = useCallback(
    async (via: 'message' | 'apps' = 'message', options: { skipFix?: boolean } = {}) => {
      if (busy) return
      setBusy(true)

      // The clock starts at the confirm tap.
      const startedAt = Date.now()

      // "Share without location" sends the no-location message and never asks
      // for, or uses, a position the user has just declined to share.
      let position: SharePosition | null = options.skipFix ? null : fix

      // A typed-in coordinate is the user's own and is never replaced. A GPS fix
      // taken when the screen opened may be minutes old by now, so past a minute
      // it is refreshed (the permission is already granted, so this is silent);
      // if the refresh fails the earlier fix is still better than none.
      const meta = fixMeta.current
      const stale = meta !== null && meta.source === 'gps' && Date.now() - meta.at > FIX_MAX_AGE_MS

      if (!options.skipFix && (!position || stale)) {
        // No fix yet, or a stale one — take one, just-in-time. A refusal is not
        // an error: the share continues with what it has, or without a location.
        // Indoors the reading can take far longer than anyone will wait, so past
        // a few seconds the earlier fix is used and a late one is ignored.
        setWaitingForFix(true)
        const raced = await raceFixAgainstTimeout(acquireFix(), position)
        setWaitingForFix(false)
        position = raced.position
      }

      const shareResult = await shareLocation({
        recipients,
        position,
        withoutLocationNote: t('location.shareWithoutLocationNote'),
        startedAt,
        via,
        // The message and its date follow the app's language, not a fixed one.
        locale,
        labels: {
          title: t('location.shareMessageTitle'),
          titleNoLocation: t('location.shareMessageTitleNoLocation'),
          taken: t('location.shareMessageTaken'),
          accuracy: t('location.shareMessageAccuracy'),
          meterUnit: t('location.meterUnit'),
        },
      })

      setResult(shareResult)
      setBusy(false)
    },
    [acquireFix, busy, fix, locale, recipients, t],
  )

  /** Saves the manual coordinate entry. */
  const onSaveManual = useCallback(() => {
    const parsed = parseManualCoordinates(manualLat, manualLng)

    if (!parsed.ok) {
      setManualError({
        field: parsed.field,
        message: t(parsed.field === 'lat' ? 'location.manualErrorLat' : 'location.manualErrorLng'),
      })
      return
    }

    // A point outside Bangladesh is accepted, but the person may have mistyped
    // it, so the sheet stays open once with a warning and the second tap goes through.
    if (parsed.outsideBangladesh && manualWarning === null) {
      setManualError(null)
      setManualWarning(t('location.manualOutside'))
      return
    }

    setManualError(null)
    setManualWarning(null)
    fixMeta.current = { at: Date.now(), source: 'manual' }
    setFix({ lat: parsed.lat, lng: parsed.lng, accuracyM: null })
    setManualVisible(false)
  }, [manualLat, manualLng, manualWarning, t])

  /** Closing the sheet drops any error, so it does not greet the next opening. */
  const closeManual = useCallback(() => {
    setManualVisible(false)
    setManualError(null)
    setManualWarning(null)
  }, [])

  const ok = theme.palette.green[theme.colors.isDark ? 500 : 700]
  const amber = theme.palette.amber[theme.colors.isDark ? 500 : 600]
  // Small amber text needs more weight than the tile colour on a white card.
  const amberText = theme.colors.isDark ? amber : mixHex(amber, theme.staticColors.black, 0.28)
  const dark = theme.colors.isDark

  const manualFix = Boolean(fix && fix.accuracyM === null)
  const locationTag = mapFix
    ? { text: manualFix ? t('location.tagManual') : t('location.tagAuto'), tone: 'ok' as const }
    : fixState === 'acquiring'
      ? { text: t('location.tagFinding'), tone: 'neutral' as const }
      : { text: t('location.tagNone'), tone: 'warn' as const }

  const whereSub = fix
    ? [formatCoordinatesShort(fix.lat as number, fix.lng as number, locale), accuracyLabel]
        .filter(Boolean)
        .join(' · ')
    : ''

  const sendTag =
    contactList.length === 0
      ? { text: t('location.noneYet'), tone: 'warn' as const }
      : hasRecipient
        ? {
            text: t('location.selectedCount', {
              number:
                locale === 'bn' ? toBengaliDigits(String(recipients.length)) : recipients.length,
            }),
            tone: 'neutral' as const,
          }
        : { text: t('location.pickSomeone'), tone: 'warn' as const }

  const primaryCount =
    locale === 'bn' ? toBengaliDigits(String(primaries.length)) : String(primaries.length)

  const groupLabel = (group: EmergencyContact['groupName']) =>
    t(
      `contacts.group${group === 'family' ? 'Family' : group === 'friend' ? 'Friend' : group === 'colleague' ? 'Colleague' : 'Other'}`,
    )

  return (
    <Screen
      title={t('location.title')}
      subtitle={t('location.subtitle')}
      onBack={() => router.back()}
      footer={
        /* The sticky CTA. It is disabled **only** when there is nobody to
           share with — never by a pending permission dialog, a slow fix, or
           a failed write. */
        <View style={styles.stickyCta}>
          {/* A problem after sending is one line above the buttons: the message
              app is the confirmation, so success says nothing. */}
          {result && (result.status === 'dismissed' || result.status === 'failed') ? (
            <View accessibilityLiveRegion="polite" style={styles.footerNote}>
              <SolidIcon name="warning" size={18} color={amberText} />
              <Text
                style={[styles.footerNoteText, { color: amberText, fontFamily: font('semibold') }]}
              >
                {result.status === 'failed' ? t('location.shareFailed') : t('location.dismissed')}
              </Text>
            </View>
          ) : null}
          <Button
            label={waitingForFix ? t('location.ctaLocating') : t('location.cta')}
            icon="sms"
            variant="primary"
            size="lg"
            disabled={!hasRecipient || busy}
            onPress={() => void onShare('message')}
          />
          {/* The other way out: the OS share sheet, to pick WhatsApp, Messenger or any
              other app, and the person inside it. It needs no contact selected:
              the person is picked inside the app. */}
          <Button
            label={t('location.ctaApps')}
            icon="ios_share"
            variant="ghost"
            size="md"
            disabled={busy}
            onPress={() => void onShare('apps')}
          />
        </View>
      }
    >
      <View style={styles.stack}>
        <FormCard
          title={t('location.yourLocation')}
          tag={locationTag.text}
          tone={locationTag.tone}
          language={i18n.language}
        >
          {/* A real map, centred on the fix once there is one. Before the fix it
              shows the city (no pin, no "you are here"): the position is taken
              at the CTA, so the app has none to show yet. */}
          <View style={[styles.map, { borderColor: theme.colors.ink[100] }]}>
            <TileMapFallback
              center={mapFix ?? DHAKA_FALLBACK_ORIGIN}
              zoom={mapFix ? 16 : 12}
              markers={[]}
              userLocation={null}
              placePin={
                mapFix
                  ? {
                      ...mapFix,
                      label: t('location.pinLabel'),
                      color: theme.palette.violet[600],
                    }
                  : undefined
              }
              zoomControls
            />
            {fixState === 'acquiring' ? (
              <View
                pointerEvents="none"
                accessibilityLiveRegion="polite"
                style={[styles.locatingPill, { backgroundColor: theme.colors.surface.white }]}
              >
                <ActivityIndicator size="small" color={violet} />
                <Text
                  style={[styles.locatingText, { color: theme.colors.ink[700] }]}
                  numberOfLines={1}
                >
                  {t('location.locating')}
                </Text>
              </View>
            ) : null}
            {!mapFix && fixState !== 'acquiring' ? (
              // The permission is not granted yet, so the map shows the city. Asking
              // is the user's call: this is the tap that prompts.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('location.useMyLocation')}
                onPress={() => void acquireFix()}
                style={[styles.useLocationBtn, { backgroundColor: theme.palette.violet[600] }]}
              >
                <SolidIcon name="myLocation" size={20} color="#FFFFFF" />
                <Text style={[styles.useLocationText, { fontFamily: font('bold') }]}>
                  {t('location.useMyLocation')}
                </Text>
              </Pressable>
            ) : null}
            {/* The tile provider's attribution is a condition of using its tiles. */}
            <View pointerEvents="none" style={styles.mapAttribution}>
              <Text numberOfLines={1} style={styles.mapAttributionText}>
                {TILE_ATTRIBUTION}
              </Text>
            </View>
          </View>

          {/* One row says where you are: the area, then the coordinates and the
              accuracy in small plain text. The card never shows a stale coordinate
              and never a fabricated address. */}
          {mapFix ? (
            <View
              accessible
              accessibilityLabel={`${t('location.addressTitle')}. ${addressMain}. ${whereSub}`}
              style={[styles.where, { backgroundColor: withAlpha(ok, dark ? 0.14 : 0.1) }]}
            >
              <View style={[styles.whereTile, { backgroundColor: ok }]}>
                <SolidIcon
                  name="pin"
                  size={22}
                  color={dark ? theme.staticColors.black : theme.staticColors.white}
                />
              </View>
              <View style={styles.whereText}>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.whereTitle,
                    {
                      color: addressKnown ? theme.colors.ink[950] : theme.colors.ink[700],
                      fontFamily: font(addressKnown ? 'bold' : 'medium'),
                    },
                  ]}
                >
                  {addressMain}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.whereCoords,
                    { color: theme.colors.textMuted, fontFamily: font('medium') },
                  ]}
                >
                  {whereSub}
                </Text>
              </View>
              {/* A wrong, stale or manual position is retaken here, without leaving
                  the screen. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('location.relocate')}
                accessibilityState={{
                  disabled: fixState === 'acquiring',
                  busy: fixState === 'acquiring',
                }}
                disabled={fixState === 'acquiring'}
                onPress={() => void onRelocate()}
                style={[styles.redetect, { opacity: fixState === 'acquiring' ? 0.5 : 1 }]}
              >
                <SolidIcon name="refresh" size={22} color={ok} />
              </Pressable>
            </View>
          ) : fixState === 'acquiring' ? (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.where, { backgroundColor: theme.colors.surface.lavender }]}
            >
              <View style={[styles.whereTile, { backgroundColor: withAlpha(violet, 0.12) }]}>
                <ActivityIndicator size="small" color={violet} />
              </View>
              <View style={styles.whereText}>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.whereTitle,
                    { color: theme.colors.ink[950], fontFamily: font('bold') },
                  ]}
                >
                  {t('location.locating')}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.whereSub,
                    { color: theme.colors.ink[700], fontFamily: font('medium') },
                  ]}
                >
                  {t('location.findingSub')}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View
                style={[styles.where, { backgroundColor: withAlpha(amber, dark ? 0.14 : 0.12) }]}
              >
                <View style={[styles.whereTile, { backgroundColor: amber }]}>
                  <SolidIcon
                    name="locationOff"
                    size={22}
                    color={dark ? theme.staticColors.black : theme.staticColors.white}
                  />
                </View>
                <View style={styles.whereText}>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.whereTitle,
                      { color: theme.colors.ink[950], fontFamily: font('bold') },
                    ]}
                  >
                    {t('location.addressUnavailable')}
                  </Text>
                  <Text
                    style={[
                      styles.whereSub,
                      { color: theme.colors.ink[700], fontFamily: font('medium') },
                    ]}
                  >
                    {t('location.addressUnavailableBody')}
                  </Text>
                </View>
              </View>
              <View style={styles.fallbacks}>
                <Button
                  label={t('location.manualEntry')}
                  icon="edit"
                  variant="secondary"
                  size="md"
                  onPress={() => setManualVisible(true)}
                />
                <Button
                  label={t('location.shareWithoutLocation')}
                  variant="ghost"
                  size="md"
                  disabled={!hasRecipient || busy}
                  onPress={() => void onShare('message', { skipFix: true })}
                />
              </View>
            </>
          )}
        </FormCard>

        <FormCard
          title={t('location.sendTo')}
          tag={sendTag.text}
          tone={sendTag.tone}
          language={i18n.language}
        >
          {contactsFailed && contactList.length === 0 ? (
            <StateBlock
              icon="cloudOff"
              tint="danger"
              title={t('contacts.loadFailed')}
              body={t('contacts.loadFailedSub')}
              action={{
                label: t('common.retry'),
                icon: 'refresh',
                onPress: () => void refetchContacts(),
              }}
            />
          ) : contactList.length === 0 ? (
            <StateBlock
              icon="people"
              tint="violet"
              title={t('location.empty')}
              body={t('location.noContacts')}
              action={{
                label: t('contacts.add'),
                icon: 'person_add',
                onPress: () => router.push('/(app)/contact-editor'),
              }}
            />
          ) : (
            <>
              <View style={styles.allRow}>
                <View style={[styles.allTile, { backgroundColor: withAlpha(violet, 0.12) }]}>
                  <SolidIcon name="star" size={22} color={violet} />
                </View>
                <View style={styles.allText}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.allTitle,
                      { color: theme.colors.ink[950], fontFamily: font('bold') },
                    ]}
                  >
                    {t('location.toggleTitle')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.allSub,
                      { color: theme.colors.textMuted, fontFamily: font('medium') },
                    ]}
                  >
                    {t('location.primaryCount', { count: primaries.length, number: primaryCount })}
                  </Text>
                </View>
                <Toggle
                  value={shareWithAll}
                  onValueChange={onToggleAll}
                  accessibilityLabel={t('location.toggleTitle')}
                />
              </View>

              {shareWithAll && !contactsFailed && primaries.length === 0 ? (
                <View style={styles.noPrimaries}>
                  <SolidIcon name="warning" size={18} color={amberText} />
                  <Text
                    style={[
                      styles.noPrimariesText,
                      { color: amberText, fontFamily: font('semibold') },
                    ]}
                  >
                    {t('location.shareNoPrimaries')}
                  </Text>
                </View>
              ) : null}

              <Text
                style={[
                  styles.pickHeading,
                  {
                    color: theme.colors.textMuted,
                    borderTopColor: theme.colors.ink[100],
                    fontFamily: font('bold'),
                  },
                ]}
              >
                {t('location.specific')}
              </Text>

              {contactList.map((contact, index) => (
                <View
                  key={contact.id}
                  style={[
                    styles.contactRow,
                    index < contactList.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.colors.ink[200],
                    },
                  ]}
                >
                  <ContactAvatar name={contact.name} group={contact.groupName} size={40} />
                  <View style={styles.contactInfo}>
                    <View style={styles.nameRow}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.contactName,
                          { color: theme.colors.ink[950], fontFamily: font('bold') },
                        ]}
                      >
                        {contact.name}
                      </Text>
                      {contact.isPrimary ? (
                        <PrimaryStar isPrimary accessibilityLabel={t('contacts.primary')} />
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.contactPhone,
                        { color: theme.colors.textMuted, fontFamily: font('medium') },
                      ]}
                    >
                      {`${groupLabel(contact.groupName)} · ${contact.phone}`}
                    </Text>
                  </View>
                  <Checkbox
                    checked={isRecipientChecked(contact, shareWithAll, selected)}
                    onPress={() => toggle(contact)}
                    accessibilityLabel={contact.name}
                  />
                </View>
              ))}
            </>
          )}
        </FormCard>
      </View>

      {/* The manual coordinate entry. */}
      <BottomSheet
        visible={manualVisible}
        title={t('location.manualTitle')}
        helper={t('location.addressUnavailableBody')}
        onClose={closeManual}
      >
        <InputField
          label={t('location.manualLatLabel')}
          value={manualLat}
          onChangeText={(text) => {
            setManualLat(text)
            setManualWarning(null)
          }}
          keyboardType="numbers-and-punctuation"
          autoComplete="off"
          error={manualError?.field === 'lat' ? manualError.message : undefined}
          placeholder={t('location.manualLatPlaceholder')}
        />
        <View style={styles.manualGap} />
        <InputField
          label={t('location.manualLngLabel')}
          value={manualLng}
          onChangeText={(text) => {
            setManualLng(text)
            setManualWarning(null)
          }}
          keyboardType="numbers-and-punctuation"
          autoComplete="off"
          error={manualError?.field === 'lng' ? manualError.message : undefined}
          helper={manualWarning ?? undefined}
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

/** An empty or failed list: a tinted tile, a title, one line and one button. */
function StateBlock({
  icon,
  tint,
  title,
  body,
  action,
}: {
  icon: SolidIconName
  tint: 'violet' | 'danger'
  title: string
  body: string
  action: { label: string; icon: string; onPress: () => void }
}) {
  const theme = useTheme()
  const font = useFont()
  const step = theme.colors.isDark ? 400 : 700
  const color =
    tint === 'danger'
      ? theme.palette.red[theme.colors.isDark ? 500 : 700]
      : theme.palette.violet[step]

  return (
    <View style={styles.stateBlock}>
      <View style={[styles.stateTile, { backgroundColor: withAlpha(color, 0.12) }]}>
        <SolidIcon name={icon} size={26} color={color} />
      </View>
      <Text style={[styles.stateTitle, { color: theme.colors.ink[950], fontFamily: font('bold') }]}>
        {title}
      </Text>
      <Text
        style={[styles.stateBody, { color: theme.colors.textMuted, fontFamily: font('medium') }]}
      >
        {body}
      </Text>
      <Button
        label={action.label}
        icon={action.icon}
        variant="secondary"
        size="md"
        onPress={action.onPress}
      />
    </View>
  )
}

/**
 * A 24 dp rounded box that fills violet and shows a tick when checked. The tap
 * target is padded to 48 dp.
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
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.checkboxHit}
    >
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: checked ? violet : theme.colors.surface.white,
            borderColor: checked ? violet : theme.colors.ink[300],
          },
        ]}
      >
        {checked ? (
          <SolidIcon
            name="check"
            size={16}
            color={theme.colors.isDark ? theme.staticColors.black : theme.staticColors.white}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

/** The face for a weight in the app's language. */
function useFont(): (weight: FontWeightName) => string {
  const { i18n } = useTranslation()
  return (weight) => appFont(weight, i18n.language)
}

const styles = StyleSheet.create({
  stack: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  map: {
    height: 176,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#EFE6F8',
  },
  locatingPill: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  locatingText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  useLocationBtn: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
  },
  useLocationText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  mapAttribution: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '70%',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  mapAttributionText: {
    fontSize: 11,
    color: '#11112B',
  },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
  },
  whereTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whereText: {
    flex: 1,
    minWidth: 0,
  },
  whereTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  whereSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  // Small and quiet: the area name above it is what a person reads.
  whereCoords: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 14,
    opacity: 0.85,
  },
  // A 48 dp target pulled in around the glyph.
  redetect: {
    width: 48,
    height: 48,
    marginVertical: -6,
    marginRight: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbacks: {
    marginTop: 12,
    gap: 4,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  allTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allText: {
    flex: 1,
    minWidth: 0,
  },
  allTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  allSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  noPrimaries: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
  },
  noPrimariesText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  pickHeading: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    lineHeight: 18,
  },
  contactRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
  },
  contactPhone: {
    fontSize: 13,
    lineHeight: 18,
  },
  checkboxHit: {
    width: 48,
    height: 48,
    marginRight: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBlock: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 4,
  },
  stateTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stateTitle: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 12,
  },
  stickyCta: {
    paddingBottom: 8,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  footerNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  manualGap: {
    height: 12,
  },
})

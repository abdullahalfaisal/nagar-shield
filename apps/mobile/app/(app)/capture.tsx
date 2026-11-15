import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  CAPTURE_DESCRIPTION_MAX_LENGTH,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_VIDEO_SECONDS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
} from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import {
  BottomSheet,
  Button,
  KeyboardScroll,
  StatusBanner,
  Toggle,
  useToast,
  withAlpha,
} from '@/shared/ui'
import { CategoryTile } from '@/shared/ui/CategoryTile'
import { FormCard } from '@/shared/ui/FormCard'
import { SolidIcon, type SolidIconName } from '@/shared/ui/SolidIcon'
import { surfaceShadow } from '@/shared/ui/surface'
import { appFont, type FontWeightName } from '@/shared/theme/appFont'
import { useCurrentFix } from '@/shared/services/location'
import { takeLastKnownFix, takeSilentLocationFix } from '@/shared/services/locationFix'
import { useReverseGeocode, formatAddressLine } from '@/shared/api/geocode'
import { areaOptionName, useAreaName, useAreaOptions, type AreaOption } from '@/shared/api/areas'
import {
  capturePhoto,
  captureVideo,
  pickFromGallery,
  recoverPendingPick,
} from '@/shared/services/mediaSources'
import {
  createFixWait,
  hasCaptureInput,
  SEND_FIX_WAIT_MS,
  shouldRefreshFixOnPermission,
} from '@/shared/services/captureGuards'
import type { PermissionState } from '@/shared/services/permissions'
import { preparePickedMedia, useCaptureSubmit, type MediaKind } from '@/shared/services/captureFlow'
import { useQueueDrain } from '@/shared/services/useQueueDrain'
import { usePermissions } from '@/shared/services/usePermissions'
import { canCompressVideo } from '@/shared/services/videoCompressor'
import {
  MEDIA_MAX_SOURCE_PHOTO_BYTES,
  MEDIA_MAX_SOURCE_VIDEO_BYTES,
  megabytes,
  type MediaRejection,
  type PreparedMedia,
} from '@/shared/services/mediaPipeline'
import { toBengaliDigits } from '@/shared/utils/relativeTime'

/**
 * Screen 17 — Report Crime.
 *
 * Five cards, top to bottom, each with the same header (title, a small "i" and
 * one tag on the right):
 *
 *   - **Evidence** (required): take a photo, record a video, or choose one from
 *     the gallery. What the app accepts sits behind the "i", not in a sentence
 *     on the page.
 *   - **Incident type** (optional): a field that opens the list of types.
 *   - **What happened** (required): the description, with a `0 / 140` counter.
 *   - **Location** (required): detected for the user, or an area chosen by hand.
 *   - **Privacy**: anonymous or named.
 *
 * The send button is the footer, pinned, with one line under it that says what
 * is still missing.
 *
 * **Copy deviation (PRD-X-4 wins over the prototype):** the prototype's video
 * card says `সর্বোচ্চ ৬০ সেকেন্ড`; the PRD locks the video cap at **30 s**.
 *
 * **The incident type is optional.** FR-CAPTURE-5 was overridden on 2026-09-11
 * so that a report could be filed without one. Left empty, the report is filed
 * with a null category and the author can still set it later from History →
 * Report detail.
 *
 * **The description is required.** A report with no words is hard for a
 * moderator to check, so Send stays off until something is written. The check
 * is here, in the app; the server still accepts a missing description.
 *
 * **The queue states are surfaced here.** The screen mounts `useQueueDrain`, so
 * the offline queue is drained on connectivity regain and on foreground. Two
 * states are shown:
 *
 *   - **"Saved on device"** — reports are on the phone and will be sent when
 *     the network returns. This is a *state*, not an error: the evidence is
 *     safe, and the user is told the truth about it.
 *   - **the overflow warning** — the queue's 20-item bound evicted the oldest
 *     report. The user is told what was dropped, because silently deleting a
 *     citizen's evidence is not acceptable.
 */
/** The longest road / shop / landmark text; the server enforces the same cap. */
const PLACE_DETAIL_MAX_LENGTH = 120

export default function CaptureScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const font = useFont()
  const language = i18n.language
  const areaNameIn = useAreaName()
  const localDigits = (value: number | string) =>
    language === 'bn' ? toBengaliDigits(String(value)) : String(value)

  const [anonymous, setAnonymous] = useState(true)
  const [description, setDescription] = useState('')
  const [media, setMedia] = useState<PreparedMedia | null>(null)
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  // How far a picked video's compression has got, 0 to 100; null when idle.
  const [preparing, setPreparing] = useState<number | null>(null)
  const [sent, setSent] = useState(false)
  const [overflowed, setOverflowed] = useState(false)
  // Where the report is filed: the detected position, or an area the citizen
  // chose from the list with an optional road / shop / landmark.
  const [locationMode, setLocationMode] = useState<'auto' | 'manual'>('auto')
  const [areaId, setAreaId] = useState<string | null>(null)
  const [placeDetail, setPlaceDetail] = useState('')
  const [areaSheetOpen, setAreaSheetOpen] = useState(false)
  const [areaQuery, setAreaQuery] = useState('')
  const {
    data: areaOptions,
    isLoading: areasLoading,
    isError: areasFailed,
    refetch: refetchAreas,
  } = useAreaOptions()
  const chosenArea = areaOptions?.find((option) => option.id === areaId) ?? null
  const [locating, setLocating] = useState(false)
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)

  // The GPS, not Wi-Fi and cell towers: the fix names the area the report is
  // filed in, and a network fix can be a kilometre or more off.
  const { state: fixState, refresh: refreshFix } = useCurrentFix({ precise: true })
  const { data: geocode, isLoading: geocoding } = useReverseGeocode(
    fixState.status === 'ready' ? fixState.fix.lat : null,
    fixState.status === 'ready' ? fixState.fix.lng : null,
    fixState.status === 'ready' ? fixState.fix.accuracyM : null,
  )

  const { isSubmitting, error, submit } = useCaptureSubmit()

  // The drain is mounted on this screen so the queue actually empties. It
  // runs off the render path — the capture screen is never blocked by it.
  const { pending, savedOnDevice } = useQueueDrain()

  // The live permission state. It is read — never prompted for — and it is
  // re-read on every foreground, so a permission revoked while the app was
  // backgrounded is reflected the next time the screen renders.
  const { permissions, availability } = usePermissions()

  const counter = useMemo(
    () => localDigits(`${description.length} / ${CAPTURE_DESCRIPTION_MAX_LENGTH}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [description.length, language],
  )

  const needsArea = locationMode === 'manual' && chosenArea === null
  const hasDescription = description.trim().length > 0
  const canSubmit =
    media !== null &&
    hasDescription &&
    !needsArea &&
    !isSubmitting &&
    !locating &&
    preparing === null

  // The submit result is a one-shot signal — the screen navigates away on a
  // successful send and on a queued send.
  useEffect(() => {
    if (!sent) return
    router.back()
  }, [sent, router])

  // The overflow warning. It is an alert rather than an inline banner because
  // the screen navigates away the moment the capture is queued — an inline
  // banner would be dismissed before it was ever read.
  useEffect(() => {
    if (!overflowed) return

    Alert.alert(t('capture.queueOverflow'), t('capture.queueOverflowBody'))
  }, [overflowed, t])

  /**
   * Takes or picks the evidence.
   *
   * `requested` is what the user asked for: a photo, a video, or `any` (the
   * gallery button, which offers both). For `any` the kind is read from the
   * file the user picked.
   */
  const pick = useCallback(
    async (source: 'camera' | 'gallery', requested: MediaKind | 'any') => {
      setNotice(null)

      try {
        const asset =
          source === 'camera'
            ? requested === 'video'
              ? await captureVideo()
              : await capturePhoto()
            : await pickFromGallery(
                requested === 'video'
                  ? ['videos']
                  : requested === 'photo'
                    ? ['images']
                    : ['images', 'videos'],
              )

        if (!asset) return

        const kind: MediaKind =
          requested !== 'any' ? requested : asset.mimeType?.startsWith('video/') ? 'video' : 'photo'

        // A video is compressed on the phone, which takes seconds, not
        // milliseconds — the screen says so rather than appearing to hang.
        if (kind === 'video' && canCompressVideo()) setPreparing(0)

        const prepared = await preparePickedMedia(kind, asset, (progress) =>
          setPreparing(Math.min(100, Math.round(progress <= 1 ? progress * 100 : progress))),
        )
        setMedia(prepared)
        setMediaKind(kind)
      } catch (caught) {
        setNotice(mapMediaError(caught, t, language))
      } finally {
        setPreparing(null)
      }
    },
    [t, language],
  )

  // Location turned on in Settings while this screen was open: take the fix now,
  // so the card stops saying "unavailable" and the report carries it. Only the
  // change from off to on counts: with the permission granted but the phone's
  // location switch off the fix is "unavailable", and refreshing on that looped.
  const previousLocation = useRef<PermissionState | null>(null)
  useEffect(() => {
    const next = permissions?.location
    if (shouldRefreshFixOnPermission(previousLocation.current, next)) refreshFix()
    if (next) previousLocation.current = next
  }, [permissions?.location, refreshFix])

  // The phone's location switch is not a permission, so coming back to the app
  // is the moment to look again if the last attempt found it off.
  const fixStatusRef = useRef(fixState.status)
  fixStatusRef.current = fixState.status
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && fixStatusRef.current === 'unavailable') refreshFix()
    })
    return () => subscription.remove()
  }, [refreshFix])

  // A capture the system finished while the app was killed (low-memory Android)
  // comes back here and goes through the same preparation as a fresh pick.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const recovered = await recoverPendingPick()
      if (!recovered || cancelled) return
      try {
        if (recovered.kind === 'video' && canCompressVideo()) setPreparing(0)
        const prepared = await preparePickedMedia(recovered.kind, recovered.asset, (progress) =>
          setPreparing(Math.min(100, Math.round(progress <= 1 ? progress * 100 : progress))),
        )
        if (cancelled) return
        setMedia(prepared)
        setMediaKind(recovered.kind)
      } catch (caught) {
        if (!cancelled) setNotice(mapMediaError(caught, t, language))
      } finally {
        if (!cancelled) setPreparing(null)
      }
    })()
    return () => {
      cancelled = true
    }
    // Once, on open: later renders must not pick the same result up again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The position the report is filed at.
   *
   * The screen starts a GPS fix when it opens, but a cold fix takes 10 – 30 s,
   * and a citizen who snaps a photo and taps Send at once used to file the
   * report at `0, 0` even with location allowed. So when there is no fix yet
   * and the permission is not refused, the send waits for one: the phone's last
   * known position first (instant), then a fresh one, for at most
   * `SEND_FIX_WAIT_MS`, and the citizen can end the wait with "Send without
   * location". Only a refused or unavailable location falls back
   * to `0, 0`, which the server degrades to the city (story 004/006).
   */
  const skipFixWait = useRef<(() => void) | null>(null)

  const positionForSubmit = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    if (fixState.status === 'ready') return { lat: fixState.fix.lat, lng: fixState.fix.lng }
    if (permissions?.location === 'denied') return null

    const known = await takeLastKnownFix()
    if (known.status === 'ready') return { lat: known.lat, lng: known.lng }

    const wait = createFixWait(SEND_FIX_WAIT_MS)
    skipFixWait.current = wait.skip
    const fresh = await Promise.race([takeSilentLocationFix(), wait.promise])
    wait.clear()
    skipFixWait.current = null
    return fresh && fresh.status === 'ready' ? { lat: fresh.lat, lng: fresh.lng } : null
  }, [fixState, permissions?.location])

  const onSubmit = useCallback(async () => {
    if (!media) return

    // A chosen area is the position; there is no GPS fix to wait for.
    const manual = locationMode === 'manual' && chosenArea !== null
    let position: { lat: number; lng: number } | null = null
    if (manual) {
      position = { lat: chosenArea.lat, lng: chosenArea.lng }
    } else {
      setLocating(fixState.status !== 'ready')
      position = await positionForSubmit()
      setLocating(false)
    }

    const outcome = await submit({
      media,
      draft: {
        description: description.trim().length > 0 ? description.trim() : null,
        publicVisibility: anonymous ? 'anonymous' : 'identified',
        lat: position?.lat ?? 0,
        lng: position?.lng ?? 0,
        capturedAt: new Date().toISOString(),
        category,
        // The server files the report at the chosen area and checks it is one
        // of the reference areas.
        areaId: manual ? chosenArea.id : null,
        placeDetail: manual && placeDetail.trim().length > 0 ? placeDetail.trim() : null,
      },
    })

    if (outcome.status === 'queued' && outcome.droppedOldest) {
      // The queue's 20-item bound evicted the oldest report. The warning has
      // to outlive the navigation — the screen leaves as soon as the capture
      // is queued — so it is an alert rather than an inline banner.
      setOverflowed(true)
      setSent(true)
      return
    }

    // A sent report is new to History and the feed; do not wait out their staleTime.
    if (outcome.status === 'sent') {
      void queryClient.invalidateQueries({ queryKey: ['history'] })
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
    }

    if (outcome.status === 'sent' || outcome.status === 'queued') {
      // The toast belongs to the root, so it outlives the navigation below.
      toast.show(
        outcome.status === 'sent'
          ? { message: t('capture.successTitle'), tone: 'success' }
          : { message: t('capture.queued'), tone: 'info' },
      )
      setSent(true)
    }
  }, [
    anonymous,
    category,
    description,
    chosenArea,
    fixState.status,
    locationMode,
    media,
    placeDetail,
    positionForSubmit,
    queryClient,
    submit,
    t,
    toast,
  ])

  const addressLine = geocode ? formatAddressLine(geocode, areaNameIn) : ''
  const hasFix = fixState.status === 'ready'
  const detecting = fixState.status === 'idle' || fixState.status === 'loading'

  // The area list in the reader's alphabet.
  const sortedAreas = useMemo(
    () =>
      [...(areaOptions ?? [])].sort((a, b) =>
        areaName(a, language).localeCompare(areaName(b, language), language),
      ),
    [areaOptions, language],
  )

  // The search narrows the list by either spelling: a person may type the
  // English name on a Bangla phone, or the other way round.
  const shownAreas = useMemo(() => {
    const query = areaQuery.trim().toLowerCase()
    if (!query) return sortedAreas
    return sortedAreas.filter(
      (option) =>
        option.name.toLowerCase().includes(query) || option.nameBn.toLowerCase().includes(query),
    )
  }, [sortedAreas, areaQuery])

  // A refused location permission starts the screen on "Choose area": there is
  // no position to detect. The refusal can come from the system prompt the fix
  // itself raises, which the permission snapshot does not see until later.
  const locationDenied = permissions?.location === 'denied' || fixState.status === 'denied'
  useEffect(() => {
    if (locationDenied) setLocationMode('manual')
  }, [locationDenied])

  // Closing with something entered asks first, so a photo or a typed
  // description is not lost to a stray tap on the back button.
  const dirty = hasCaptureInput({
    hasMedia: media !== null,
    description,
    placeDetail,
    category,
    areaId,
  })
  const requestClose = useCallback(() => {
    if (!dirty) {
      router.back()
      return
    }
    Alert.alert(t('capture.discardTitle'), t('capture.discardBody'), [
      { text: t('capture.discardKeep'), style: 'cancel' },
      { text: t('capture.discardConfirm'), style: 'destructive', onPress: () => router.back() },
    ])
  }, [dirty, router, t])

  // Android's back button and gesture take the same path as the back button.
  useEffect(() => {
    if (!dirty || sent) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose()
      return true
    })
    return () => subscription.remove()
  }, [dirty, sent, requestClose])

  const dark = theme.colors.isDark
  const violet = theme.palette.violet[dark ? 400 : 700]
  const ok = theme.palette.green[dark ? 500 : 700]
  const infoLabel = t('capture.infoLabel')
  const hasAttachment = media !== null && mediaKind !== null
  const showSourcePicker = !hasAttachment && preparing === null

  // The line under the Send button: the first thing still missing, or that the
  // report is ready. It never shows while a send is under way.
  const hint = isSubmitting
    ? ''
    : media === null
      ? t('capture.mediaRequired')
      : !hasDescription
        ? t('capture.descriptionRequired')
        : needsArea
          ? t('capture.areaRequired')
          : t('capture.readyHint')

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      <View
        style={[
          styles.appBar,
          {
            paddingTop: 4 + insets.top,
            backgroundColor: theme.colors.surface.lavender,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={requestClose}
          style={[styles.backBtn, { backgroundColor: theme.colors.surface.white }]}
        >
          <SolidIcon name="chevronLeft" size={24} color={theme.colors.ink[700]} />
        </Pressable>
        <View style={styles.appBarText}>
          <Text
            numberOfLines={1}
            style={[styles.appBarTitle, { color: theme.colors.ink[950], fontFamily: font('bold') }]}
          >
            {t('capture.title')}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.appBarSub,
              { color: theme.colors.textMuted, fontFamily: font('medium') },
            ]}
          >
            {t('capture.subtitle')}
          </Text>
        </View>
      </View>

      {/* The send button is the footer: pinned, and lifted above the keyboard. */}
      <KeyboardScroll
        contentStyle={styles.contentInner}
        footer={
          <View
            style={[
              styles.stickyCta,
              {
                paddingBottom: 12 + insets.bottom,
                backgroundColor: theme.colors.surface.lavender,
                borderTopColor: theme.colors.ink[100],
              },
            ]}
          >
            {locating ? (
              <Button
                label={t('capture.locationSkip')}
                variant="ghost"
                onPress={() => skipFixWait.current?.()}
                style={styles.skipLocation}
              />
            ) : null}
            <Button
              label={
                locating
                  ? t('capture.locationPending')
                  : isSubmitting
                    ? t('capture.uploading')
                    : t('capture.submit')
              }
              icon="send"
              variant="primary"
              size="lg"
              disabled={!canSubmit}
              onPress={() => void onSubmit()}
            />
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.hint, { color: theme.colors.textMuted, fontFamily: font('medium') }]}
            >
              {hint}
            </Text>
          </View>
        }
      >
        <View style={styles.stack}>
          {/*
            The queue states. "Saved on device" is a **state**, not an error —
            the evidence is safe and the user is told the truth about it. The
            count is shown so the user knows how many reports are waiting.
          */}
          {savedOnDevice > 0 ? (
            <StatusBanner
              tone="saved"
              title={t('capture.savedOnDevice')}
              body={t('capture.savedOnDeviceCount', { count: savedOnDevice })}
            />
          ) : null}

          {pending > 0 ? (
            <StatusBanner
              tone="saved"
              title={t('capture.offlineTitle')}
              body={t('capture.offlineBody')}
            />
          ) : null}

          {/* Evidence */}
          <FormCard
            title={t('capture.sectionEvidence')}
            tag={t('capture.tagRequired')}
            tone="required"
            language={language}
            info={{
              title: t('capture.acceptedTitle'),
              label: infoLabel,
              body: [
                `${t('capture.sourcePhoto')}: ${t('capture.acceptedPhoto', {
                  photoMb: localDigits(megabytes(MEDIA_MAX_SOURCE_PHOTO_BYTES)),
                })}`,
                `${t('capture.sourceVideo')}: ${t('capture.acceptedVideo', {
                  videoSeconds: localDigits(MEDIA_MAX_VIDEO_SECONDS),
                  // With the compressor the limit is on what the app will shrink;
                  // without it (Expo Go) the video itself must fit the upload cap.
                  videoMb: localDigits(
                    megabytes(
                      canCompressVideo() ? MEDIA_MAX_SOURCE_VIDEO_BYTES : MEDIA_MAX_FILE_BYTES,
                    ),
                  ),
                })}`,
              ].join('\n'),
            }}
          >
            {/*
              The source tiles. A denied permission removes the entry point
              entirely — **hidden, not disabled**. A disabled control the user
              cannot use is a dead end; a hidden one is honest. The row reflows
              to the tiles that remain.
            */}
            {showSourcePicker ? (
              <View style={styles.sources}>
                {availability.canTakePhoto || availability.canRecordVideo ? (
                  <View style={styles.sourceRow}>
                    {availability.canTakePhoto ? (
                      <PickTile
                        icon="camera"
                        title={t('capture.takePhoto')}
                        sub={t('capture.cameraSub')}
                        onPress={() => void pick('camera', 'photo')}
                      />
                    ) : null}
                    {availability.canRecordVideo ? (
                      <PickTile
                        icon="video"
                        title={t('capture.takeVideo')}
                        sub={t('capture.maxVideo')}
                        onPress={() => void pick('camera', 'video')}
                      />
                    ) : null}
                  </View>
                ) : null}

                {availability.canPickFromGallery ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.galleryButton')}
                    onPress={() => void pick('gallery', 'any')}
                    style={({ pressed }) => [
                      styles.galleryButton,
                      {
                        borderColor: theme.colors.ink[300],
                        backgroundColor: pressed ? withAlpha(violet, 0.08) : 'transparent',
                      },
                    ]}
                  >
                    <SolidIcon name="gallery" size={20} color={violet} />
                    <Text
                      style={[
                        styles.galleryText,
                        { color: theme.colors.ink[950], fontFamily: font('bold') },
                      ]}
                    >
                      {t('capture.galleryButton')}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Camera and photos both refused: no way in is left, so say why
                  and offer the one way out, the system Settings. */}
                {!availability.canTakePhoto && !availability.canPickFromGallery ? (
                  <View style={styles.blocked}>
                    <Text
                      style={[
                        styles.blockedTitle,
                        { color: theme.colors.ink[950], fontFamily: font('bold') },
                      ]}
                    >
                      {t('capture.permissionBlockedTitle')}
                    </Text>
                    <Text
                      style={[
                        styles.blockedBody,
                        { color: theme.colors.ink[700], fontFamily: font('regular') },
                      ]}
                    >
                      {t('capture.permissionBlockedBody')}
                    </Text>
                    <Button
                      label={t('capture.openSettings')}
                      variant="secondary"
                      onPress={() => void Linking.openSettings()}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {preparing !== null ? (
              <View accessibilityLiveRegion="polite" style={styles.preparing}>
                <View style={[styles.previewBox, { backgroundColor: withAlpha(violet, 0.12) }]}>
                  <SolidIcon name="video" size={40} color={violet} />
                </View>
                <View style={[styles.track, { backgroundColor: theme.colors.ink[100] }]}>
                  <View
                    style={[styles.trackFill, { width: `${preparing}%`, backgroundColor: violet }]}
                  />
                </View>
                <Text
                  style={[
                    styles.preparingText,
                    { color: theme.colors.ink[700], fontFamily: font('semibold') },
                  ]}
                >
                  {t('capture.preparingVideo', { progress: localDigits(preparing) })}
                </Text>
              </View>
            ) : null}

            {/* What is attached: the photo itself, or a video tile, with a way to
              take it off or swap it before sending. */}
            {media && mediaKind ? (
              <AttachedMedia
                media={media}
                kind={mediaKind}
                okColor={ok}
                onRemove={() => {
                  setMedia(null)
                  setMediaKind(null)
                }}
              />
            ) : null}

            {notice ? <InlineError text={notice} /> : null}

            {error ? (
              <InlineError
                text={
                  error.code === 'CAPTURE_RATE_LIMIT'
                    ? t('errors.captureRateLimit')
                    : t('capture.sendFailed')
                }
              />
            ) : null}
          </FormCard>

          {/* Incident type — optional. */}
          <FormCard
            title={t('capture.sectionCategory')}
            tag={t('capture.categoryOptional')}
            language={language}
            info={{
              title: t('capture.typeInfoTitle'),
              label: infoLabel,
              body: t('capture.typeInfo'),
            }}
          >
            <SelectField
              lead={category ? <CategoryTile category={category} size={40} /> : undefined}
              value={category ? categoryName(category, language) : null}
              placeholder={t('capture.categoryPlaceholder')}
              accessibilityLabel={`${t('capture.sectionCategory')}: ${
                category ? categoryName(category, language) : t('capture.categoryPlaceholder')
              }`}
              onPress={() => setCategorySheetOpen(true)}
            />
          </FormCard>

          {/* Description — required. */}
          <FormCard
            title={t('capture.descriptionLabel')}
            tag={t('capture.tagRequired')}
            tone="required"
            language={language}
            info={{
              title: t('capture.descriptionInfoTitle'),
              label: infoLabel,
              body: t('capture.descriptionInfo'),
            }}
          >
            <View>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('capture.descriptionPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                multiline
                // The description is short and has no line breaks worth keeping,
                // so the Enter key is a Done key: it closes the keyboard instead
                // of adding a line, which left no way to dismiss it.
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                textAlignVertical="top"
                maxLength={CAPTURE_DESCRIPTION_MAX_LENGTH}
                accessibilityLabel={t('capture.descriptionLabel')}
                style={[
                  styles.textarea,
                  {
                    backgroundColor: theme.colors.surface.lavender,
                    borderColor: theme.colors.ink[300],
                    color: theme.colors.ink[950],
                    fontFamily: font('regular'),
                  },
                ]}
              />
              <Text
                pointerEvents="none"
                style={[
                  styles.counter,
                  { color: theme.colors.textMuted, fontFamily: font('semibold') },
                ]}
              >
                {counter}
              </Text>
            </View>
          </FormCard>

          {/*
            The location card. With the permission denied it degrades to a
            **manual-entry fallback** — never a fake address, and never the
            prototype's hardcoded বসুন্ধরা R/A. The manual entry is a *hint*:
            the server-resolved hierarchy stays authoritative.
          */}
          <FormCard
            title={t('capture.sectionLocation')}
            tag={t('capture.tagRequired')}
            tone="required"
            language={language}
            info={{
              title: t('capture.locationInfoTitle'),
              label: infoLabel,
              body: t('capture.locationInfo'),
            }}
          >
            <ModeSwitch
              value={locationMode}
              options={[
                { value: 'auto', label: t('capture.locationAuto'), icon: 'pin' },
                { value: 'manual', label: t('capture.locationManual'), icon: 'search' },
              ]}
              onChange={setLocationMode}
            />

            {locationMode === 'auto' ? (
              <View style={[styles.where, { backgroundColor: withAlpha(ok, dark ? 0.14 : 0.1) }]}>
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
                      { color: theme.colors.ink[950], fontFamily: font('bold') },
                    ]}
                  >
                    {hasFix
                      ? addressLine ||
                        (geocoding ? t('capture.locationPending') : t('capture.locationOutside'))
                      : detecting
                        ? t('capture.locationPending')
                        : t('capture.locationUnavailable')}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.whereSub,
                      { color: theme.colors.ink[700], fontFamily: font('medium') },
                    ]}
                  >
                    {hasFix && fixState.fix.accuracyM !== null
                      ? t('capture.locationAccuracy', {
                          accuracy: localDigits(Math.round(fixState.fix.accuracyM)),
                        })
                      : t('capture.locationUnavailableSub')}
                  </Text>
                </View>
                {/* A wrong or stale fix is retried here, without leaving the screen. */}
                {!locationDenied ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('capture.locationRedetect')}
                    accessibilityState={{ disabled: detecting, busy: detecting }}
                    disabled={detecting}
                    onPress={refreshFix}
                    style={styles.redetect}
                  >
                    {detecting ? (
                      <ActivityIndicator size="small" color={ok} />
                    ) : (
                      <SolidIcon name="refresh" size={22} color={ok} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.manual}>
                <View style={styles.field}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.ink[700], fontFamily: font('bold') },
                    ]}
                  >
                    {t('capture.areaLabel')}
                  </Text>
                  <SelectField
                    lead={
                      <View
                        style={[
                          styles.neutralTile,
                          { backgroundColor: withAlpha(violet, dark ? 0.2 : 0.1) },
                        ]}
                      >
                        <SolidIcon name="pin" size={22} color={violet} />
                      </View>
                    }
                    value={chosenArea ? areaName(chosenArea, language) : null}
                    placeholder={t('capture.areaPlaceholder')}
                    accessibilityLabel={`${t('capture.areaLabel')}: ${
                      chosenArea ? areaName(chosenArea, language) : t('capture.areaPlaceholder')
                    }`}
                    onPress={() => setAreaSheetOpen(true)}
                  />
                </View>

                <View style={styles.field}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.colors.ink[700], fontFamily: font('bold') },
                    ]}
                  >
                    {t('capture.placeLabel')}
                  </Text>
                  <TextInput
                    value={placeDetail}
                    onChangeText={setPlaceDetail}
                    placeholder={t('capture.placePlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    returnKeyType="done"
                    maxLength={PLACE_DETAIL_MAX_LENGTH}
                    accessibilityLabel={t('capture.placeLabel')}
                    style={[
                      styles.manualInput,
                      {
                        backgroundColor: theme.colors.surface.lavender,
                        borderColor: theme.colors.ink[300],
                        color: theme.colors.ink[950],
                        fontFamily: font('regular'),
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </FormCard>

          {/* Anonymity — last, as the one choice to confirm before sending. */}
          <FormCard
            title={t('capture.sectionPrivacy')}
            tag={anonymous ? t('capture.tagAnonymous') : t('capture.tagNamed')}
            language={language}
            info={{
              title: t('capture.privacyInfoTitle'),
              label: infoLabel,
              body: t('capture.privacyInfo'),
            }}
          >
            <View style={styles.privacyRow}>
              <View
                style={[
                  styles.neutralTile,
                  { backgroundColor: withAlpha(violet, dark ? 0.2 : 0.1) },
                ]}
              >
                <SolidIcon name={anonymous ? 'eyeOff' : 'person'} size={22} color={violet} />
              </View>
              <View style={styles.whereText}>
                <Text
                  style={[
                    styles.whereTitle,
                    { color: theme.colors.ink[950], fontFamily: font('bold') },
                  ]}
                >
                  {anonymous ? t('capture.anonymous') : t('capture.identified')}
                </Text>
                <Text
                  style={[
                    styles.whereSub,
                    { color: theme.colors.textMuted, fontFamily: font('medium') },
                  ]}
                >
                  {anonymous ? t('capture.anonymousHelper') : t('capture.identifiedHelper')}
                </Text>
              </View>
              <Toggle
                value={anonymous}
                onValueChange={setAnonymous}
                accessibilityLabel={t('capture.anonymous')}
              />
            </View>
          </FormCard>
        </View>
      </KeyboardScroll>

      {/* The incident types. The first row clears the choice: the type is optional. */}
      <BottomSheet
        visible={categorySheetOpen}
        title={t('capture.categorySheetTitle')}
        onClose={() => setCategorySheetOpen(false)}
      >
        <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetRows}>
          <ChoiceRow
            label={t('capture.categoryNone')}
            muted
            selected={category === null}
            onPress={() => {
              setCategory(null)
              setCategorySheetOpen(false)
            }}
          />
          {REPORT_CATEGORIES.map((entry) => (
            <ChoiceRow
              key={entry}
              lead={<CategoryTile category={entry} size={40} />}
              label={categoryName(entry, language)}
              selected={category === entry}
              onPress={() => {
                setCategory(entry)
                setCategorySheetOpen(false)
              }}
            />
          ))}
        </ScrollView>
      </BottomSheet>

      {/* The area list. */}
      <BottomSheet
        visible={areaSheetOpen}
        title={t('capture.areaSheetTitle')}
        onClose={() => {
          setAreaSheetOpen(false)
          setAreaQuery('')
        }}
      >
        <AreaSearch value={areaQuery} onChangeText={setAreaQuery} />
        <ScrollView
          style={styles.sheetList}
          contentContainerStyle={styles.sheetRows}
          keyboardShouldPersistTaps="handled"
        >
          {areasLoading ? (
            <View style={styles.loadingRow} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={theme.colors.ink[500]} />
              <Text
                style={[
                  styles.preparingText,
                  { color: theme.colors.ink[700], fontFamily: font('medium') },
                ]}
              >
                {t('capture.areasLoading')}
              </Text>
            </View>
          ) : null}
          {areasFailed && sortedAreas.length === 0 ? (
            <View style={styles.sheetRows}>
              <InlineError text={t('capture.areasError')} />
              <Button
                label={t('common.retry')}
                variant="secondary"
                onPress={() => void refetchAreas()}
              />
            </View>
          ) : null}
          {!areasLoading && sortedAreas.length > 0 && shownAreas.length === 0 ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.areaSearchEmpty,
                { color: theme.colors.textMuted, fontFamily: font('medium') },
              ]}
            >
              {t('capture.areaSearchEmpty')}
            </Text>
          ) : null}
          {shownAreas.map((option) => (
            <AreaChoice
              key={option.id}
              option={option}
              language={language}
              selected={option.id === areaId}
              onPress={() => {
                setAreaId(option.id)
                setAreaSheetOpen(false)
                setAreaQuery('')
              }}
            />
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  )
}

/** The face for a weight in the app's language. */
function useFont(): (weight: FontWeightName) => string {
  const { i18n } = useTranslation()
  return (weight) => appFont(weight, i18n.language)
}

const areaName = areaOptionName

/** An incident type's name in the app's language. */
function categoryName(category: ReportCategory, language: string): string {
  return REPORT_CATEGORY_LABELS[category][language === 'bn' ? 'bn' : 'en']
}

/** The search box at the top of the area list. */
function AreaSearch({
  value,
  onChangeText,
}: {
  value: string
  onChangeText: (next: string) => void
}) {
  const theme = useTheme()
  const font = useFont()
  const { t } = useTranslation()

  return (
    <View
      style={[
        styles.areaSearch,
        { backgroundColor: theme.colors.surface.lavender, borderColor: theme.colors.ink[300] },
      ]}
    >
      <SolidIcon name="search" size={20} color={theme.colors.textMuted} />
      <TextInput
        accessibilityLabel={t('capture.areaSearchPlaceholder')}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('capture.areaSearchPlaceholder')}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        style={[
          styles.areaSearchInput,
          { color: theme.colors.ink[950], fontFamily: font('medium') },
        ]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('capture.areaSearchClear')}
          onPress={() => onChangeText('')}
          style={styles.areaSearchClear}
        >
          <SolidIcon name="dismiss" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * A field that opens a list: a leading tile, the chosen value (or a muted
 * placeholder) and a chevron. Used for the incident type and the area, so the
 * two look and behave alike.
 */
function SelectField({
  lead,
  value,
  placeholder,
  accessibilityLabel,
  onPress,
}: {
  lead?: React.ReactNode
  value: string | null
  placeholder: string
  accessibilityLabel: string
  onPress: () => void
}) {
  const theme = useTheme()
  const font = useFont()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.select,
        { backgroundColor: theme.colors.surface.lavender, borderColor: theme.colors.ink[300] },
      ]}
    >
      {lead}
      <Text
        numberOfLines={1}
        style={[
          styles.selectText,
          {
            color: value ? theme.colors.ink[950] : theme.colors.textMuted,
            fontFamily: font(value ? 'semibold' : 'medium'),
          },
        ]}
      >
        {value ?? placeholder}
      </Text>
      <SolidIcon name="chevronDown" size={20} color={theme.colors.textMuted} />
    </Pressable>
  )
}

/** A two-way switch: the selected half is a raised surface. */
function ModeSwitch<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value
  options: Array<{ value: Value; label: string; icon: SolidIconName }>
  onChange: (next: Value) => void
}) {
  const theme = useTheme()
  const font = useFont()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.modeSwitch,
        { backgroundColor: theme.colors.surface.lavender, borderColor: theme.colors.ink[200] },
      ]}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.modeOption,
              active && { backgroundColor: theme.colors.surface.white, ...surfaceShadow },
            ]}
          >
            <SolidIcon
              name={option.icon}
              size={18}
              color={active ? violet : theme.colors.textMuted}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.modeLabel,
                {
                  color: active ? theme.colors.ink[950] : theme.colors.textMuted,
                  fontFamily: font('bold'),
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** One row of a list in a sheet: a leading tile, the name, a check when chosen. */
function ChoiceRow({
  lead,
  label,
  selected,
  muted = false,
  onPress,
}: {
  lead?: React.ReactNode
  label: string
  selected: boolean
  muted?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const font = useFont()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceRow,
        {
          borderBottomColor: theme.colors.ink[100],
          backgroundColor: pressed ? withAlpha(violet, 0.08) : 'transparent',
        },
      ]}
    >
      {lead}
      <Text
        numberOfLines={1}
        style={[
          styles.choiceText,
          {
            color: muted ? theme.colors.textMuted : theme.colors.ink[950],
            fontFamily: font(selected ? 'bold' : 'semibold'),
          },
        ]}
      >
        {label}
      </Text>
      {selected ? <SolidIcon name="check" size={22} color={violet} /> : null}
    </Pressable>
  )
}

/** One area in the list: its name in the app's language, a check when chosen. */
function AreaChoice({
  option,
  language,
  selected,
  onPress,
}: {
  option: AreaOption
  language: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <ChoiceRow
      lead={
        <View
          style={[
            styles.neutralTile,
            { backgroundColor: withAlpha(violet, theme.colors.isDark ? 0.2 : 0.1) },
          ]}
        >
          <SolidIcon name="pin" size={22} color={violet} />
        </View>
      }
      label={areaName(option, language)}
      selected={selected}
      onPress={onPress}
    />
  )
}

/** A failure under the evidence tiles: an icon and one line, in red. */
function InlineError({ text }: { text: string }) {
  const theme = useTheme()
  const font = useFont()
  const red = theme.colors.isDark ? theme.palette.red[500] : theme.palette.red[700]
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.inlineError,
        { backgroundColor: withAlpha(red, theme.colors.isDark ? 0.14 : 0.09) },
      ]}
    >
      <SolidIcon name="warning" size={20} color={red} />
      <Text style={[styles.inlineErrorText, { color: red, fontFamily: font('semibold') }]}>
        {text}
      </Text>
    </View>
  )
}

/** One evidence source: a dashed, tinted tile with a glyph, a title and a line. */
function PickTile({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: SolidIconName
  title: string
  sub: string
  onPress: () => void
}) {
  const theme = useTheme()
  const font = useFont()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pickTile,
        {
          backgroundColor: withAlpha(
            violet,
            theme.colors.isDark ? (pressed ? 0.24 : 0.16) : pressed ? 0.16 : 0.1,
          ),
          borderColor: withAlpha(violet, 0.45),
        },
      ]}
    >
      <SolidIcon name={icon} size={30} color={violet} />
      <Text
        numberOfLines={2}
        style={[styles.pickTitle, { color: theme.colors.ink[950], fontFamily: font('bold') }]}
      >
        {title}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.pickSub, { color: theme.colors.textMuted, fontFamily: font('medium') }]}
      >
        {sub}
      </Text>
    </Pressable>
  )
}

/**
 * The attached media: a large preview with its size on it, a clear remove
 * button, and a row that says it is added and offers to replace it.
 */
function AttachedMedia({
  media,
  kind,
  okColor,
  onRemove,
}: {
  media: PreparedMedia
  kind: MediaKind
  okColor: string
  onRemove: () => void
}) {
  const theme = useTheme()
  const font = useFont()
  const { t, i18n } = useTranslation()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const digits = (value: string) => (i18n.language === 'bn' ? toBengaliDigits(value) : value)

  const label = kind === 'photo' ? t('capture.sourcePhoto') : t('capture.sourceVideo')
  const size = t('capture.attachedSize', {
    size: digits((media.byteSize / (1024 * 1024)).toFixed(1)),
  })
  const seconds =
    media.durationSeconds !== null
      ? t('capture.attachedSeconds', { seconds: digits(String(Math.round(media.durationSeconds))) })
      : null
  const meta = [label, seconds, size].filter(Boolean).join(' · ')

  return (
    <View>
      <View style={styles.previewWrap}>
        {kind === 'photo' ? (
          <Image
            source={{ uri: media.uri }}
            style={[styles.preview, { backgroundColor: theme.colors.ink[100] }]}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <LinearGradient
            colors={[theme.palette.violet[800], theme.palette.violet[500]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.preview, styles.previewCentered]}
          >
            <View style={styles.playCircle}>
              <SolidIcon name="play" size={24} color={theme.palette.violet[800]} />
            </View>
          </LinearGradient>
        )}
        <View style={[styles.metaPill, { backgroundColor: theme.staticColors.scrim }]}>
          <SolidIcon
            name={kind === 'photo' ? 'image' : 'video'}
            size={14}
            color={theme.staticColors.white}
          />
          <Text
            style={[
              styles.metaText,
              { color: theme.staticColors.white, fontFamily: font('semibold') },
            ]}
          >
            {meta}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('capture.removeAttachment')}
          onPress={onRemove}
          style={styles.removeBtn}
        >
          <View style={[styles.removeCircle, { backgroundColor: theme.staticColors.scrim }]}>
            <SolidIcon name="dismiss" size={18} color={theme.staticColors.white} />
          </View>
        </Pressable>
      </View>
      <View style={styles.attachRow}>
        <View style={styles.addedRow}>
          <SolidIcon name="checkCircle" size={20} color={okColor} />
          <Text style={[styles.addedText, { color: okColor, fontFamily: font('bold') }]}>
            {t('capture.attachedAdded')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('capture.replaceAttachment')}
          onPress={onRemove}
          style={styles.replaceBtn}
        >
          <SolidIcon name="refresh" size={18} color={violet} />
          <Text style={[styles.replaceText, { color: violet, fontFamily: font('bold') }]}>
            {t('capture.replaceAttachment')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

/** Maps a media failure to a localized message. */
function mapMediaError(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string,
): string {
  const code = (error as { code?: string } | null)?.code
  const details = (error as { details?: unknown } | null)?.details
  const permission = (details as { permission?: string } | undefined)?.permission
  const rejection = details as
    { kind?: MediaRejection['kind']; reason?: MediaRejection['reason']; maxMb?: number } | undefined
  const digits = (value: number) =>
    language === 'bn' ? toBengaliDigits(String(value)) : String(value)

  switch (code) {
    case 'MEDIA_TOO_LARGE':
      // Name the limit that was crossed, so the citizen knows what to change.
      if (rejection?.reason === 'duration') {
        return t('capture.videoTooLong', { max: digits(MEDIA_MAX_VIDEO_SECONDS) })
      }
      return rejection?.kind === 'photo'
        ? t('capture.photoTooLarge', {
            max: digits(rejection.maxMb ?? megabytes(MEDIA_MAX_SOURCE_PHOTO_BYTES)),
          })
        : t('capture.videoTooLarge', {
            max: digits(rejection?.maxMb ?? megabytes(MEDIA_MAX_FILE_BYTES)),
          })
    case 'UNSUPPORTED_MEDIA':
      return rejection?.kind === 'video'
        ? t('capture.unsupportedVideo')
        : t('capture.unsupportedPhoto')
    case 'FORBIDDEN':
      // The permission that was refused is named, so the citizen knows
      // which one to turn back on — the microphone and the camera are
      // different switches.
      if (permission === 'microphone') return t('capture.micOnlyDenied')
      if (permission === 'mediaLibrary') return t('capture.galleryDenied')
      return t('capture.cameraDenied')
    default:
      return t('capture.fileUnusable')
  }
}

/*
 * The layout follows the Home screen's rules (see `shared/ui/surface.ts`):
 * gutters 20, cards with corner radius 18 and padding 16, a gap of 12 between
 * cards, tiles of 40 to 56 dp with radius 12 to 16, and one soft shadow for every
 * raised surface. Every field is at least 48 dp tall.
 */
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
  appBarText: {
    flex: 1,
    minWidth: 0,
  },
  appBarTitle: {
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  appBarSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  contentInner: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  stack: {
    gap: 12,
  },
  sources: {
    gap: 12,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickTile: {
    flex: 1,
    minHeight: 112,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pickTitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  pickSub: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  galleryText: {
    fontSize: 14,
    lineHeight: 20,
  },
  blocked: {
    gap: 8,
  },
  blockedTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  blockedBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  preparing: {
    gap: 12,
  },
  previewBox: {
    height: 176,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  trackFill: {
    height: 8,
    borderRadius: 4,
  },
  preparingText: {
    fontSize: 13,
    lineHeight: 18,
  },
  previewWrap: {
    position: 'relative',
  },
  preview: {
    height: 176,
    borderRadius: 14,
    overflow: 'hidden',
  },
  previewCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaPill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  metaText: {
    fontSize: 12,
    lineHeight: 16,
  },
  // A 48 dp target in the corner, around a 32 dp circle.
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addedText: {
    fontSize: 13,
    lineHeight: 18,
  },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingLeft: 12,
  },
  replaceText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  selectText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  textarea: {
    minHeight: 112,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 32,
    fontSize: 15,
    lineHeight: 22,
  },
  counter: {
    position: 'absolute',
    right: 14,
    bottom: 10,
    fontSize: 12,
    lineHeight: 16,
  },
  modeSwitch: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    borderRadius: 11,
  },
  modeLabel: {
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 13,
    lineHeight: 18,
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
  manual: {
    gap: 12,
    marginTop: 12,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  manualInput: {
    minHeight: 56,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  neutralTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stickyCta: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skipLocation: {
    minHeight: 48,
    marginBottom: 8,
  },
  hint: {
    marginTop: 8,
    minHeight: 18,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  areaSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    marginBottom: 8,
    paddingLeft: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  areaSearchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 15,
    paddingVertical: 0,
  },
  areaSearchClear: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaSearchEmpty: {
    paddingVertical: 20,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  sheetList: {
    maxHeight: 360,
  },
  sheetRows: {
    gap: 0,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  choiceText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
})

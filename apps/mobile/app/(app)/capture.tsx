import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CAPTURE_DESCRIPTION_MAX_LENGTH } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { BottomSheet, Button, Icon, StatusBanner, Toggle } from '@/shared/ui';
import { useCurrentFix } from '@/shared/services/location';
import { useReverseGeocode, formatAddressLine } from '@/shared/api/geocode';
import {
  capturePhoto,
  captureVideo,
  pickDocument,
  pickFromGallery,
} from '@/shared/services/mediaSources';
import { preparePickedMedia, useCaptureSubmit, type MediaKind } from '@/shared/services/captureFlow';
import { useQueueDrain } from '@/shared/services/useQueueDrain';
import { usePermissions } from '@/shared/services/usePermissions';
import type { PreparedMedia } from '@/shared/services/mediaPipeline';
import { toBengaliDigits } from '@/shared/utils/relativeTime';

/**
 * Screen 17 — Capture (Report Crime).
 *
 * A 1:1 port of the prototype's Capture screen:
 *   - the anonymous-report card with the visibility-off icon and a toggle
 *   - three dashed upload cards (video, photo, file)
 *   - the description textarea with a `0 / 140` counter
 *   - the location card with the resolved address and accuracy
 *   - the sticky "Send report" CTA
 *
 * **Copy deviation (PRD-X-4 wins over the prototype):** the prototype's video
 * card says `সর্বোচ্চ ৬০ সেকেন্ড`; the PRD locks the video cap at **30 s**.
 * The copy here reads 30 seconds. The layout is unchanged.
 *
 * **No category picker.** FR-CAPTURE-5 was overridden on 2026-09-11: the
 * category is nullable at creation and the author sets it later from History
 * → Report detail. The prototype has no category field either, so adding one
 * would be a visible 1:1 port defect.
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
export default function CaptureScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [anonymous, setAnonymous] = useState(true);
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<PreparedMedia | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<MediaKind>('photo');
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [overflowed, setOverflowed] = useState(false);
  const [manualArea, setManualArea] = useState('');

  const { state: fixState } = useCurrentFix();
  const { data: geocode } = useReverseGeocode(
    fixState.status === 'ready' ? fixState.fix.lat : null,
    fixState.status === 'ready' ? fixState.fix.lng : null,
    fixState.status === 'ready' ? fixState.fix.accuracyM : null,
  );

  const { isSubmitting, error, submit } = useCaptureSubmit();

  // The drain is mounted on this screen so the queue actually empties. It
  // runs off the render path — the capture screen is never blocked by it.
  const { pending, savedOnDevice } = useQueueDrain();

  // The live permission state. It is read — never prompted for — and it is
  // re-read on every foreground, so a permission revoked while the app was
  // backgrounded is reflected the next time the screen renders.
  const { permissions, availability } = usePermissions();

  const counter = useMemo(() => `${description.length} / ${CAPTURE_DESCRIPTION_MAX_LENGTH}`, [
    description.length,
  ]);

  const canSubmit = media !== null && !isSubmitting;

  // The submit result is a one-shot signal — the screen navigates away on a
  // successful send and on a queued send.
  useEffect(() => {
    if (!sent) return;
    router.back();
  }, [sent, router]);

  // The overflow warning. It is an alert rather than an inline banner because
  // the screen navigates away the moment the capture is queued — an inline
  // banner would be dismissed before it was ever read.
  useEffect(() => {
    if (!overflowed) return;

    Alert.alert(t('capture.queueOverflow'), t('capture.queueOverflowBody'));
  }, [overflowed, t]);

  const openPicker = useCallback((kind: MediaKind) => {
    setPickerKind(kind);
    setPickerOpen(true);
  }, []);

  const pick = useCallback(
    async (source: 'camera' | 'gallery' | 'file') => {
      setPickerOpen(false);
      setNotice(null);

      try {
        const asset =
          source === 'file'
            ? await pickDocument()
            : source === 'camera'
              ? pickerKind === 'video'
                ? await captureVideo()
                : await capturePhoto()
              : await pickFromGallery(pickerKind === 'video' ? ['videos'] : ['images']);

        if (!asset) return;

        const prepared = await preparePickedMedia(pickerKind, asset);
        setMedia(prepared);
        setMediaKind(pickerKind);
      } catch (caught) {
        setNotice(mapMediaError(caught, t));
      }
    },
    [pickerKind, t],
  );

  const onSubmit = useCallback(async () => {
    if (!media) return;

    const outcome = await submit({
      media,
      draft: {
        description: description.trim().length > 0 ? description.trim() : null,
        publicVisibility: anonymous ? 'anonymous' : 'identified',
        lat: fixState.status === 'ready' ? fixState.fix.lat : 0,
        lng: fixState.status === 'ready' ? fixState.fix.lng : 0,
        capturedAt: new Date().toISOString(),
        // The manually-entered area travels with the report as a **hint**.
        // The server-resolved hierarchy stays authoritative.
        areaHint: manualArea.trim().length > 0 ? manualArea.trim() : null,
      },
    });

    if (outcome.status === 'queued' && outcome.droppedOldest) {
      // The queue's 20-item bound evicted the oldest report. The warning has
      // to outlive the navigation — the screen leaves as soon as the capture
      // is queued — so it is an alert rather than an inline banner.
      setOverflowed(true);
      setSent(true);
      return;
    }

    if (outcome.status === 'sent' || outcome.status === 'queued') {
      setSent(true);
    }
  }, [anonymous, description, fixState, manualArea, media, submit]);

  const addressLine = geocode ? formatAddressLine(geocode) : '';
  const hasFix = fixState.status === 'ready';

  // The manual-entry fallback shows when the location permission is not
  // granted — including while it is still undetermined, because the prompt
  // has not fired yet and the citizen should not be left waiting on a fix
  // they may never get.
  const showManualLocation =
    permissions !== null && permissions.location !== 'granted' && !hasFix;

  /**
   * Commits the manually-entered area.
   *
   * The entry is a **hint**, not a claim: the app does not resolve it and it
   * does not verify the citizen's place. It is carried with the report so the
   * server-resolved hierarchy stays authoritative and the citizen's own words
   * are still visible to whoever reads the report.
   */
  const onCommitManualArea = useCallback(() => {
    setManualArea((current) => current.trim());
    setNotice(null);
  }, []);

  /**
   * Whether the camera row may be offered for a given kind.
   *
   * A video capture needs the microphone as well as the camera, so the
   * camera row is hidden for a video when the mic is blocked.
   */
  const canUseCameraFor = useCallback(
    (kind: MediaKind): boolean => {
      if (!availability.canTakePhoto) return false;
      if (kind === 'video') return availability.canRecordVideo;
      return true;
    },
    [availability.canRecordVideo, availability.canTakePhoto],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.white }]}>
      {/* `.app-bar-no-border` */}
      <View
        style={[
          styles.appBar,
          {
            backgroundColor: theme.colors.surface.white,
            borderBottomColor: theme.colors.ink[100],
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Icon name="close" size={22} color={theme.colors.ink[700]} />
        </Pressable>
        <View style={styles.appBarCenter}>
          <Text style={[styles.appBarTitle, { color: theme.colors.ink[950] }]}>
            {t('capture.title')}
          </Text>
          <Text style={[styles.appBarSub, { color: theme.colors.ink[500] }]}>
            {t('capture.subtitle')}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        keyboardShouldPersistTaps="handled"
      >
        {/* `.capture-anon` */}
        <View
          style={[
            styles.anonCard,
            { backgroundColor: theme.palette.violet[50], borderColor: theme.palette.violet[100] },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: theme.palette.violet[100] }]}>
            <Icon name="visibility_off" size={20} color={theme.palette.violet[700]} filled />
          </View>
          <View style={styles.anonContent}>
            <Text style={[styles.anonLabel, { color: theme.colors.ink[950] }]}>
              {anonymous ? t('capture.anonymous') : t('capture.identified')}
            </Text>
            <Text style={[styles.anonHelper, { color: theme.colors.ink[500] }]}>
              {t('capture.anonymousHelper')}
            </Text>
          </View>
          <Toggle
            value={anonymous}
            onValueChange={setAnonymous}
            accessibilityLabel={t('capture.anonymous')}
          />
        </View>

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

        {/*
          The upload cards. A denied permission removes the entry point
          entirely — **hidden, not disabled**. A disabled control the user
          cannot use is a dead end; a hidden one is honest. The screen must
          not reserve a blank card where the prototype has an upload card.
        */}
        {availability.canRecordVideo ? (
          <UploadCard
            icon="videocam"
            title={t('capture.takeVideo')}
            sub={t('capture.maxVideo')}
            selected={mediaKind === 'video'}
            onPress={() => openPicker('video')}
          />
        ) : null}

        {/*
          The photo card survives a denied camera — the gallery half of it
          does not need the camera permission.
        */}
        {availability.canTakePhoto || availability.canPickFromGallery ? (
          <UploadCard
            icon="photo_camera"
            title={t('capture.takePhoto')}
            sub={
              availability.canTakePhoto
                ? t('capture.photoSub')
                : t('capture.gallerySub')
            }
            selected={mediaKind === 'photo'}
            onPress={() => openPicker('photo')}
          />
        ) : null}

        <UploadCard
          icon="attach_file"
          title={t('capture.chooseFile')}
          sub={t('capture.fileSub')}
          selected={mediaKind === 'file'}
          onPress={() => openPicker('file')}
        />

        {notice ? (
          <Text style={[styles.notice, { color: theme.palette.red[600] }]}>{notice}</Text>
        ) : null}

        {error ? (
          <Text style={[styles.notice, { color: theme.palette.red[600] }]}>
            {error.code === 'CAPTURE_RATE_LIMIT'
              ? t('capture.uploadFailed')
              : t('capture.uploadFailed')}
          </Text>
        ) : null}

        {/* Description */}
        <View style={styles.descriptionBlock}>
          <Text style={[styles.descriptionLabel, { color: theme.colors.ink[950] }]}>
            {t('capture.descriptionLabel')}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('capture.descriptionPlaceholder')}
            placeholderTextColor={theme.colors.ink[400]}
            multiline
            maxLength={CAPTURE_DESCRIPTION_MAX_LENGTH}
            accessibilityLabel={t('capture.descriptionLabel')}
            style={[
              styles.textarea,
              {
                backgroundColor: theme.colors.surface.white,
                borderColor: theme.colors.ink[200],
                color: theme.colors.ink[950],
              },
            ]}
          />
          <Text style={[styles.counter, { color: theme.colors.ink[500] }]}>{counter}</Text>
        </View>

        {/*
          The location card. With the permission denied it degrades to a
          **manual-entry fallback** — never a fake address, and never the
          prototype's hardcoded বসুন্ধরা R/A. The manual entry is a *hint*:
          the server-resolved hierarchy stays authoritative.
        */}
        <View
          style={[
            styles.locationCard,
            {
              backgroundColor: theme.colors.surface.white,
              borderColor: theme.colors.ink[100],
            },
          ]}
        >
          <Icon name="location_on" size={22} color={theme.palette.violet[700]} filled />
          <View style={styles.locationInfo}>
            <Text style={[styles.locationTitle, { color: theme.colors.ink[950] }]}>
              {manualArea
                ? t('capture.locationManualSaved')
                : hasFix
                  ? addressLine || t('capture.locationPending')
                  : t('capture.locationUnavailable')}
            </Text>
            <Text style={[styles.locationSub, { color: theme.colors.ink[500] }]}>
              {manualArea
                ? t('capture.locationManualHint')
                : hasFix && fixState.fix.accuracyM !== null
                  ? t('capture.locationAccuracy', { accuracy: toBengaliDigits(String(Math.round(fixState.fix.accuracyM))) })
                  : t('capture.locationUnavailableSub')}
            </Text>
          </View>
        </View>

        {showManualLocation ? (
          <View style={styles.manualBlock}>
            <Text style={[styles.manualLabel, { color: theme.colors.ink[950] }]}>
              {t('capture.locationManualTitle')}
            </Text>
            <TextInput
              value={manualArea}
              onChangeText={setManualArea}
              placeholder={t('capture.locationManualPlaceholder')}
              placeholderTextColor={theme.colors.ink[400]}
              accessibilityLabel={t('capture.locationManualTitle')}
              onSubmitEditing={onCommitManualArea}
              style={[
                styles.manualInput,
                {
                  backgroundColor: theme.colors.surface.white,
                  borderColor: theme.colors.ink[200],
                  color: theme.colors.ink[950],
                },
              ]}
            />
            <Text style={[styles.manualHint, { color: theme.colors.ink[500] }]}>
              {t('capture.locationManualHint')}
            </Text>
            <Button
              label={t('capture.locationManualSubmit')}
              variant="secondary"
              size="md"
              disabled={manualArea.trim().length === 0}
              onPress={onCommitManualArea}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* The media-source sheet. */}
      <BottomSheet
        visible={pickerOpen}
        title={t('capture.sourcePickerTitle')}
        onClose={() => setPickerOpen(false)}
      >
        <View style={styles.pickerRows}>
          {/*
            The camera row is offered only when the camera is permitted. A
            video capture additionally needs the microphone, so the camera
            row is hidden for a video too when the mic is blocked.
          */}
          {pickerKind !== 'file' && canUseCameraFor(pickerKind) ? (
            <PickerRow
              icon="photo_camera"
              label={t('capture.cameraOption')}
              onPress={() => void pick('camera')}
            />
          ) : null}
          {pickerKind !== 'file' ? (
            <PickerRow
              icon="photo_library"
              label={t('capture.galleryOption')}
              onPress={() => void pick('gallery')}
            />
          ) : (
            <PickerRow
              icon="attach_file"
              label={t('capture.sourceFile')}
              onPress={() => void pick('file')}
            />
          )}
        </View>
      </BottomSheet>

      {/* `.sticky-cta` */}
      <View style={styles.stickyCta}>
        {!canSubmit && !isSubmitting ? (
          <Text style={[styles.validationHint, { color: theme.palette.red[600] }]}>
            {t('capture.mediaRequired')}
          </Text>
        ) : null}
        <Button
          label={isSubmitting ? t('capture.uploading') : t('capture.submit')}
          icon="send"
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          onPress={() => void onSubmit()}
        />
      </View>
    </View>
  );
}

/** One row of the media-source sheet. */
function PickerRow({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.pickerRow, { backgroundColor: theme.colors.ink[50] }]}
    >
      <Icon name={icon} size={20} color={theme.palette.violet[700]} />
      <Text style={[styles.pickerRowText, { color: theme.colors.ink[950] }]}>{label}</Text>
      <Icon name="chevron_right" size={20} color={theme.colors.ink[400]} />
    </Pressable>
  );
}

/** Maps a media failure to a localized message. */
function mapMediaError(error: unknown, t: (key: string) => string): string {
  const code = (error as { code?: string } | null)?.code;
  const permission = (error as { details?: { permission?: string } } | null)?.details?.permission;

  switch (code) {
    case 'MEDIA_TOO_LARGE':
      return t('capture.mediaTooLong');
    case 'UNSUPPORTED_MEDIA':
      return t('capture.unsupportedFile');
    case 'FORBIDDEN':
      // The permission that was refused is named, so the citizen knows
      // which one to turn back on — the microphone and the camera are
      // different switches.
      if (permission === 'microphone') return t('capture.micOnlyDenied');
      if (permission === 'mediaLibrary') return t('capture.galleryDenied');
      return t('capture.cameraDenied');
    default:
      return t('capture.uploadFailed');
  }
}

function UploadCard({
  icon,
  title,
  sub,
  selected,
  onPress,
}: {
  icon: string;
  title: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.uploadCard,
        {
          backgroundColor: selected ? theme.palette.violet[50] : theme.palette.violet[25],
          borderColor: selected ? theme.palette.violet[500] : theme.palette.violet[300],
          borderStyle: selected ? 'solid' : 'dashed',
        },
      ]}
    >
      <View style={[styles.uploadIcon, { backgroundColor: theme.palette.violet[100] }]}>
        <Icon name={icon} size={22} color={theme.palette.violet[700]} filled />
      </View>
      <View style={styles.uploadInfo}>
        <Text style={[styles.uploadTitle, { color: theme.colors.ink[950] }]}>{title}</Text>
        <Text style={[styles.uploadSub, { color: theme.colors.ink[500] }]}>{sub}</Text>
      </View>
      <Icon name="arrow_forward_ios" size={18} color={theme.colors.ink[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarCenter: {
    alignItems: 'center',
  },
  appBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.01,
  },
  appBarSub: {
    fontSize: 11,
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 16,
  },
  anonCard: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anonContent: {
    flex: 1,
  },
  anonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  anonHelper: {
    fontSize: 11,
    marginTop: 2,
  },
  uploadCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  uploadIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadInfo: {
    flex: 1,
  },
  uploadTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.01,
  },
  uploadSub: {
    fontSize: 11,
    marginTop: 2,
  },
  notice: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  descriptionBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  textarea: {
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  counter: {
    textAlign: 'right',
    fontSize: 12,
    marginTop: 4,
  },
  locationCard: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  locationSub: {
    fontSize: 11,
    marginTop: 1,
  },
  manualBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  manualLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  manualInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    fontSize: 14,
  },
  manualHint: {
    fontSize: 11,
    marginTop: 6,
    marginBottom: 10,
  },
  pickerRows: {
    gap: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  pickerRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  stickyCta: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  validationHint: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
});

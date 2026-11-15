import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { REPORT_CATEGORY_ACCENTS } from '@nagar-shield/shared'
import { useAreaName } from '@/shared/api/areas'
import { useTheme } from '@/shared/theme'
import { appFont, type FontWeightName } from '@/shared/theme/appFont'
import {
  AppBar,
  FlagSheet,
  SolidIcon,
  StateCard,
  alertCategoryLabel,
  formatAreaHierarchy,
  withAlpha,
  type SolidIconName,
} from '@/shared/ui'
import { CategoryTile } from '@/shared/ui/CategoryTile'
import { FormCard } from '@/shared/ui/FormCard'
import { MediaGallery } from '@/shared/ui/MediaGallery'
import { TileMapFallback } from '@/shared/ui/TileMapFallback'
import { TILE_ATTRIBUTION } from '@/shared/ui/tileSource'
import { surfaceShadow } from '@/shared/ui/surface'
import {
  SIGNED_URL_RENEW_MS,
  signAlertMediaUrls,
  usePublicAlertDetail,
} from '@/shared/api/alertDetail'
import { toBengaliDigits, formatRelativeTimeForLocale } from '@/shared/utils/relativeTime'

/**
 * The **public** alert detail.
 *
 * `006-alerts / 009-alert-detail-screen` — the surface the feed card's
 * `✎ বিস্তারিত দেখুন` link opens, and the surface the History map's marker
 * tap opens. The two entry points render the identical surface.
 *
 * There are two distinct surfaces behind the prototype's `21a`
 * ---------------------------------------------------------
 * The prototype's `data-nav="21a"` target exists only as the **author's own**
 * report-detail / category-refinement surface, which is unit `004-capture`'s
 * and is reached from History. There is **no** prototype screen for the
 * *public* alert detail. This screen is the public one, created from the
 * alert card plus unit `004`'s report-detail pattern.
 *
 * The author never appears
 * ------------------------
 * The public read path returns no author id and no author display name unless
 * the author explicitly chose `identified`. The screen has **no** author
 * field, no "reported by" row, and no avatar. The author is not erased — the
 * database keeps `author_id` for moderation — but the public surface has
 * nothing to render.
 *
 * The flag action is the same component, not a copy
 * -------------------------------------------------
 * The detail opens the **same** `FlagSheet` the feed card opens: the same five
 * reason radios, the same optional note, the same submit / cancel, the same
 * success toast, and the same `CONFLICT` / `FLAG_RATE_LIMIT` mapping. A copy
 * is how two surfaces drift.
 *
 * A civic-information surface
 * ---------------------------
 * The screen never presents a citizen report as a verified incident and never
 * claims the app notified, dispatched, or escalated anything to an authority
 * (C-6).
 */
export default function AlertDetailScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{ id?: string }>()
  const reportId = params.id

  const { data: alert, isLoading, isError, refetch } = usePublicAlertDetail(reportId)

  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({})
  const [flagOpen, setFlagOpen] = useState(false)

  // The signed URLs are fetched once the media rows are known. The bucket is
  // private, so a URL is needed to render the image — and it is fetched on
  // demand, never stored.
  useEffect(() => {
    let active = true

    if (!alert || alert.media.length === 0) {
      setMediaUrls({})
      return
    }

    // A signing failure leaves the placeholder icon in each tile — it never
    // rejects unhandled and never takes the rest of the detail down.
    const sign = () =>
      void signAlertMediaUrls(alert.media)
        .then((urls) => {
          if (!active) return
          setMediaUrls(urls)
        })
        // A failed renewal keeps the links already held: they may still work.
        .catch(() => undefined)

    sign()

    // The links last ten minutes. A screen left open longer renews them
    // before they lapse, so a photo opened later is not a blank frame.
    const timer = setInterval(sign, SIGNED_URL_RENEW_MS)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [alert])

  const category = alert?.category ?? null
  const categoryLabel = alertCategoryLabel(category, t('alerts.uncategorized'), i18n.language)
  const accent = category ? REPORT_CATEGORY_ACCENTS[category] : theme.colors.ink[400]

  // The area line is the **card's** rule, not a second copy of it: the detail
  // surface is behind the card's detail link, so the two must name the same
  // place the same way — including the fallback when a level is absent.
  const areaName = useAreaName()
  const areaLine = useMemo(() => {
    if (!alert) return null
    return formatAreaHierarchy(alert.areaHierarchy, areaName)
  }, [alert, areaName])

  const relativeTime = alert ? formatRelativeTimeForLocale(alert.capturedAt, i18n.language) : ''
  const absoluteTime = alert
    ? new Date(alert.capturedAt).toLocaleString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB')
    : ''

  const language = i18n.language
  const font = (weight: FontWeightName) => appFont(weight, language)
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const red = theme.palette.red[theme.colors.isDark ? 500 : 700]

  const bar = <AppBar title={t('alerts.detailTitle')} onBack={() => router.back()} />
  const frame = (content: React.ReactNode) => (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      {bar}
      {content}
    </View>
  )

  // A report that does not resolve — because it never existed, because it was
  // removed by moderation, or because it was soft-deleted — renders the "no
  // longer available" state and **no** report content. The three are
  // indistinguishable from outside, so the state cannot be used to discover
  // which reports were hidden.
  if (isLoading) {
    return frame(
      <View
        testID="alert-detail-skeleton"
        accessibilityLiveRegion="polite"
        style={styles.skeletons}
      >
        {[72, 150, 120].map((height) => (
          <View
            key={height}
            style={[styles.skeleton, { height, backgroundColor: theme.colors.ink[100] }]}
          />
        ))}
        <ActivityIndicator color={theme.palette.violet[600]} />
      </View>,
    )
  }

  // A read that **failed** says nothing about the report: it may be there.
  // Only a successful read that returned nothing is "no longer available".
  if (isError && !alert) {
    return frame(
      <View style={styles.stateWrap} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <StateCard
          icon="cloudOff"
          tone="danger"
          title={t('alerts.detailLoadFailed')}
          body={t('alerts.loadFailedSub')}
          action={{ label: t('common.retry'), icon: 'refresh', onPress: () => void refetch() }}
        />
      </View>,
    )
  }

  if (!alert) {
    return frame(
      <View style={styles.stateWrap}>
        <StateCard
          icon="info"
          title={t('alerts.detailUnavailableTitle')}
          body={t('alerts.detailUnavailableBody')}
        />
      </View>,
    )
  }

  const mediaCount = alert.media.length
  const mediaCountLabel = t('alerts.mediaFiles', {
    number: language === 'bn' ? toBengaliDigits(String(mediaCount)) : String(mediaCount),
  })

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface.lavender }]}>
      {bar}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* What happened: the incident type, how long ago and where, in one
            compact card. A report with no category shows the neutral tile — the
            category is never invented. */}
        <View
          accessible
          accessibilityLabel={`${categoryLabel}. ${relativeTime} · ${areaLine ?? ''}`}
          style={[styles.hero, { backgroundColor: theme.colors.surface.white }]}
        >
          <CategoryTile category={category} size={44} />
          <View style={styles.heroText}>
            <Text
              numberOfLines={1}
              style={[styles.heroTitle, { color: theme.colors.ink[950], fontFamily: font('bold') }]}
            >
              {categoryLabel}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.heroSub,
                { color: theme.colors.textMuted, fontFamily: font('medium') },
              ]}
            >
              {areaLine ? `${relativeTime} · ${areaLine}` : relativeTime}
            </Text>
          </View>
        </View>

        {/* The media. A report with no media renders no media block at all —
            no empty placeholder box, no broken image frame. */}
        {mediaCount > 0 ? (
          <FormCard
            title={t('alerts.mediaCardTitle')}
            tag={mediaCount > 1 ? mediaCountLabel : undefined}
            language={language}
          >
            <MediaGallery
              items={alert.media.map((media) => ({
                id: media.id,
                kind: media.mediaType,
                url: mediaUrls[media.storagePath] ?? null,
              }))}
            />
          </FormCard>
        ) : null}

        {/* The description. A report with no description renders no
            description block — no empty gap and no empty string. */}
        {alert.description ? (
          <FormCard title={t('alerts.whatHappened')} language={language}>
            <Text
              style={[
                styles.description,
                { color: theme.colors.ink[950], fontFamily: font('regular') },
              ]}
            >
              {alert.description}
            </Text>
          </FormCard>
        ) : null}

        {/* Where it happened. A map you can drag and zoom, with a pin on the
            report's own coordinates, so the pin moves with the map. A report
            with no coordinates shows no map at all — no empty box. */}
        <FormCard title={t('alerts.locationCardTitle')} language={language}>
          {alert.lat !== null && alert.lng !== null ? (
            <View style={[styles.map, { borderColor: theme.colors.ink[100] }]}>
              <TileMapFallback
                center={{ lat: alert.lat, lng: alert.lng }}
                zoom={16}
                markers={[]}
                userLocation={null}
                placePin={{
                  lat: alert.lat,
                  lng: alert.lng,
                  label: t('alerts.reportedHere'),
                  color: accent,
                }}
                zoomControls
              />
              {/* The tile provider's attribution is a condition of using its tiles. */}
              <View pointerEvents="none" style={styles.mapAttribution}>
                <Text numberOfLines={1} style={styles.mapAttributionText}>
                  {TILE_ATTRIBUTION}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={[styles.where, alert.lat === null && styles.whereAlone]}>
            <View style={[styles.rowTile, { backgroundColor: withAlpha(violet, 0.12) }]}>
              <SolidIcon name="pin" size={22} color={violet} />
            </View>
            <Text
              numberOfLines={2}
              style={[styles.whereText, { color: theme.colors.ink[950], fontFamily: font('bold') }]}
            >
              {areaLine ?? '—'}
            </Text>
          </View>
        </FormCard>

        {/* The time: how long ago, and the exact moment. */}
        <View style={[styles.facts, { backgroundColor: theme.colors.surface.white }]}>
          <FactRow
            icon="clock"
            label={t('alerts.reportedLabel')}
            value={relativeTime}
            last={false}
          />
          <FactRow
            icon="calendar"
            label={t('alerts.absoluteTimeLabel')}
            value={absoluteTime}
            last
          />
        </View>

        {/* The flag action — the same shared sheet the feed card opens. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('alerts.flagThis')}
          onPress={() => setFlagOpen(true)}
          style={[
            styles.flag,
            { backgroundColor: withAlpha(red, theme.colors.isDark ? 0.14 : 0.09) },
          ]}
        >
          <SolidIcon name="flag" size={20} color={red} />
          <Text style={[styles.flagText, { color: red, fontFamily: font('bold') }]}>
            {t('alerts.flagThis')}
          </Text>
        </Pressable>

        {/* The civic-information note. It is not a disclaimer bolted on — it
            is the truth about what a citizen report is. */}
        <Text style={[styles.note, { color: theme.colors.textMuted, fontFamily: font('medium') }]}>
          {t('alerts.detailNote')}
        </Text>
      </ScrollView>

      <FlagSheet
        visible={flagOpen}
        reportId={alert.id}
        onClose={() => setFlagOpen(false)}
        onFlagged={() => {
          // A flag that crosses the 3-flag threshold hides the report. The
          // detail then shows its "no longer available" state — the same
          // state a removed report shows.
          setFlagOpen(false)
        }}
      />
    </View>
  )
}

/** One label/value pair — how long ago, and the exact time. */
function FactRow({
  icon,
  label,
  value,
  last,
}: {
  icon: SolidIconName
  label: string
  value: string
  last: boolean
}) {
  const theme = useTheme()
  const { i18n } = useTranslation()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <View
      style={[
        styles.factRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.ink[200],
        },
      ]}
    >
      <View style={[styles.rowTile, { backgroundColor: withAlpha(violet, 0.12) }]}>
        <SolidIcon name={icon} size={22} color={violet} />
      </View>
      <View style={styles.factText}>
        <Text
          style={[
            styles.factLabel,
            { color: theme.colors.textMuted, fontFamily: appFont('semibold', i18n.language) },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.factValue,
            { color: theme.colors.ink[950], fontFamily: appFont('bold', i18n.language) },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  stateWrap: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  skeletons: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  skeleton: {
    borderRadius: 18,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    ...surfaceShadow,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  heroSub: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
  },
  map: {
    height: 196,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#EFE6F8',
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
  },
  whereAlone: {
    marginTop: 0,
  },
  whereText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  rowTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facts: {
    paddingHorizontal: 16,
    borderRadius: 18,
    ...surfaceShadow,
  },
  factRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  factText: {
    flex: 1,
    minWidth: 0,
  },
  factLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  factValue: {
    fontSize: 15,
    lineHeight: 21,
  },
  flag: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
  },
  flagText: {
    fontSize: 15,
    lineHeight: 21,
  },
  note: {
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
})

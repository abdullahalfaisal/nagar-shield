import { useMemo } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { REPORT_CATEGORY_LABELS, type ReportCategory } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { EmptyState, ListRow, Screen, StationMap, type StationMarker } from '@/shared/ui'
import { zoomForRadius } from '@/shared/ui/tileMap'
import { useHistory, type HistoryReport } from '@/shared/api/history'
import { DHAKA_FALLBACK_ORIGIN } from '@/shared/services/location'
import { DEFAULT_HISTORY_FILTERS } from '@/shared/services/historyFilters'
import { formatRelativeTimeForLocale, toBengaliDigits } from '@/shared/utils/relativeTime'

/**
 * The History map.
 *
 * `006-alerts / 008-history-map` — the **ম্যাপ ভিউ** target.
 *
 * Three things this screen is careful about:
 *
 *   * **One wrapper, no fork.** The map is built on unit `003`'s shared
 *     `shared/ui/StationMap` and the same OSM raster style. The two surfaces
 *     stay visually identical because they share one component, not two
 *     copies — forking is how the attribution gets silently dropped from one
 *     of them, and the attribution is a condition of using the public OSM
 *     tile servers.
 *   * **The same query, the same key.** The map reuses the History query and
 *     the History query key. There is no second map-specific fetch, so a
 *     filter change on the list is reflected on the map without a parallel
 *     query, and the map can never show a different filter set than the list.
 *   * **The prototype's screen 23 is never the target.** Screen 23 is the
 *     Charts screen — a crime-statistics surface the product explicitly does
 *     not have (FR-NG-3 / FR-NG-4 / ADR-010). It has no owning unit and is
 *     never built.
 */
export default function HistoryMapScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  const params = useLocalSearchParams<{
    lat?: string
    lng?: string
    radiusKm?: string
    windowHours?: string
    category?: string
    fallback?: string
  }>()

  // The filter set arrives from the History screen. The map renders the
  // reports inside the **current** filter — never a separate, wider set. The
  // fallback is the screen's cold-launch default, not a second radius.
  const radiusKm = Number(params.radiusKm ?? DEFAULT_HISTORY_FILTERS.radiusKm)
  const windowHours = Number(params.windowHours ?? DEFAULT_HISTORY_FILTERS.windowHours)
  const category = (params.category || null) as ReportCategory | null

  // The origin. The map opens on the caller's position when there is one, and
  // on the default Dhaka-metro centre when there is not — the map is never
  // blank and never crashes on a denied permission.
  const origin = useMemo(() => {
    const lat = Number(params.lat)
    const lng = Number(params.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { lat: DHAKA_FALLBACK_ORIGIN.lat, lng: DHAKA_FALLBACK_ORIGIN.lng, isFallback: true }
    }
    // History passes its own fallback centre as coordinates, so the numbers
    // alone cannot say it is not a real fix: it sends the flag as well.
    return { lat, lng, isFallback: Boolean(params.fallback) }
  }, [params.lat, params.lng, params.fallback])

  const { data, isLoading, isError, refetch } = useHistory({
    lat: origin.lat,
    lng: origin.lng,
    radiusKm,
    windowHours,
    category,
    // The most the read model returns in one page. The map is a spatial
    // overview; the History list pages through the rest.
    limit: 100,
  })

  const reports = useMemo(() => data?.items ?? [], [data])

  // The reports the map can pin: coordinates present and inside the radius.
  //
  // The read model always includes the caller's **own** reports, even when
  // they sit outside the radius (FR-HIST-3 — that guarantee is for the list,
  // so the list is never empty of the user's own rows). On the map those rows
  // are kilometres outside the viewport: the camera is zoomed to the radius
  // window, so a far marker is invisible, and it would suppress the empty
  // state while showing nothing. `distanceM` is null exactly for the
  // out-of-radius own rows, so dropping them here keeps the map showing only
  // what the current filter actually contains — and lets the "no reports"
  // card appear when the radius holds nothing.
  const placeable = useMemo(
    () =>
      reports.filter(
        (report) => report.lat !== null && report.lng !== null && report.distanceM !== null,
      ),
    [reports],
  )

  // Reports that share a place share one pin, and the pin carries the count.
  //
  // At street zoom a 16 dp pin covers about a hundred metres, so reports a
  // few metres apart — every capture at the same corner — stack into one dot
  // that reads exactly like a single report. Forty-seven reports at four
  // places looked like four stray reports. Grouping them on a ~110 m grid
  // makes the pin honest: a "21" on it says twenty-one reports happened
  // there. The pin sits on the newest report's coordinate and opens that
  // report's detail; the list under the map remains the complete, per-report
  // view, so nothing is hidden — the rows still carry every report.
  const markers = useMemo<StationMarker[]>(() => {
    const byPlace = new Map<string, HistoryReport[]>()
    for (const report of placeable) {
      const key = `${(report.lat as number).toFixed(3)},${(report.lng as number).toFixed(3)}`
      const group = byPlace.get(key)
      if (group) group.push(report)
      else byPlace.set(key, [report])
    }

    return [...byPlace.values()].flatMap((group) => {
      // The rows arrive newest-first from the read model, so the first row of
      // a group is the newest report at that place.
      const [newest] = group
      if (!newest) return []
      return [
        {
          id: newest.id,
          lat: newest.lat as number,
          lng: newest.lng as number,
          title: newest.category
            ? REPORT_CATEGORY_LABELS[newest.category][i18n.language === 'bn' ? 'bn' : 'en']
            : t('alerts.uncategorized'),
          subtitle: formatRelativeTimeForLocale(newest.capturedAt, i18n.language),
          count: group.length > 1 ? group.length : undefined,
          onPress: () =>
            router.push({ pathname: '/(app)/alert-detail', params: { id: newest.id } }),
        },
      ]
    })
  }, [placeable, router, i18n.language, t])

  const markerRows = placeable.map((report) => (
    <View key={report.id} style={styles.list}>
      <ListRow
        title={
          report.category
            ? REPORT_CATEGORY_LABELS[report.category][i18n.language === 'bn' ? 'bn' : 'en']
            : t('alerts.uncategorized')
        }
        subtitle={formatRelativeTimeForLocale(report.capturedAt, i18n.language)}
        icon="location_on"
        tone="purple"
        showArrow
        onPress={() => router.push({ pathname: '/(app)/alert-detail', params: { id: report.id } })}
      />
    </View>
  ))

  return (
    <Screen
      title={t('history.mapTitle')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <StationMap
        center={{ lat: origin.lat, lng: origin.lng }}
        zoom={zoomForRadius(radiusKm, origin.lat)}
        markers={markers}
        items={markerRows}
        userLocation={origin.isFallback ? null : { lat: origin.lat, lng: origin.lng }}
        // The fallback (Expo Go) cannot pan or pinch, so the + / − buttons are
        // the only way to look around a radius that has nothing in it.
        zoomControls
        overlay={
          isLoading ? (
            <ActivityIndicator
              accessibilityLabel={t('common.loading')}
              color={theme.palette.violet[600]}
            />
          ) : isError && !data ? (
            // A failed read is not "no reports".
            <View
              style={[
                styles.overlayCard,
                { backgroundColor: theme.colors.surface.white, borderColor: theme.colors.ink[100] },
              ]}
            >
              <EmptyState
                icon="cloud_off"
                title={t('history.loadFailed')}
                description={t('alerts.loadFailedSub')}
                action={{ label: t('common.retry'), onPress: () => void refetch() }}
              />
            </View>
          ) : markers.length === 0 ? (
            <View
              style={[
                styles.overlayCard,
                { backgroundColor: theme.colors.surface.white, borderColor: theme.colors.ink[100] },
              ]}
            >
              <EmptyState
                icon="map"
                title={t('history.noResults')}
                description={t('history.noResultsSub')}
              />
            </View>
          ) : null
        }
      >
        {placeable.length > 0 && data && data.totalCount > placeable.length ? (
          <View style={styles.list}>
            <Text style={[styles.emptyNote, { color: theme.colors.ink[500] }]}>
              {t('history.showingCount', {
                shown: localDigits(placeable.length, i18n.language),
                total: localDigits(data.totalCount, i18n.language),
              })}
            </Text>
          </View>
        ) : null}
      </StationMap>
    </Screen>
  )
}

/** A count in the language's digits. */
function localDigits(value: number, language: string): string {
  return language === 'bn' ? toBengaliDigits(String(value)) : String(value)
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  overlayCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 12,
    minWidth: 240,
  },
  emptyNote: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
})

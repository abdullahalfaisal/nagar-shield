import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_LABELS,
  type ReportCategory,
} from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import { appFont, type FontWeightName } from '@/shared/theme/appFont'
import { mixHex } from '@/shared/theme/colorMix'
import {
  HistoryFilterSheet,
  Screen,
  SolidIcon,
  StateCard,
  alertCategoryLabel,
  formatAreaHierarchy,
  withAlpha,
} from '@/shared/ui'
import { CategoryTile } from '@/shared/ui/CategoryTile'
import { TileMapFallback } from '@/shared/ui/TileMapFallback'
import { zoomForRadius } from '@/shared/ui/tileMap'
import { surfaceShadow } from '@/shared/ui/surface'
import {
  countByCategory,
  distanceLabelParts,
  historyItems,
  historyTotal,
  useHistoryFeed,
} from '@/shared/api/history'
import { areaOptionName, useAreaName, useAreaOptions } from '@/shared/api/areas'
import { formatAddressLine, useReverseGeocode } from '@/shared/api/geocode'
import { resolveOrigin, useCurrentFix } from '@/shared/services/location'
import { useRefreshOnFocus } from '@/shared/api/useRefreshOnFocus'
import {
  DEFAULT_HISTORY_FILTERS,
  HISTORY_TYPE_ORDER,
  historyFiltersEqual,
  type HistoryFilters,
} from '@/shared/services/historyFilters'
import { groupByDay, type HistoryDayGroup } from '@/shared/services/historyGroups'
import { formatRelativeTimeForLocale, toBengaliDigits } from '@/shared/utils/relativeTime'

/**
 * Screen 21 — History.
 *
 * `006-alerts / 006-history-list` — the local History view: the caller's own
 * reports plus the reports inside the active radius of the current fix over
 * the active window (FR-HIST-1 — the screen opens at the widest offered
 * radius, 15 km, with the shared 24 h window).
 *
 * The layout
 * ----------
 * One card at the top says what the list shows — the area, then the radius, the
 * window and the incident type — and opens the filter sheet. Under it, three
 * tabs: **Reports**, **My reports** and **Summary**. The map is a button in the
 * app bar. Rows are grouped by day, one card per day.
 *
 * Summary is **counts only**
 * --------------------------
 * The summary tab is the totals and a count per incident type, as a list.
 * Never a chart, a bar, a percentage, or a trend (FR-NG-3 / FR-NG-4 /
 * ADR-010). The prototype's own screen-22 copy states the product rule out
 * loud: *"We don't show crime statistics, heatmaps, or hotspot rankings —
 * Nagar Shield is for live reports, not aggregator data."* The types are shown
 * in one fixed order (`HISTORY_TYPE_ORDER`), never sorted by their counts.
 *
 * My reports
 * ----------
 * A row in **My reports** opens the author's own detail (where the category is
 * editable); a row in **Reports** opens the **public** alert detail (unit
 * `006`), because the neighbouring reports are the public projection and carry
 * no author field at all. The author's own branch is independent of the radius
 * and the window — the RPC's own-reports branch is what makes FR-HIST-3 true.
 *
 * The filter sheet
 * ----------------
 * The filter state is part of the **query key**, so the list, the summary and
 * the map all move together and no surface can serve a page from a stale filter.
 */
type HistoryTab = 'list' | 'mine' | 'summary'

export default function HistoryScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const font = (weight: FontWeightName) => appFont(weight, language)

  const [tab, setTab] = useState<HistoryTab>('list')
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS)
  const [sheetOpen, setSheetOpen] = useState(false)

  // The fix is requested just-in-time — when the History screen opens — and
  // never on the panic path (FR-PERMS-2). A denied permission degrades to the
  // Dhaka fallback origin rather than blocking the list.
  const { state } = useCurrentFix()
  const located = resolveOrigin(state)

  // An area the person chose replaces the phone's position as the centre of the
  // radius, so every filter applies to it the same way. Until the area list
  // has loaded the phone's position stands in.
  const { data: areaOptions } = useAreaOptions()
  const chosenArea = filters.areaId
    ? (areaOptions?.find((option) => option.id === filters.areaId) ?? null)
    : null
  const origin = chosenArea
    ? { lat: chosenArea.lat, lng: chosenArea.lng, accuracyM: null }
    : located.origin
  // The phone's position is still being found. That is not "unavailable": the
  // list waits for it (a few seconds at most) instead of showing Dhaka first.
  const locating = !chosenArea && (state.status === 'idle' || state.status === 'loading')
  const isFallback = chosenArea || locating ? false : located.isFallback
  // Only the phone's own position is "you": a chosen area has no distance from
  // you and no "you are here" dot.
  const hasOwnPosition = !chosenArea && !locating && !located.isFallback

  const {
    data,
    dataUpdatedAt,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useHistoryFeed(
    {
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: filters.radiusKm,
      windowHours: filters.windowHours,
      category: filters.category,
    },
    { enabled: !locating },
  )

  useRefreshOnFocus(refetch, dataUpdatedAt)

  const items = useMemo(() => historyItems(data), [data])
  const total = historyTotal(data)

  // The spinner is for a pull the user made, not for a background refetch or
  // for loading the next page, so it is local state rather than `isRefetching`.
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  // A failed load with nothing to show is a failure, not "no reports".
  const loadFailed = isError && items.length === 0
  const retry = () => void refetch()

  // The list pages in, so the rows and the counts only cover what is loaded.
  // Say so whenever there is more, instead of letting a 50-row sample read as
  // the whole picture.
  const partialNote =
    hasNextPage && total !== null
      ? t('history.showingCount', {
          shown: localDigits(items.length, language),
          total: localDigits(total, language),
        })
      : null

  const ownReports = useMemo(() => items.filter((report) => report.isOwn), [items])
  const nearbyReports = useMemo(() => items.filter((report) => !report.isOwn), [items])
  const distribution = useMemo(() => countByCategory(items), [items])

  const tabs: Array<{ id: HistoryTab; label: string }> = [
    { id: 'list', label: t('history.listTab') },
    { id: 'mine', label: t('alerts.historyMyReports') },
    { id: 'summary', label: t('history.summaryTab') },
  ]

  // The filter card names the search centre the way a person reads places — a
  // reverse-geocoded area line ("Mirpur, Dhaka"), never raw coordinates. Until
  // it resolves, or when it comes back empty, the card says the circle is the
  // user's own position. Without a real fix it says so, and says it is showing
  // Dhaka.
  const translateArea = useAreaName()
  const { data: geocode } = useReverseGeocode(
    hasOwnPosition ? origin.lat : null,
    hasOwnPosition ? origin.lng : null,
    origin.accuracyM ?? null,
  )
  const areaLine = formatAddressLine(geocode ?? null, translateArea)

  const radiusLabel =
    filters.radiusKm < 1
      ? t('history.metres', { value: localDigits(Math.round(filters.radiusKm * 1000), language) })
      : t('history.km', { value: localDigits(filters.radiusKm, language) })
  const windowLabel = t(windowKey(filters.windowHours))
  const typeLabel = filters.category
    ? (REPORT_CATEGORY_LABELS[filters.category]?.[language === 'en' ? 'en' : 'bn'] ??
      filters.category)
    : t('history.allCategories')
  const placeName = chosenArea
    ? areaOptionName(chosenArea, language)
    : locating
      ? t('location.locating')
      : isFallback
        ? t('history.filterLocationUnavailable')
        : areaLine || t('history.aroundYou')
  const filterLine = isFallback
    ? `${t('history.showingDhaka')} · ${radiusLabel} · ${windowLabel}`
    : `${radiusLabel} · ${windowLabel} · ${typeLabel}`

  const applyFilters = (next: HistoryFilters) => {
    // A sheet that changes nothing must not re-query: the result set is
    // identical and a needless request would only make the list flicker.
    if (historyFiltersEqual(next, filters)) return
    setFilters(next)
  }

  const openRow = (reportId: string, isOwn: boolean) => {
    if (isOwn) {
      router.push({ pathname: '/(app)/report-detail', params: { reportId } })
      return
    }
    router.push({ pathname: '/(app)/alert-detail', params: { id: reportId } })
  }

  const openMap = () =>
    router.push({
      pathname: '/(app)/history-map',
      params: {
        lat: String(origin.lat),
        lng: String(origin.lng),
        radiusKm: String(filters.radiusKm),
        windowHours: String(filters.windowHours),
        category: filters.category ?? '',
        // The map must not draw a "you are here" dot on the fallback.
        fallback: hasOwnPosition ? '' : '1',
      },
    })

  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const amber = theme.palette.amber[theme.colors.isDark ? 500 : 600]
  // Small amber text needs more weight than the tile colour on a white card.
  const amberText = theme.colors.isDark ? amber : mixHex(amber, theme.staticColors.black, 0.28)

  // What the body of the current tab shows.
  let body: ReactNode
  if (isLoading || locating) {
    body = <HistorySkeleton />
  } else if (loadFailed) {
    body = (
      <View accessibilityRole="alert" accessibilityLiveRegion="polite">
        <StateCard
          icon="cloudOff"
          tone="danger"
          title={t('history.loadFailed')}
          body={t('alerts.loadFailedSub')}
          action={{ label: t('common.retry'), icon: 'refresh', onPress: retry }}
        />
      </View>
    )
  } else if (tab === 'summary') {
    body = (
      <Summary
        total={total ?? items.length}
        own={ownReports.length}
        nearby={nearbyReports.length}
        distribution={distribution}
        partialNote={partialNote}
        language={language}
      />
    )
  } else {
    const rows = tab === 'mine' ? ownReports : items
    if (rows.length === 0) {
      body =
        tab === 'mine' ? (
          <StateCard
            icon="documentAdd"
            title={t('alerts.noOwnReports')}
            body={t('alerts.noOwnReportsSub')}
          />
        ) : (
          <StateCard
            icon="documentSearch"
            title={t('history.noResults')}
            body={t('history.noResultsSub')}
            action={{
              label: t('history.changeFilters'),
              icon: 'tune',
              onPress: () => setSheetOpen(true),
            }}
          />
        )
    } else {
      body = (
        <ReportList
          reports={rows}
          showDistance={hasOwnPosition && tab === 'list'}
          showOwnMark={tab === 'list'}
          onOpen={openRow}
          language={language}
        />
      )
      if (hasNextPage) {
        body = (
          <>
            {body}
            <View style={styles.more}>
              {partialNote ? (
                <Text
                  style={[
                    styles.moreNote,
                    { color: theme.colors.textMuted, fontFamily: font('medium') },
                  ]}
                >
                  {partialNote}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('history.loadMore')}
                accessibilityState={{ disabled: isFetchingNextPage, busy: isFetchingNextPage }}
                disabled={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
                style={styles.moreButton}
              >
                <Text style={[styles.moreText, { color: violet, fontFamily: font('bold') }]}>
                  {isFetchingNextPage ? t('common.loading') : t('history.loadMore')}
                </Text>
              </Pressable>
            </View>
          </>
        )
      }
    }
  }

  return (
    <Screen
      title={t('history.title')}
      subtitle={t('history.subtitle')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.palette.violet[600]}
          />
        }
      >
        {/* What the list shows. One tap changes it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('history.filtersTitle')}. ${placeName}. ${filterLine}`}
          onPress={() => setSheetOpen(true)}
          style={[styles.filterCard, { backgroundColor: theme.colors.surface.white }]}
        >
          <View
            style={[
              styles.filterTile,
              { backgroundColor: isFallback ? amber : withAlpha(violet, 0.12) },
            ]}
          >
            <SolidIcon
              name={isFallback ? 'locationOff' : 'options'}
              size={22}
              color={
                isFallback
                  ? theme.colors.isDark
                    ? theme.staticColors.black
                    : theme.staticColors.white
                  : violet
              }
            />
          </View>
          <View style={styles.filterText}>
            <Text
              numberOfLines={1}
              style={[
                styles.filterTitle,
                { color: theme.colors.ink[950], fontFamily: font('bold') },
              ]}
            >
              {placeName}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.filterSub,
                {
                  color: isFallback ? amberText : theme.colors.textMuted,
                  fontFamily: font(isFallback ? 'semibold' : 'medium'),
                },
              ]}
            >
              {filterLine}
            </Text>
          </View>
          <SolidIcon name="chevronDown" size={20} color={theme.colors.textMuted} />
        </Pressable>

        {/* The map is half of what this screen is for, so it gets a card of its
            own with a live preview, not a small icon in the corner. */}
        <MapPreviewCard
          reports={items}
          origin={origin}
          isFallback={!hasOwnPosition}
          radiusKm={filters.radiusKm}
          count={total ?? items.length}
          onOpen={openMap}
        />

        <View
          accessibilityRole="tablist"
          style={[
            styles.tabs,
            { backgroundColor: theme.colors.surface.white, borderColor: theme.colors.ink[200] },
          ]}
        >
          {tabs.map((entry) => {
            const active = entry.id === tab
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={entry.label}
                onPress={() => setTab(entry.id)}
                style={[styles.tab, active && { backgroundColor: violet }]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabText,
                    {
                      color: active
                        ? theme.colors.isDark
                          ? theme.staticColors.black
                          : theme.staticColors.white
                        : theme.colors.textMuted,
                      fontFamily: font('bold'),
                    },
                  ]}
                >
                  {entry.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {body}
      </ScrollView>

      <HistoryFilterSheet
        visible={sheetOpen}
        filters={filters}
        onClose={() => setSheetOpen(false)}
        onApply={applyFilters}
      />
    </Screen>
  )
}

/**
 * The map entry: a live, non-interactive preview with a pin for each report, a
 * title, the number of reports and an "Open map" button. The whole card opens
 * the map screen. The preview does not pan or pinch — it is a picture of the
 * map, and the touch belongs to the card.
 */
function MapPreviewCard({
  reports,
  origin,
  isFallback,
  radiusKm,
  count,
  onOpen,
}: {
  reports: ReportRow[]
  origin: { lat: number; lng: number }
  isFallback: boolean
  radiusKm: number
  count: number
  onOpen: () => void
}) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  const pins = useMemo(
    () =>
      reports.flatMap((report) =>
        report.lat !== null && report.lng !== null
          ? [
              {
                id: report.id,
                lat: report.lat,
                lng: report.lng,
                color: report.category
                  ? REPORT_CATEGORY_ACCENTS[report.category]
                  : theme.colors.ink[400],
              },
            ]
          : [],
      ),
    [reports, theme.colors.ink],
  )

  const sub =
    count > 0
      ? t('history.mapCardSub', { number: localDigits(count, language) })
      : t('history.mapCardEmpty')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('history.mapCardTitle')}. ${sub}`}
      onPress={onOpen}
      style={[styles.mapCard, { backgroundColor: theme.colors.surface.white }]}
    >
      <View style={styles.mapCardHead}>
        <View style={[styles.mapCardTile, { backgroundColor: withAlpha(violet, 0.12) }]}>
          <SolidIcon name="map" size={22} color={violet} />
        </View>
        <View style={styles.mapCardText}>
          <Text
            numberOfLines={1}
            style={[
              styles.mapCardTitle,
              { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
            ]}
          >
            {t('history.mapCardTitle')}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.mapCardSub,
              { color: theme.colors.textMuted, fontFamily: appFont('medium', language) },
            ]}
          >
            {sub}
          </Text>
        </View>
        <View style={[styles.mapCardButton, { backgroundColor: violet }]}>
          <Text
            numberOfLines={1}
            style={[
              styles.mapCardButtonText,
              {
                color: theme.colors.isDark ? theme.staticColors.black : theme.staticColors.white,
                fontFamily: appFont('bold', language),
              },
            ]}
          >
            {t('history.mapOpen')}
          </Text>
        </View>
      </View>

      <View pointerEvents="none" style={styles.mapPreview}>
        <TileMapFallback
          center={origin}
          zoom={zoomForRadius(radiusKm, origin.lat)}
          markers={pins}
          userLocation={isFallback ? null : origin}
          zoomControls={false}
        />
      </View>
    </Pressable>
  )
}

/** The i18n key that names a time window. */
function windowKey(hours: number) {
  if (hours <= 1) return 'history.windowHour' as const
  if (hours <= 24) return 'history.windowDay' as const
  if (hours <= 168) return 'history.windowWeek' as const
  return 'history.windowMonth' as const
}

const GROUP_KEYS: Record<HistoryDayGroup, string> = {
  today: 'history.today',
  yesterday: 'history.yesterday',
  earlier: 'history.earlier',
}

interface ReportRow {
  id: string
  category: ReportCategory | null
  capturedAt: string
  lat: number | null
  lng: number | null
  areaHierarchy: { division: string; city: string; thana: string; neighborhood?: string } | null
  distanceM: number | null
  isOwn: boolean
}

/**
 * The report rows, grouped by day — one card per day.
 *
 * A row's subtitle is the relative time and the area. A nearby report carries
 * its distance from the origin on the right; the author's own report says so
 * instead.
 */
function ReportList({
  reports,
  showDistance,
  showOwnMark,
  onOpen,
  language,
}: {
  reports: ReportRow[]
  /** False without a real fix: a distance from the fallback centre is made up. */
  showDistance: boolean
  showOwnMark: boolean
  onOpen: (reportId: string, isOwn: boolean) => void
  language: string
}) {
  const theme = useTheme()
  const { t } = useTranslation()
  const areaName = useAreaName()
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]

  return (
    <View>
      {groupByDay(reports).map(({ group, rows }) => (
        <View key={group}>
          <Text
            style={[
              styles.dayLabel,
              { color: theme.colors.textMuted, fontFamily: appFont('bold', language) },
            ]}
          >
            {t(GROUP_KEYS[group])}
          </Text>
          <View style={[styles.group, { backgroundColor: theme.colors.surface.white }]}>
            {rows.map((report, index) => {
              const label = alertCategoryLabel(report.category, t('alerts.uncategorized'), language)
              // The area line is the **card's** rule, not a fourth copy of it.
              const area = formatAreaHierarchy(report.areaHierarchy, areaName)
              const subtitle = `${formatRelativeTimeForLocale(report.capturedAt, language)} · ${area}`

              let end = ''
              if (showOwnMark && report.isOwn) {
                end = t('history.ownReport')
              } else if (showDistance && report.distanceM !== null) {
                const parts = distanceLabelParts(report.distanceM, language)
                end = t(
                  parts.key === 'history.kmAway' ? 'history.distanceKm' : 'history.distanceM',
                  { distance: parts.distance },
                )
              }

              return (
                <Pressable
                  key={report.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}. ${subtitle}${end ? `. ${end}` : ''}`}
                  onPress={() => onOpen(report.id, report.isOwn)}
                  style={({ pressed }) => [
                    styles.row,
                    index < rows.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.colors.ink[200],
                    },
                    pressed && { backgroundColor: withAlpha(violet, 0.06) },
                  ]}
                >
                  <CategoryTile category={report.category} size={44} />
                  <View style={styles.rowText}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowTitle,
                        { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
                      ]}
                    >
                      {label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowSub,
                        { color: theme.colors.textMuted, fontFamily: appFont('medium', language) },
                      ]}
                    >
                      {subtitle}
                    </Text>
                  </View>
                  {end ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowEnd,
                        {
                          color: report.isOwn && showOwnMark ? violet : theme.colors.textMuted,
                          fontFamily: appFont('semibold', language),
                        },
                      ]}
                    >
                      {end}
                    </Text>
                  ) : null}
                  <SolidIcon name="chevronRight" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * The summary: the totals, then a count per incident type, in the fixed order.
 * Counts only — no chart, no bar, no percentage (FR-NG-3 / FR-NG-4 / ADR-010).
 */
function Summary({
  total,
  own,
  nearby,
  distribution,
  partialNote,
  language,
}: {
  total: number
  own: number
  nearby: number
  distribution: Array<{ category: ReportCategory | null; count: number }>
  partialNote: string | null
  language: string
}) {
  const theme = useTheme()
  const { t } = useTranslation()

  const countOf = (category: ReportCategory | null) =>
    distribution.find((entry) => entry.category === category)?.count ?? 0

  // The fixed order, and only the types that have a report. A report with no
  // type goes last.
  const typed = HISTORY_TYPE_ORDER.filter((category) => countOf(category) > 0)
  const untyped = countOf(null)

  const totals: Array<{ label: string; value: number }> = [
    { label: t('history.totalShort'), value: total },
    { label: t('history.ownShort'), value: own },
    { label: t('history.nearbyShort'), value: nearby },
  ]

  return (
    <View>
      <View style={[styles.counts, { backgroundColor: theme.colors.surface.white }]}>
        {totals.map((entry, index) => (
          <View
            key={entry.label}
            style={[
              styles.countCell,
              index > 0 && {
                borderLeftWidth: StyleSheet.hairlineWidth,
                borderLeftColor: theme.colors.ink[200],
              },
            ]}
          >
            <Text
              style={[
                styles.countValue,
                { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
              ]}
            >
              {localDigits(entry.value, language)}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.countLabel,
                { color: theme.colors.textMuted, fontFamily: appFont('semibold', language) },
              ]}
            >
              {entry.label}
            </Text>
          </View>
        ))}
      </View>

      {typed.length > 0 || untyped > 0 ? (
        <>
          <Text
            style={[
              styles.dayLabel,
              { color: theme.colors.textMuted, fontFamily: appFont('bold', language) },
            ]}
          >
            {t('history.byType')}
          </Text>
          <View style={[styles.group, { backgroundColor: theme.colors.surface.white }]}>
            {[...typed, ...(untyped > 0 ? [null] : [])].map((category, index, all) => (
              <View
                key={category ?? 'none'}
                style={[
                  styles.countRow,
                  index < all.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.ink[200],
                  },
                ]}
              >
                <CategoryTile category={category} size={40} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.countName,
                    { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
                  ]}
                >
                  {alertCategoryLabel(category, t('alerts.uncategorized'), language)}
                </Text>
                <Text
                  style={[
                    styles.countNumber,
                    { color: theme.colors.ink[950], fontFamily: appFont('bold', language) },
                  ]}
                >
                  {localDigits(countOf(category), language)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {partialNote ? (
        <Text
          style={[
            styles.foot,
            { color: theme.colors.textMuted, fontFamily: appFont('medium', language) },
          ]}
        >
          {partialNote}
        </Text>
      ) : null}
      <Text
        style={[
          styles.foot,
          { color: theme.colors.textMuted, fontFamily: appFont('medium', language) },
        ]}
      >
        {t('history.distributionNote')}
      </Text>
    </View>
  )
}

/** Rows that mirror the real row's geometry, so the layout does not jump (FR-HIST-4). */
function HistorySkeleton() {
  const theme = useTheme()

  return (
    <View
      testID="history-skeleton"
      style={[styles.group, styles.skeletonGroup, { backgroundColor: theme.colors.surface.white }]}
    >
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          style={[
            styles.skeletonRow,
            index < 3 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.colors.ink[200],
            },
          ]}
        >
          <View style={[styles.skeletonTile, { backgroundColor: theme.colors.ink[100] }]} />
          <View style={styles.skeletonLines}>
            <View style={[styles.skeletonLineShort, { backgroundColor: theme.colors.ink[100] }]} />
            <View style={[styles.skeletonLineLong, { backgroundColor: theme.colors.ink[100] }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

/** A count in the language's digits. */
function localDigits(value: number, language: string): string {
  return language === 'bn' ? toBengaliDigits(String(value)) : String(value)
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  filterCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 18,
    ...surfaceShadow,
  },
  filterTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: {
    flex: 1,
    minWidth: 0,
  },
  filterTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  filterSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  mapCard: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 18,
    gap: 12,
    ...surfaceShadow,
  },
  mapCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapCardTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCardText: {
    flex: 1,
    minWidth: 0,
  },
  mapCardTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  mapCardSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  mapCardButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCardButtonText: {
    fontSize: 14,
    lineHeight: 20,
  },
  mapPreview: {
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#EFE6F8',
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  dayLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  group: {
    borderRadius: 18,
    overflow: 'hidden',
    ...surfaceShadow,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 12,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  rowSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowEnd: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  more: {
    marginTop: 12,
    alignItems: 'center',
  },
  moreNote: {
    fontSize: 12,
    lineHeight: 17,
  },
  moreButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 14,
    lineHeight: 20,
  },
  counts: {
    flexDirection: 'row',
    borderRadius: 18,
    ...surfaceShadow,
  },
  countCell: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  countValue: {
    fontSize: 26,
    lineHeight: 32,
  },
  countLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  countRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  countName: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  countNumber: {
    fontSize: 16,
    lineHeight: 22,
  },
  foot: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  skeletonGroup: {
    paddingHorizontal: 0,
  },
  skeletonRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  skeletonTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  skeletonLines: {
    flex: 1,
    gap: 8,
  },
  skeletonLineShort: {
    width: '46%',
    height: 12,
    borderRadius: 6,
  },
  skeletonLineLong: {
    width: '72%',
    height: 10,
    borderRadius: 5,
  },
})

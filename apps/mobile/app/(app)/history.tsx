import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
} from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import {
  CountRow,
  EmptyState,
  HistoryFilterSheet,
  Icon,
  ListRow,
  ListRowGroup,
  LocationPill,
  MapViewLink,
  Screen,
  SegmentedTabs,
} from '@/shared/ui'
import { countByCategory, useHistory } from '@/shared/api/history'
import { resolveOrigin, useCurrentFix } from '@/shared/services/location'
import {
  DEFAULT_HISTORY_FILTERS,
  historyFiltersEqual,
  type HistoryFilters,
} from '@/shared/services/historyFilters'
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime'

/**
 * Screen 21 — History.
 *
 * `006-alerts / 006-history-list` — the local History view: the caller's own
 * reports plus the reports within 1 km of the current fix over the last 24
 * hours (FR-HIST-1).
 *
 * The three tabs
 * -------------
 * The prototype's segmented control is **ধরন** / **মোট** / **বিতরণ**, and all
 * three ship in Phase 1:
 *
 *   * **ধরন** — the report rows.
 *   * **মোট** — the totals for the current filter set.
 *   * **বিতরণ** — the per-category counts, **as a list of counts**. Never a
 *     chart, a bar, a percentage, or a trend (FR-NG-3 / FR-NG-4 / ADR-010).
 *
 * The prototype's own screen-22 copy states the product rule out loud: *"We
 * don't show crime statistics, heatmaps, or hotspot rankings — Nagar Shield is
 * for live reports, not aggregator data."*
 *
 * The prototype's **My Reports** tab does not exist
 * --------------------------------------------------
 * The prototype's screen 21 has no "my reports" tab — that tab was added by
 * unit `004-capture / 003-report-detail-and-category-edit`, whose AC #1 asks
 * for the author's own report to be reachable from History, and whose AC #8
 * asks for it to appear immediately with no moderation gate.
 *
 * The two tabs therefore coexist rather than compete: **ধরন** is the prototype's
 * list, and **My Reports** is the author's own branch. A row in **My Reports**
 * opens the author's own detail (where the category is editable); a row in
 * **ধরন** opens the **public** alert detail (unit `006`), because the
 * neighbouring reports are the public projection and carry no author field at
 * all.
 *
 * The filter sheet
 * ----------------
 * The location pill's trailing `keyboard_arrow_down` opens the filter sheet
 * (`007-history-filters`). The filter state is part of the **query key**, so
 * the list, the totals, the distribution and the map all move together and no
 * surface can serve a page from a stale filter.
 *
 * The body copy
 * -------------
 * The prototype's second sentence — *"Detailed map + filters coming soon."* —
 * is **removed**. Both the map and the filters ship in Phase 1, so "coming
 * soon" would be a false claim in the shipped UI.
 */
export default function HistoryScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  const [tab, setTab] = useState<'list' | 'totals' | 'distribution' | 'mine'>('list')
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_HISTORY_FILTERS)
  const [sheetOpen, setSheetOpen] = useState(false)

  // The fix is requested just-in-time — when the History screen opens — and
  // never on the panic path (FR-PERMS-2). A denied permission degrades to the
  // Dhaka fallback origin rather than blocking the list.
  const { state } = useCurrentFix()
  const { origin, isFallback } = resolveOrigin(state)

  const { data, isLoading, isRefetching, refetch } = useHistory({
    lat: origin.lat,
    lng: origin.lng,
    radiusKm: filters.radiusKm,
    windowHours: filters.windowHours,
    category: filters.category,
    limit: 50,
  })

  const items = useMemo(() => data?.items ?? [], [data])

  // The author's own branch. It is independent of the radius and the window —
  // the RPC's own-reports branch is what makes FR-HIST-3 true.
  const ownReports = useMemo(() => items.filter((report) => report.isOwn), [items])

  // The neighbouring reports — the public projection.
  const nearbyReports = useMemo(() => items.filter((report) => !report.isOwn), [items])

  const distribution = useMemo(() => countByCategory(items), [items])

  const tabs = useMemo(
    () => [
      { id: 'list', label: t('history.listTab') },
      { id: 'totals', label: t('history.totalsTab') },
      { id: 'distribution', label: t('history.distributionTab') },
      { id: 'mine', label: t('alerts.historyMyReports') },
    ],
    [t],
  )

  const pillLabel = isFallback
    ? t('history.locationUnavailable')
    : filters.category
      ? `${filters.category} · ${origin.lat.toFixed(3)}, ${origin.lng.toFixed(3)}`
      : `${origin.lat.toFixed(3)}, ${origin.lng.toFixed(3)}`

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

  return (
    <Screen
      title={t('history.title')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <LocationPill
        label={pillLabel}
        accessibilityLabel={t('history.filtersTitle')}
        onPress={() => setSheetOpen(true)}
      />

      <SegmentedTabs tabs={tabs} activeId={tab} onSelect={(id) => setTab(id as typeof tab)} />

      {tab === 'list' ? (
        <HistoryList
          reports={nearbyReports}
          isLoading={isLoading}
          isRefetching={isRefetching}
          onRefresh={() => void refetch()}
          onOpen={openRow}
          language={i18n.language}
        />
      ) : null}

      {tab === 'mine' ? (
        <HistoryList
          reports={ownReports}
          isLoading={isLoading}
          isRefetching={isRefetching}
          onRefresh={() => void refetch()}
          onOpen={openRow}
          language={i18n.language}
          emptyTitle={t('alerts.noOwnReports')}
          emptyDescription={t('alerts.noOwnReportsSub')}
        />
      ) : null}

      {tab === 'totals' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <ListRowGroup header={t('history.totalReports')}>
            <CountRow label={t('history.totalReports')} count={data?.totalCount ?? 0} />
            <CountRow label={t('history.ownReports')} count={ownReports.length} />
            <CountRow label={t('history.nearbyReports')} count={nearbyReports.length} />
          </ListRowGroup>
          <Text style={[styles.note, { color: theme.colors.ink[500] }]}>
            {t('history.distributionNote')}
          </Text>
        </ScrollView>
      ) : null}

      {tab === 'distribution' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {distribution.length === 0 ? (
            <View style={styles.placeholder}>
              <EmptyState
                icon="monitoring"
                title={t('history.noResults')}
                description={t('history.noResultsSub')}
              />
            </View>
          ) : (
            <ListRowGroup header={t('history.distributionTab')}>
              {distribution.map((entry) => (
                <CountRow
                  key={entry.category ?? 'none'}
                  label={
                    entry.category
                      ? `${REPORT_CATEGORY_LABELS[entry.category].bn} — ${REPORT_CATEGORY_LABELS[entry.category].en}`
                      : t('alerts.uncategorized')
                  }
                  count={entry.count}
                />
              ))}
            </ListRowGroup>
          )}
          <Text style={[styles.note, { color: theme.colors.ink[500] }]}>
            {t('history.distributionNote')}
          </Text>
        </ScrollView>
      ) : null}

      <MapViewLink
        label={t('alerts.mapView')}
        onPress={() =>
          router.push({
            pathname: '/(app)/history-map',
            params: {
              lat: String(origin.lat),
              lng: String(origin.lng),
              radiusKm: String(filters.radiusKm),
              windowHours: String(filters.windowHours),
              category: filters.category ?? '',
            },
          })
        }
      />

      <Text style={[styles.bodyCopy, { color: theme.colors.ink[500] }]}>
        {t('history.scopeNote')}
      </Text>

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
 * The report rows.
 *
 * A row's subtitle is the relative time and the area, and a nearby report also
 * carries its distance from the origin. The skeleton is a real skeleton row —
 * it mirrors the row's geometry so the layout does not jump when the data
 * lands (FR-HIST-4).
 */
function HistoryList({
  reports,
  isLoading,
  isRefetching,
  onRefresh,
  onOpen,
  language,
  emptyTitle,
  emptyDescription,
}: {
  reports: Array<{
    id: string
    category: keyof typeof REPORT_CATEGORY_LABELS | null
    capturedAt: string
    areaHierarchy: { division: string; city: string; thana: string; neighborhood?: string } | null
    distanceM: number | null
    isOwn: boolean
  }>
  isLoading: boolean
  isRefetching: boolean
  onRefresh: () => void
  onOpen: (reportId: string, isOwn: boolean) => void
  language: string
  emptyTitle?: string
  emptyDescription?: string
}) {
  const theme = useTheme()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <View style={styles.skeletonGroup} testID="history-skeleton">
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.skeleton,
              { backgroundColor: theme.colors.ink[100], borderColor: theme.colors.ink[100] },
            ]}
          />
        ))}
      </View>
    )
  }

  if (reports.length === 0) {
    return (
      <View style={styles.placeholder}>
        <EmptyState
          icon="history"
          title={emptyTitle ?? t('history.noResults')}
          description={emptyDescription ?? t('history.noResultsSub')}
        />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={theme.palette.violet[600]}
        />
      }
    >
      <View style={styles.list}>
        {reports.map((report) => {
          const label = report.category ? REPORT_CATEGORY_LABELS[report.category] : null
          const accent = report.category
            ? REPORT_CATEGORY_ACCENTS[report.category]
            : theme.colors.ink[400]

          const area =
            report.areaHierarchy?.neighborhood ??
            report.areaHierarchy?.thana ??
            report.areaHierarchy?.city ??
            report.areaHierarchy?.division ??
            ''

          const distance =
            report.distanceM !== null
              ? ` · ${t('history.distanceAway', { distance: Math.round(report.distanceM) })}`
              : ''

          return (
            <ListRow
              key={report.id}
              title={label ? `${label.bn} — ${label.en}` : t('alerts.uncategorized')}
              subtitle={`${formatRelativeTimeForLocale(report.capturedAt, language)} · ${area}${distance}`}
              icon={report.category ? REPORT_CATEGORY_ICONS[report.category] : 'help'}
              tone="gray"
              showArrow
              onPress={() => onOpen(report.id, report.isOwn)}
              trailing={
                <View style={[styles.dot, { backgroundColor: `${accent}1A` }]}>
                  <Icon
                    name={report.category ? REPORT_CATEGORY_ICONS[report.category] : 'help'}
                    size={16}
                    color={accent}
                    filled
                  />
                </View>
              }
            />
          )
        })}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  list: {
    paddingHorizontal: 20,
  },
  placeholder: {
    paddingHorizontal: 20,
  },
  skeletonGroup: {
    paddingHorizontal: 20,
    gap: 10,
  },
  skeleton: {
    height: 68,
    borderRadius: 14,
    borderWidth: 1,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  bodyCopy: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

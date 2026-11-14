import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import {
  AlertCard,
  AreaChipRow,
  EmptyState,
  FlagSheet,
  OfflineNotice,
  PulseDot,
  Screen,
} from '@/shared/ui'
import { alertsItems, alertsShowingCachedPage, useAlerts } from '@/shared/api/alerts'
import { DEFAULT_AREA_CHIP_ID, resolveAreaFilter, useAreaChips } from '@/shared/api/areaChips'
import { useRefreshGuard } from '@/shared/services/refreshGuard'
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime'

/**
 * The Alerts feed.
 *
 * A 1:1 port of the prototype's `data-screen="14"` feed block:
 *   - the feed header with the 6 dp pulsing dot and the "auto-refreshes every
 *     60 s" label (the quiet indicator when the refresh is paused)
 *   - the area chip row — **exactly one row**; the prototype source duplicates
 *     the same five-chip markup and a duplicated row is a visible port defect
 *   - the alert cards
 *
 * The refresh pauses when the battery is under 20 %, when the app is
 * backgrounded and when the device is offline (FR-ALERTS-2). The guard is a
 * hook, so a backgrounded app performs **no** feed requests.
 */
export default function AlertsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  const [chipId, setChipId] = useState(DEFAULT_AREA_CHIP_ID)
  const [flagTarget, setFlagTarget] = useState<string | null>(null)

  const guard = useRefreshGuard()

  // The chip row is **data-driven** — the reference areas come from the
  // `area_lookup` table, not from a hardcoded array in this file.
  const chips = useAreaChips(
    t('alerts.areaChipAll'),
    t('alerts.areaChipDivision'),
    t('alerts.areaChipCity'),
  )

  // The selection is a **chip id**, and the filter is resolved from it by the
  // one shared mapping function — so the chip row and the feed cannot
  // disagree about what a selection means.
  const chip = chips.find((entry) => entry.id === chipId) ?? chips[0]

  // The polling interval is the shared 60 s, and it only runs while the guard
  // says the refresh may run.
  const {
    data,
    isError,
    isLoading,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAlerts(resolveAreaFilter(chip ?? { value: null }), {
    enabled: !guard.isPaused,
  })

  // The feed is cursor-paginated, so the rows are **every loaded page**
  // flattened — not the first page alone.
  const items = alertsItems(data)

  // The offline case: the last request failed **and** there is a cached page
  // to show. The feed never blanks — it shows the last results and says so.
  const showingCachedPage = alertsShowingCachedPage({ isError: isError, data })

  const headerLabel = pausedLabel(guard.pausedReason, t)

  return (
    <Screen
      title={t('alerts.title')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={theme.palette.violet[600]}
          />
        }
      >
        {/* Feed header */}
        <View style={styles.refreshRow}>
          <PulseDot paused={guard.isPaused} />
          <Text style={[styles.refreshText, { color: theme.colors.ink[500] }]}>{headerLabel}</Text>
        </View>

        {/* The area chip row — exactly one. */}
        <AreaChipRow chips={chips} activeId={chipId} onSelect={(entry) => setChipId(entry.id)} />

        {/* The offline case. The list below is the cached page — the feed
            never blanks. */}
        {showingCachedPage ? <OfflineNotice /> : null}

        {isLoading ? (
          <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>
            {t('common.loading')}
          </Text>
        ) : items.length > 0 ? (
          <>
            {items.map((report) => (
              <AlertCard
                key={report.id}
                report={report}
                relativeTime={formatRelativeTimeForLocale(report.capturedAt, i18n.language)}
                onPress={() =>
                  router.push({ pathname: '/(app)/alert-detail', params: { id: report.id } })
                }
                onFlag={() => setFlagTarget(report.id)}
              />
            ))}

            {/* The feed is paginated — the next page is reachable, not
                truncated away. */}
            {hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('alerts.loadMore')}
                disabled={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
                style={[styles.loadMore, { borderColor: theme.colors.ink[200] }]}
              >
                <Text style={[styles.loadMoreText, { color: theme.palette.violet[600] }]}>
                  {isFetchingNextPage ? t('common.loading') : t('alerts.loadMore')}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="notifications_off"
            title={t('home.noAlerts')}
            description={t('home.noAlertsSub')}
          />
        )}
      </ScrollView>

      <FlagSheet
        visible={flagTarget !== null}
        reportId={flagTarget ?? ''}
        onClose={() => setFlagTarget(null)}
      />
    </Screen>
  )
}

/** The feed-header label. The paused state swaps the copy, not the layout. */
function pausedLabel(
  reason: ReturnType<typeof useRefreshGuard>['pausedReason'],
  t: (key: string) => string,
): string {
  switch (reason) {
    case 'battery':
      return t('alerts.pausedBattery')
    case 'offline':
      return t('alerts.pausedOffline')
    case 'background':
      return t('alerts.pausedBackground')
    default:
      return t('alerts.autoRefresh')
  }
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loading: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
  loadMore: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
})

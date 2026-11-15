import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import {
  AlertCard,
  AlertFeedSkeleton,
  AreaChipRow,
  EmptyState,
  FlagSheet,
  OfflineNotice,
  PulseDot,
  Screen,
} from '@/shared/ui'
import { alertsItems, alertsShowingCachedPage, useAlertsFeed } from '@/shared/api/alerts'
import { useRefreshOnFocus } from '@/shared/api/useRefreshOnFocus'
import { alertsLoadFailed } from '@/shared/api/alertsLoadState'
import { DEFAULT_AREA_CHIP_ID, resolveAreaFilter, useAreaChips } from '@/shared/api/areaChips'
import { useReducedMotion } from '@/shared/services/reduceMotion'
import type { RefreshPauseReason } from '@/shared/services/refreshGuard'
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
 * backgrounded and when the device is offline (FR-ALERTS-2). The guard lives
 * **inside** the feed hook, so a backgrounded app performs **no** feed
 * requests — and the screen cannot forget to ask for it, because the screen
 * never has to.
 */
export default function AlertsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()

  const [chipId, setChipId] = useState(DEFAULT_AREA_CHIP_ID)
  const [flagTarget, setFlagTarget] = useState<string | null>(null)

  // The operating system's reduce-motion setting. The dot freezes when it is
  // on, and the label is untouched — the setting asks for less movement, not
  // for less information.
  const reduceMotion = useReducedMotion()

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

  // The polling interval is the shared 60 s, and the hook's own guard stops
  // it. The screen reads the guard **from the hook**, so the reason the
  // header shows is the reason the poll actually stopped.
  const {
    data,
    dataUpdatedAt,
    error,
    isError,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    guard,
  } = useAlertsFeed(resolveAreaFilter(chip ?? { value: null }))
  useRefreshOnFocus(refetch, dataUpdatedAt)

  // The feed is cursor-paginated, so the rows are **every loaded page**
  // flattened — not the first page alone.
  const items = alertsItems(data)

  // The offline case: the last request failed **and** there is a cached page
  // to show. The feed never blanks — it shows the last results and says so.
  // A **paused** refresh is not a failure, so it is not an offline notice.
  const showingCachedPage = alertsShowingCachedPage({ isError: isError, data, error })

  // The load failed and there is no cached page: a failure, not an empty feed.
  const loadFailed = alertsLoadFailed({ isError, data, error })

  // The pull-to-refresh spinner is for a pull the user made. `isRefetching`
  // is also true for the 60 s poll and `isFetchingNextPage` is a different
  // state, so the spinner is local to the gesture.
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  const headerLabel = pausedLabel(guard.pausedReason, t)

  return (
    <Screen
      title={t('alerts.title')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <FlatList
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
        data={items}
        keyExtractor={(report) => report.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.palette.violet[600]}
          />
        }
        // The next page loads as the end nears; the Load more control below
        // stays as the explicit, accessible path.
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }}
        ListHeaderComponent={
          <>
            {/* Feed header */}
            <View style={styles.refreshRow}>
              <PulseDot paused={guard.isPaused} reduceMotion={reduceMotion} />
              <Text style={[styles.refreshText, { color: theme.colors.ink[500] }]}>
                {headerLabel}
              </Text>
            </View>

            {/* The area chip row — exactly one. */}
            <AreaChipRow
              chips={chips}
              activeId={chipId}
              onSelect={(entry) => setChipId(entry.id)}
            />

            {/* The offline case. The list below is the cached page — the feed
                never blanks. */}
            {showingCachedPage ? <OfflineNotice /> : null}
          </>
        }
        renderItem={({ item: report }) => (
          <AlertCard
            report={report}
            relativeTime={formatRelativeTimeForLocale(report.capturedAt, i18n.language)}
            onPress={() =>
              router.push({ pathname: '/(app)/alert-detail', params: { id: report.id } })
            }
            onFlag={() => setFlagTarget(report.id)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <AlertFeedSkeleton />
          ) : loadFailed ? (
            // A failed load is not an empty feed — say so and offer a retry.
            <View accessibilityRole="alert" accessibilityLiveRegion="polite">
              <EmptyState
                icon="cloud_off"
                title={t('alerts.loadFailed')}
                description={t('alerts.loadFailedSub')}
                action={{ label: t('common.retry'), onPress: () => void refetch() }}
              />
            </View>
          ) : (
            <EmptyState
              icon="notifications_off"
              title={t('home.noAlerts')}
              description={t('home.noAlertsSub')}
            />
          )
        }
        ListFooterComponent={
          // The feed is paginated — the next page is reachable, not
          // truncated away.
          hasNextPage && items.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('alerts.loadMore')}
              accessibilityState={{ disabled: isFetchingNextPage, busy: isFetchingNextPage }}
              disabled={isFetchingNextPage}
              onPress={() => void fetchNextPage()}
              style={[styles.loadMore, { borderColor: theme.colors.ink[200] }]}
            >
              <Text style={[styles.loadMoreText, { color: theme.palette.violet[600] }]}>
                {isFetchingNextPage ? t('common.loading') : t('alerts.loadMore')}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <FlagSheet
        visible={flagTarget !== null}
        reportId={flagTarget ?? ''}
        onClose={() => setFlagTarget(null)}
      />
    </Screen>
  )
}

/**
 * The feed-header label. The paused state swaps the copy, not the layout.
 *
 * The label is driven by the **paused reason** alone. Reduced motion never
 * appears here: the setting asks for less movement, not for less
 * information, so the label says exactly what it always said.
 */
function pausedLabel(reason: RefreshPauseReason, t: (key: string) => string): string {
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
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
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

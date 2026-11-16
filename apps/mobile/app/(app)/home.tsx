import { useCallback, useState } from 'react'
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from '@/shared/navigation/useSafeRouter'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/theme'
import {
  AlertCard,
  AlertFeedSkeleton,
  AreaChipRow,
  EmptyState,
  HelpBanner,
  HomeHeader,
  OfflineNotice,
  PulseDot,
  QuickActionRow,
} from '@/shared/ui'
import { alertsLoadFailed } from '@/shared/api/alertsLoadState'
import { alertsItems, alertsShowingCachedPage, useAlertsFeed } from '@/shared/api/alerts'
import { useRefreshOnFocus } from '@/shared/api/useRefreshOnFocus'
import { DEFAULT_AREA_CHIP_ID, resolveAreaFilter, useAreaChips } from '@/shared/api/areaChips'
import { useReducedMotion } from '@/shared/services/reduceMotion'
import type { RefreshPauseReason } from '@/shared/services/refreshGuard'
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime'
import { useHomeArea } from '@/shared/services/homeArea'
import { appFont } from '@/shared/theme/appFont'
import { Screen } from '@/shared/ui/Screen'

/** How many cards Home shows before "See all". */
const HOME_FEED_CARD_LIMIT = 5

/**
 * Screen 14 — Home (Dashboard).
 *
 * A 1:1 port of the prototype's home screen:
 *   - greeting block with the sun icon and the date
 *   - the `more_horiz` action button
 *   - the settings button
 *   - the five quick-action cards
 *   - the auto-refresh indicator
 *   - the area chip row
 *   - the Alerts feed cards
 *
 * Unit `003-help-seek` owns the layout composition and the Help Alert block;
 * units 004 / 005 / 006 drop into the reserved slots below.
 */
export default function HomeScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const insets = useSafeAreaInsets()

  // The chip row is **data-driven** — the reference areas come from the
  // `area_lookup` table, not from a hardcoded array in this file.
  const chips = useAreaChips(
    t('alerts.areaChipAll'),
    t('alerts.areaChipDivision'),
    t('alerts.areaChipCity'),
  )

  const [chipId, setChipId] = useState(DEFAULT_AREA_CHIP_ID)

  // The operating system's reduce-motion setting — the dot freezes, and the
  // label is untouched.
  const reduceMotion = useReducedMotion()

  // The place the header names. It reads the fix the user already allowed and
  // never asks for the permission itself.
  const area = useHomeArea()
  const areaText =
    area.status === 'ready'
      ? area.label
      : area.status === 'off'
        ? t('home.areaOff')
        : area.status === 'unavailable'
          ? t('home.areaUnavailable')
          : area.status === 'unknown'
            ? t('home.areaUnknown')
            : t('home.areaLocating')
  // Turning location on and retrying are the two things the user can do about
  // the line, so those two states are buttons; the others are just text.
  const onAreaPress =
    area.status === 'off'
      ? () => void Linking.openSettings()
      : area.status === 'unavailable'
        ? area.retry
        : undefined

  // The selection is a **chip id**, and the filter is resolved from it by the
  // one shared mapping function — so the chip row and the feed cannot
  // disagree about what a selection means.
  const chip = chips.find((entry) => entry.id === chipId) ?? chips[0]

  // The guard lives **inside** the hook, so Home cannot poll in the
  // background — the screen never has to remember to ask.
  const { data, dataUpdatedAt, error, isError, isLoading, refetch, guard } = useAlertsFeed(
    resolveAreaFilter(chip ?? { value: null }),
  )
  useRefreshOnFocus(refetch, dataUpdatedAt)

  // Home is a glance, not the feed: it shows the newest few and "See all"
  // opens the Alerts screen. It never pages, so it also never fetches media
  // for cards nobody scrolled to.
  const items = alertsItems(data).slice(0, HOME_FEED_CARD_LIMIT)

  // The pull-to-refresh spinner is for a pull the user made. `isRefetching`
  // is also true for the 60 s poll, which made the spinner flash every minute.
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  // The header's reload button: names the place again and refreshes the
  // alerts. It has its own flag so the pull-to-refresh spinner does not show
  // for a tap on a button.
  const [reloading, setReloading] = useState(false)
  const retryArea = area.retry
  const onReload = useCallback(async () => {
    setReloading(true)
    retryArea()
    try {
      await refetch()
    } finally {
      setReloading(false)
    }
  }, [refetch, retryArea])

  // The offline case — the last request failed and a cached page survives.
  // The feed block shows the last results and says so; it never blanks. A
  // **paused** refresh is not a failure, so it is not an offline notice.
  const showingCachedPage = alertsShowingCachedPage({ isError, data, error })

  // The load failed and there is no cached page: a failure, not an empty feed.
  const loadFailed = alertsLoadFailed({ isError, data, error })

  return (
    // The screen itself does not scroll: the greeting, the help banner, the quick
    // actions and the area filters stay put, and only the reports list below
    // them scrolls.
    <Screen scroll={false} background={theme.colors.surface.lavender}>
      {/* Header: today's date over the place the user is in. */}
      <HomeHeader
        date={new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        area={areaText}
        areaTone={area.status === 'ready' ? 'ready' : 'muted'}
        onAreaPress={onAreaPress}
        settingsLabel={t('more.settings')}
        onSettings={() => router.push('/(app)/settings')}
        onRefresh={() => void onReload()}
        refreshing={reloading}
        refreshLabel={t('home.reload')}
        language={lang}
      />

      <HelpBanner
        title={t('home.helpTitle')}
        subtitle={t('home.helpSubtitle')}
        onPress={() => router.push('/(app)/help-alert')}
      />

      <QuickActionRow
        actions={[
          {
            key: 'capture',
            icon: 'camera',
            color: 'violet',
            solid: true,
            label: t('home.quickReport'),
            onPress: () => router.push('/(app)/capture'),
          },
          {
            key: 'location',
            icon: 'pin',
            color: 'green',
            label: t('home.quickLocation'),
            onPress: () => router.push('/(app)/location-sharing'),
          },
          {
            key: 'history',
            icon: 'history',
            color: 'amber',
            label: t('home.quickHistory'),
            onPress: () => router.push('/(app)/history'),
          },
          {
            key: 'contacts',
            icon: 'call',
            color: 'sky',
            label: t('home.quickContacts'),
            onPress: () => router.push('/(app)/contacts'),
          },
          {
            key: 'stations',
            icon: 'map',
            color: 'pink',
            label: t('home.quickStations'),
            onPress: () => router.push('/(app)/station-map'),
          },
        ]}
      />

      {/* The reports header: what the list is, and whether it is live. The area
          filters stay above the list because they decide what it shows. */}
      <View style={styles.refreshRow}>
        <View style={styles.titleGroup}>
          <Text
            numberOfLines={1}
            style={[
              styles.sectionTitle,
              { color: theme.colors.ink[950], fontFamily: appFont('bold', lang) },
            ]}
          >
            {t('home.alertsTitle')}
          </Text>
          {/* In the header, so it is reachable without scrolling to the end
              of a list that never ends. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('home.alertsSeeAll')}
            onPress={() => router.push('/(app)/alerts')}
            hitSlop={8}
            style={styles.seeAll}
          >
            <Text style={[styles.seeAllText, { color: theme.palette.violet[600] }]}>
              {t('home.alertsSeeAll')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.liveStatus}>
          <PulseDot paused={guard.isPaused} reduceMotion={reduceMotion} />
          <Text
            numberOfLines={1}
            style={[
              styles.refreshText,
              { color: theme.colors.ink[500], fontFamily: appFont('semibold', lang) },
            ]}
          >
            {pausedLabel(guard.pausedReason, t)}
          </Text>
        </View>
      </View>

      <AreaChipRow chips={chips} activeId={chipId} onSelect={(entry) => setChipId(entry.id)} />

      {/* The reports list — the only part of the screen that scrolls. */}
      <FlatList
        style={styles.feed}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        data={items}
        keyExtractor={(report) => report.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.palette.violet[600]}
          />
        }
        // The offline case. The rows below are the cached page — the feed
        // block never blanks.
        ListHeaderComponent={showingCachedPage ? <OfflineNotice /> : undefined}
        renderItem={({ item: report }) => (
          <AlertCard
            report={report}
            relativeTime={formatRelativeTimeForLocale(report.capturedAt, i18n.language)}
            onPress={() =>
              router.push({ pathname: '/(app)/alert-detail', params: { id: report.id } })
            }
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
      />
    </Screen>
  )
}

/**
 * The feed-header label. The paused state swaps the copy, not the layout.
 *
 * This is the **same** function the Alerts screen uses — the two surfaces
 * show the same feed, so they must say the same thing about it. The label is
 * driven by the paused reason alone; reduced motion never reaches here.
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
  // The same rounded square as every icon well on the screen, one size up.
  feed: {
    flex: 1,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  sectionTitle: {
    flexShrink: 0,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  liveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  refreshText: {
    flexShrink: 1,
    fontSize: 11,
  },
  seeAll: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
})

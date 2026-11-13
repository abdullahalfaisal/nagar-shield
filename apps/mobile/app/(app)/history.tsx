import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  REPORT_CATEGORY_ACCENTS,
  REPORT_CATEGORY_ICONS,
  REPORT_CATEGORY_LABELS,
} from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { EmptyState, Icon, ListRow, Screen, SectionTitle, SegmentedTabs } from '@/shared/ui';
import { useHistory } from '@/shared/api/history';
import { resolveOrigin, useCurrentFix } from '@/shared/services/location';
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime';

/**
 * Screen 21 — History.
 *
 * The **My Reports** tab is this story's entry point:
 *
 *   `004-capture / 003-report-detail-and-category-edit` AC #1 — "the author
 *   opens one of their own reports from History"; and AC #8 — "the report is
 *   present in the author's own History immediately, with
 *   `moderation_status = 'visible'` and no pending-review gate".
 *
 * So the tab lists the caller's **own** reports, and tapping one opens the
 * Report detail screen, where the category is the only editable field.
 *
 * Why the list is scoped to the caller's own reports
 * -------------------------------------------------
 * `history_nearby` returns the reports near the origin — the caller's own
 * reports *and* the surrounding area's. The neighbouring reports are the
 * **public** projection, and they open the public alert-detail screen (unit
 * `006-alerts`), not the author's own detail. This tab shows only the rows
 * the caller's own detail screen can open.
 *
 * The read model
 * --------------
 * `history_nearby` is the only History read path. It applies the radius and
 * window filters server-side and always includes the caller's **own**
 * reports, so a report the user just submitted appears immediately
 * regardless of the filters (FR-HIST-3) — the guarantee AC #8 asks for.
 *
 * The proximity tab is unit `006-alerts`' surface (bolt 020–021) and renders
 * **counts per category only** — no chart, no percentage, no trend, no
 * heatmap (FR-NG-3 / FR-NG-4 / ADR-010). It is left as a placeholder here.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [tab, setTab] = useState('mine');

  // The fix is requested just-in-time — when the History screen opens — and
  // never on the panic path (FR-PERMS-2). A denied permission degrades to the
  // Dhaka fallback origin rather than blocking the list.
  const { state } = useCurrentFix();
  const { origin } = resolveOrigin(state);

  const { data, isLoading, isRefetching, refetch } = useHistory(
    {
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      windowHours: 24 * 30,
      limit: 50,
    },
    { enabled: tab === 'mine' },
  );

  // Only the caller's own reports. The surrounding reports are the public
  // projection and open the public alert-detail screen.
  const ownReports = useMemo(
    () => (data?.items ?? []).filter((report) => report.isOwn),
    [data],
  );

  const tabs = useMemo(
    () => [
      { id: 'mine', label: t('alerts.historyMyReports') },
      { id: 'nearby', label: t('alerts.historyNearby') },
    ],
    [t],
  );

  return (
    <Screen
      title={t('alerts.historyTitle')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <SegmentedTabs tabs={tabs} activeId={tab} onSelect={setTab} />

      {tab === 'nearby' ? (
        <View style={styles.placeholder}>
          <EmptyState
            icon="monitoring"
            title={t('alerts.noHistory')}
            description={t('alerts.noHistorySub')}
          />
        </View>
      ) : isLoading ? (
        <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>{t('common.loading')}</Text>
      ) : ownReports.length === 0 ? (
        <View style={styles.placeholder}>
          <EmptyState
            icon="history"
            title={t('alerts.noOwnReports')}
            description={t('alerts.noOwnReportsSub')}
          />
        </View>
      ) : (
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
          <View style={styles.list}>
            <SectionTitle title={t('alerts.historyMyReports')} />
            {ownReports.map((report) => {
              const label = report.category ? REPORT_CATEGORY_LABELS[report.category] : null;
              const accent = report.category
                ? REPORT_CATEGORY_ACCENTS[report.category]
                : theme.colors.ink[400];

              return (
                <ListRow
                  key={report.id}
                  title={
                    label
                      ? `${label.bn} — ${label.en}`
                      : t('alerts.uncategorised')
                  }
                  subtitle={`${formatRelativeTimeForLocale(report.capturedAt, i18n.language)} · ${
                    report.areaHierarchy?.neighborhood ??
                    report.areaHierarchy?.thana ??
                    report.areaHierarchy?.city ??
                    report.areaHierarchy?.division ??
                    ''
                  }`}
                  icon={report.category ? REPORT_CATEGORY_ICONS[report.category] : 'help'}
                  tone="gray"
                  showArrow
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/report-detail',
                      params: { reportId: report.id },
                    })
                  }
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
              );
            })}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    paddingHorizontal: 20,
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 20,
  },
  loading: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

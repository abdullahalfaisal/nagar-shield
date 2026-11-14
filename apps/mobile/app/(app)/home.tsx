import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/theme';
import { ActionCard, AlertCard, AreaChipRow, EmptyState, QuickActionGrid, SectionTitle } from '@/shared/ui';
import type { AreaChip } from '@/shared/ui/AreaChipRow';
import { alertsItems, useAlerts } from '@/shared/api/alerts';
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime';
import { Icon } from '@/shared/ui/Icon';
import { Screen } from '@/shared/ui/Screen';

/**
 * Screen 14 — Home (Dashboard).
 *
 * A 1:1 port of the prototype's home screen:
 *   - greeting block with the sun icon and the date
 *   - the `more_horiz` action button with the badge dot
 *   - the avatar
 *   - the search bar
 *   - the six quick-action cards
 *   - the auto-refresh indicator
 *   - the area chip row
 *   - the Alerts feed cards
 *
 * Unit `003-help-seek` owns the layout composition and the Help Alert block;
 * units 004 / 005 / 006 drop into the reserved slots below.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [chip, setChip] = useState<AreaChip>({ id: 'all', label: 'All BD', value: null });

  const { data, isLoading } = useAlerts(chip.value ?? {});

  // The feed is cursor-paginated, so the rows are **every loaded page**
  // flattened — not the first page alone.
  const items = alertsItems(data);

  const chips: AreaChip[] = [
    { id: 'all', label: 'All BD', value: null },
    { id: 'division', label: 'My division', value: { division: 'Dhaka' } },
    { id: 'city', label: 'My city', value: { division: 'Dhaka', city: 'Dhaka' } },
    { id: 'mirpur', label: 'Mirpur', value: { division: 'Dhaka', city: 'Dhaka', thana: 'Mirpur' } },
    { id: 'dhanmondi', label: 'Dhanmondi', value: { division: 'Dhaka', city: 'Dhaka', thana: 'Dhanmondi' } },
  ];

  return (
    <Screen
      scroll
      background={theme.colors.surface.lavender}
      contentBottomPadding={60}
    >
      {/* Greeting block — the prototype's custom home app bar. */}
      <View style={styles.greetingBar}>
        <View style={styles.greetingText}>
          <View style={styles.hiRow}>
            <Text style={[styles.hi, { color: theme.colors.ink[950] }]}>
              {t('home.greeting')}
            </Text>
            <Icon name="wb_sunny" size={20} color={theme.palette.amber[600]} filled />
          </View>
          <Text style={[styles.date, { color: theme.colors.ink[500] }]}>
            {new Date().toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
        </View>

        <PressableMore onPress={() => router.push('/(app)/more')} />
        <View style={[styles.avatar, { backgroundColor: theme.palette.violet[600] }]}>
          <Text style={styles.avatarText}>না</Text>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: theme.colors.surface.white }]}>
        <Icon name="search" size={20} color={theme.colors.ink[400]} />
        <Text style={[styles.searchPlaceholder, { color: theme.colors.ink[400] }]}>
          এলাকা খুঁজুন...
        </Text>
      </View>

      {/* Quick actions */}
      <SectionTitle title={t('home.helpSubtitle')} />
      <QuickActionGrid>
        <ActionCard
          icon="photo_camera"
          label={t('home.capture')}
          sub={t('home.captureSub')}
          tone="purple"
          onPress={() => router.push('/(app)/capture')}
        />
        <ActionCard
          icon="notifications_active"
          label={t('help.police')}
          sub={t('home.helpSubtitle')}
          tone="red"
          onPress={() => router.push('/(app)/help-alert')}
        />
        <ActionCard
          icon="my_location"
          label={t('home.location')}
          sub={t('home.locationSub')}
          tone="green"
          onPress={() => router.push('/(app)/location-sharing')}
        />
        <ActionCard
          icon="monitoring"
          label={t('home.history')}
          sub={t('home.historySub')}
          tone="purple"
          onPress={() => router.push('/(app)/history')}
        />
        <ActionCard
          icon="contact_emergency"
          label={t('more.emergencyContacts')}
          sub={t('home.moreSub')}
          tone="amber"
          onPress={() => router.push('/(app)/contacts')}
        />
        <ActionCard
          icon="grid_view"
          label={t('home.more')}
          sub={t('home.moreSub')}
          tone="purple"
          onPress={() => router.push('/(app)/more')}
        />
      </QuickActionGrid>

      {/* Alerts feed */}
      <View style={styles.refreshRow}>
        <View style={[styles.refreshDot, { backgroundColor: theme.palette.red[500] }]} />
        <Text style={[styles.refreshText, { color: theme.colors.ink[500] }]}>
          Auto-refreshes every 60s
        </Text>
      </View>

      <AreaChipRow chips={chips} activeId={chip.id} onSelect={setChip} />

      {isLoading ? (
        <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>{t('common.loading')}</Text>
      ) : items.length > 0 ? (
        items.map((report) => (
          <AlertCard
            key={report.id}
            report={report}
            relativeTime={formatRelativeTimeForLocale(report.capturedAt, i18n.language)}
            onPress={() =>
              router.push({ pathname: '/(app)/alert-detail', params: { id: report.id } })
            }
          />
        ))
      ) : (
        <EmptyState
          icon="notifications_off"
          title={t('home.noAlerts')}
          description={t('home.noAlertsSub')}
        />
      )}
    </Screen>
  );
}

/** The `more_horiz` action button with the red badge dot. */
function PressableMore({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.moreWrap}>
      <Text
        accessibilityRole="button"
        accessibilityLabel="আরও বিকল্প"
        onPress={onPress}
        style={styles.moreBtn}
      >
        <Icon name="more_horiz" size={22} color={theme.colors.ink[700]} />
      </Text>
      <View style={styles.badgeDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  greetingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  greetingText: {
    flex: 1,
  },
  hiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hi: {
    fontSize: 18,
    fontWeight: '700',
  },
  date: {
    fontSize: 12,
    marginTop: 2,
  },
  moreWrap: {
    marginRight: 4,
  },
  moreBtn: {
    width: 40,
    height: 40,
    textAlign: 'center',
    lineHeight: 40,
  },
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 14,
  },
  searchPlaceholder: {
    fontSize: 14,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 8,
  },
  refreshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
});

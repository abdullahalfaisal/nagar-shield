import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { REPORT_CATEGORY_LABELS, type ReportCategory } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { EmptyState, ListRow, Screen, StationMap, type StationMarker } from '@/shared/ui';
import { useHistory } from '@/shared/api/history';
import { DHAKA_FALLBACK_ORIGIN } from '@/shared/services/location';
import { formatRelativeTimeForLocale } from '@/shared/utils/relativeTime';

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
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    radiusKm?: string;
    windowHours?: string;
    category?: string;
  }>();

  // The filter set arrives from the History screen. The map renders the
  // reports inside the **current** filter — never a separate, wider set.
  const radiusKm = Number(params.radiusKm ?? 1);
  const windowHours = Number(params.windowHours ?? 24);
  const category = (params.category || null) as ReportCategory | null;

  // The origin. The map opens on the caller's position when there is one, and
  // on the default Dhaka-metro centre when there is not — the map is never
  // blank and never crashes on a denied permission.
  const origin = useMemo(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { lat: DHAKA_FALLBACK_ORIGIN.lat, lng: DHAKA_FALLBACK_ORIGIN.lng, isFallback: true };
    }
    return { lat, lng, isFallback: false };
  }, [params.lat, params.lng]);

  const { data, isLoading } = useHistory({
    lat: origin.lat,
    lng: origin.lng,
    radiusKm,
    windowHours,
    category,
    limit: 50,
  });

  const reports = useMemo(() => data?.items ?? [], [data]);

  const markers = useMemo<StationMarker[]>(
    () =>
      reports
        // A report with no coordinates gets no marker. A malformed point never
        // crashes the map, and the remaining markers still render.
        .filter((report) => report.lat !== null && report.lng !== null)
        .map((report) => ({
          id: report.id,
          lat: report.lat as number,
          lng: report.lng as number,
          title: report.category
            ? `${REPORT_CATEGORY_LABELS[report.category].bn} — ${REPORT_CATEGORY_LABELS[report.category].en}`
            : t('alerts.uncategorized'),
          subtitle: formatRelativeTimeForLocale(report.capturedAt, i18n.language),
          onPress: () =>
            router.push({ pathname: '/(app)/alert-detail', params: { id: report.id } }),
        })),
    [reports, router, i18n.language, t],
  );

  return (
    <Screen
      title={t('history.mapTitle')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <StationMap
        center={{ lat: origin.lat, lng: origin.lng }}
        zoom={13}
        markers={markers}
        userLocation={origin.isFallback ? null : { lat: origin.lat, lng: origin.lng }}
        overlay={
          markers.length === 0 && !isLoading ? (
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
        <View style={styles.list}>
          {markers.map((marker) => (
            <ListRow
              key={marker.id}
              title={marker.title}
              subtitle={marker.subtitle}
              icon="location_on"
              tone="purple"
              showArrow
              onPress={marker.onPress}
            />
          ))}
          {markers.length === 0 ? (
            <Text style={[styles.emptyNote, { color: theme.colors.ink[500] }]}>
              {t('history.mapUnavailable')}
            </Text>
          ) : null}
        </View>
      </StationMap>
    </Screen>
  );
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
});

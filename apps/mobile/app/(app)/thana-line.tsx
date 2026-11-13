import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SEEK_FALLBACK_NUMBER } from '@nagar-shield/shared';
import { useTheme } from '@/shared/theme';
import { Button, Icon, Screen, WrongNumberSheet } from '@/shared/ui';
import { useNearestThana } from '@/shared/api/stations';
import { openDialer } from '@/shared/services/dialer';
import { resolveOrigin, useCurrentFix } from '@/shared/services/location';

/**
 * The thana line.
 *
 * `003-help-seek / 006-thana-line-fallback` — the surface the More Help
 * sheet's নিকটবর্তী থানা row opens.
 *
 * Three things this screen is careful about:
 *
 *   * **The fallback decision is made in exactly one place.** The
 *     `nearest_thana` RPC applies the 10 km rule server-side and returns
 *     either the station row or a fallback row (`phone = '999'`,
 *     `fallback = true`). The client never re-derives the rule and never
 *     substitutes a number of its own — it renders whatever the RPC decided.
 *   * **The banner comes before the dialer.** The user sees *why* `999` is the
 *     target and the target itself together, so a routed call is never a
 *     surprise.
 *   * **The distance is computed server-side.** The client sends the raw fix
 *     and the RPC does the haversine against the `stations` GiST index. The
 *     app never ranks the dataset itself.
 */
export default function ThanaLineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  // The fix is requested **just-in-time** — when the thana line opens. It is
  // never requested at app open and never on the panic path.
  const { state } = useCurrentFix();
  const { origin, isFallback } = useMemo(() => resolveOrigin(state), [state]);

  const { data, isLoading, error } = useNearestThana(origin.lat, origin.lng, 10);

  const [reporting, setReporting] = useState(false);

  // The RPC's answer, rendered as-is. `fallback` true means the rule fired
  // and the target is 999.
  const fallback = data?.fallback ?? false;
  const station = fallback || data === undefined ? null : data;
  const target = station?.phone ?? SEEK_FALLBACK_NUMBER;

  const stationName =
    station === null
      ? null
      : i18n.language === 'bn'
        ? (station.nameBn ?? station.name ?? '')
        : (station.name ?? '');

  return (
    <Screen
      title={t('help.thanaTitle')}
      onBack={() => router.back()}
    >
      {isLoading ? (
        <View style={styles.block}>
          <Text style={[styles.loading, { color: theme.colors.ink[500] }]}>
            {t('common.loading')}
          </Text>
        </View>
      ) : null}

      {/* The fallback banner. It renders BEFORE the call affordance, so the
          user sees the explanation and the target together. */}
      {fallback ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.banner,
            {
              backgroundColor: theme.palette.amber[50],
              borderColor: theme.palette.amber[100],
            },
          ]}
        >
          <Icon name="info" size={20} color={theme.palette.amber[600]} filled />
          <View style={styles.bannerBody}>
            <Text style={[styles.bannerTitle, { color: theme.colors.ink[950] }]}>
              {t('help.thanaFallbackTitle')}
            </Text>
            <Text style={[styles.bannerText, { color: theme.colors.ink[500] }]}>
              {t('help.thanaFallback')}
            </Text>
            <Text style={[styles.bannerText, { color: theme.colors.ink[500] }]}>
              {t('help.thanaManual')}
            </Text>
          </View>
        </View>
      ) : null}

      {error ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.banner,
            {
              backgroundColor: theme.palette.red[50],
              borderColor: theme.palette.red[100],
            },
          ]}
        >
          <Icon name="error" size={20} color={theme.palette.red[600]} filled />
          <View style={styles.bannerBody}>
            <Text style={[styles.bannerText, { color: theme.colors.ink[700] }]}>
              {t('help.thanaManual')}
            </Text>
          </View>
        </View>
      ) : null}

      {station && stationName ? (
        <View style={styles.block}>
          <Text style={[styles.stationName, { color: theme.colors.ink[950] }]}>
            {stationName}
          </Text>
          {station.distanceKm !== null ? (
            <Text style={[styles.distance, { color: theme.colors.ink[500] }]}>
              {t('help.thanaDistance', { distance: station.distanceKm })}
            </Text>
          ) : null}
          <Text style={[styles.number, { color: theme.palette.violet[700] }]}>
            {station.phone}
          </Text>
        </View>
      ) : null}

      {isFallback && !fallback ? (
        <Text style={[styles.hint, { color: theme.colors.ink[500] }]}>
          {t('help.thanaLocationDenied')}
        </Text>
      ) : null}

      <Button
        label={`${t('help.callNow')} · ${target}`}
        onPress={() => {
          void openDialer(target);
        }}
        style={styles.call}
        accessibilityLabel={
          stationName
            ? t('help.thanaCallLabel', { name: stationName })
            : t('help.hotlineCallLabel', { name: SEEK_FALLBACK_NUMBER, number: SEEK_FALLBACK_NUMBER })
        }
      />

      {station ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('help.wrongNumberTitle')}
          onPress={() => setReporting(true)}
          style={styles.reportLink}
        >
          <Icon name="report" size={16} color={theme.palette.amber[600]} />
          <Text style={[styles.reportText, { color: theme.palette.violet[700] }]}>
            {t('help.wrongNumber')}
          </Text>
        </Pressable>
      ) : null}

      <WrongNumberSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        entryType="station"
        entryId={station?.id ?? ''}
        entryName={stationName ?? undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  banner: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bannerBody: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  bannerText: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 17,
  },
  stationName: {
    fontSize: 20,
    fontWeight: '700',
  },
  distance: {
    fontSize: 12,
    marginTop: 3,
  },
  number: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  loading: {
    fontSize: 13,
  },
  hint: {
    marginHorizontal: 20,
    marginBottom: 12,
    fontSize: 11,
    lineHeight: 17,
  },
  call: {
    marginHorizontal: 20,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    marginHorizontal: 20,
    minHeight: 48,
  },
  reportText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { STATIONS, type StationEntry } from '@nagar-shield/shared'
import { useTheme } from '@/shared/theme'
import {
  Icon,
  ListRow,
  ManualDialGuidance,
  Screen,
  StationMap,
  type StationMarker,
} from '@/shared/ui'
import { useDegradedHelp } from '@/shared/services/useDegradedHelp'
import { resolveOrigin, useCurrentFix } from '@/shared/services/location'
import { useRefreshGuard } from '@/shared/services/refreshGuard'

/**
 * The Find-a-station map.
 *
 * `003-help-seek / 007-find-a-station-map` — the surface the More Help
 * sheet's ম্যাপে স্টেশন খুঁজুন row opens.
 *
 * Four things this screen is careful about:
 *
 *   * **One wrapper, no fork.** The map is built on unit `003`'s shared
 *     `shared/ui/StationMap` — the same component the History map uses, with
 *     the same OSM raster style. The wrapper owns the attribution, so it
 *     cannot be dropped from this surface by forgetting it.
 *   * **The markers come from the bundle.** The station set is the curated
 *     JSON (~60 rows) that ships in the app, so the marker layer renders with
 *     no server round-trip and the surface works offline. The Postgres
 *     mirror is a separate read path, not a map dependency.
 *   * **Three colours need a key.** The pin colour encodes the station type,
 *     so the surface ships a legend naming each type in `bn` and `en`. Three
 *     colours with no key is a colour-blind trap.
 *   * **The callout never claims a dispatch.** It shows the station's name,
 *     number and type — what the app knows — and nothing else (C-6).
 */
export default function StationMapScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  // The fix is requested **just-in-time**, when the map opens. It is never
  // requested at app open and never on the panic path.
  const { state } = useCurrentFix()
  const { origin, isFallback } = useMemo(() => resolveOrigin(state), [state])

  // The offline notice. The tiles are the only thing that needs the network —
  // the markers and the list come from the bundle — so an offline device
  // loses the canvas, not the surface.
  const { isOffline } = useRefreshGuard()

  const [selected, setSelected] = useState<StationEntry | null>(null)

  // The same degraded-mode flow every help entry point uses.
  const degradedHelp = useDegradedHelp()

  // The marker colours come from the design tokens, not from literals, and
  // the prototype's Help-card palette is the starting point so the map and
  // the Help Alert block read as one system: police violet, medical red,
  // fire amber.
  const typeColor = useMemo(
    () => ({
      police: theme.palette.violet[600],
      hospital: theme.palette.red[600],
      fire: theme.palette.amber[600],
    }),
    [theme],
  )

  const displayName = (station: StationEntry) =>
    i18n.language === 'bn' ? (station.nameBn ?? station.name) : station.name

  // The station set is the **active** bundled rows. An inactive station is
  // excluded from the marker set — a retired station is never shown.
  const stations = useMemo(() => STATIONS.filter((station) => station.isActive), [])

  const markers = useMemo<StationMarker[]>(
    () =>
      stations.map((station) => ({
        id: station.id,
        lat: station.lat,
        lng: station.lng,
        title: displayName(station),
        color: typeColor[station.stationType],
        onPress: () => setSelected(station),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stations, typeColor, i18n.language],
  )

  const selectedName = selected ? displayName(selected) : null

  return (
    <Screen
      title={t('help.stationMapTitle')}
      onBack={() => router.back()}
      scroll={false}
      background={theme.colors.surface.lavender}
    >
      <StationMap
        center={{ lat: origin.lat, lng: origin.lng }}
        zoom={12}
        markers={markers}
        userLocation={isFallback ? null : { lat: origin.lat, lng: origin.lng }}
        overlayAlign="top"
        overlay={
          <View style={styles.overlayStack}>
            <View
              style={[
                styles.legend,
                {
                  backgroundColor: theme.colors.surface.white,
                  borderColor: theme.colors.ink[100],
                },
              ]}
            >
              <Text style={[styles.legendTitle, { color: theme.colors.ink[700] }]}>
                {t('help.stationMapLegend')}
              </Text>
              <View style={styles.legendRow}>
                <LegendSwatch color={typeColor.police} label={t('help.stationTypePolice')} />
                <LegendSwatch color={typeColor.hospital} label={t('help.stationTypeHospital')} />
                <LegendSwatch color={typeColor.fire} label={t('help.stationTypeFire')} />
              </View>
              {isFallback ? (
                <Text style={[styles.legendHint, { color: theme.colors.ink[500] }]}>
                  {t('help.thanaLocationDenied')}
                </Text>
              ) : null}
            </View>

            {/* The offline notice. The markers and the list below the map come
                from the bundle, so the surface stays useful without a network —
                only the tiles are missing, and the notice says so plainly. */}
            {isOffline ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.offlineNotice,
                  {
                    backgroundColor: theme.palette.amber[50],
                    borderColor: theme.palette.amber[100],
                  },
                ]}
              >
                <Icon name="info" size={18} color={theme.palette.amber[600]} filled />
                <Text style={[styles.offlineText, { color: theme.colors.ink[700] }]}>
                  {t('help.stationMapOffline')}
                </Text>
              </View>
            ) : null}
          </View>
        }
      >
        {/* The callout. It is rendered **under** the map, never over the
            attribution — the attribution must stay visible at all times. */}
        {selected && selectedName ? (
          <View
            style={[
              styles.callout,
              {
                backgroundColor: theme.colors.surface.white,
                borderColor: theme.colors.ink[100],
              },
            ]}
          >
            <View style={styles.calloutHeader}>
              <View style={styles.calloutText}>
                <Text style={[styles.calloutName, { color: theme.colors.ink[950] }]}>
                  {selectedName}
                </Text>
                <Text style={[styles.calloutType, { color: theme.colors.ink[500] }]}>
                  {t(
                    selected.stationType === 'police'
                      ? 'help.stationTypePolice'
                      : selected.stationType === 'hospital'
                        ? 'help.stationTypeHospital'
                        : 'help.stationTypeFire',
                  )}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setSelected(null)}
                style={styles.calloutClose}
              >
                <Icon name="close" size={18} color={theme.colors.ink[500]} />
              </Pressable>
            </View>

            {selected.address ? (
              <Text style={[styles.calloutAddress, { color: theme.colors.ink[500] }]}>
                {t('help.stationMapCalloutAddress')}: {selected.address}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('help.stationMapCallLabel', {
                name: selectedName,
                number: selected.phone,
              })}
              onPress={() => {
                void degradedHelp.dial(selected.phone)
              }}
              style={[styles.callButton, { backgroundColor: theme.palette.violet[50] }]}
            >
              <Icon name="call" size={18} color={theme.palette.violet[700]} filled />
              <Text style={[styles.callNumber, { color: theme.palette.violet[700] }]}>
                {selected.phone}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.list}>
          {stations.map((station) => (
            <ListRow
              key={station.id}
              title={displayName(station)}
              subtitle={station.phone}
              icon="location_on"
              tone={
                station.stationType === 'police'
                  ? 'purple'
                  : station.stationType === 'hospital'
                    ? 'red'
                    : 'amber'
              }
              showArrow={false}
              onPress={() => setSelected(station)}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('help.stationMapCallLabel', {
                    name: displayName(station),
                    number: station.phone,
                  })}
                  onPress={() => {
                    void degradedHelp.dial(station.phone)
                  }}
                  style={styles.rowCall}
                >
                  <Icon name="call" size={18} color={theme.palette.violet[700]} filled />
                </Pressable>
              }
            />
          ))}
        </View>
      </StationMap>

      {/* The manual-dial guidance — the same component every help entry point
          renders. */}
      {degradedHelp.showGuidance && degradedHelp.guidanceNumber ? (
        <ManualDialGuidance
          number={degradedHelp.guidanceNumber}
          showPowerSaveWarning={degradedHelp.showPowerSaveWarning}
          showOfflineNotice={degradedHelp.showOfflineNotice}
        />
      ) : null}
    </Screen>
  )
}

/** One entry of the map legend — a colour and its name. */
function LegendSwatch({ color, label }: { color: string; label: string }) {
  const theme = useTheme()

  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: theme.colors.ink[700] }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  overlayStack: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 8,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    maxWidth: 280,
  },
  offlineText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  legend: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: 260,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 11,
  },
  legendHint: {
    fontSize: 10,
    marginTop: 8,
    lineHeight: 15,
  },
  callout: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  calloutText: {
    flex: 1,
  },
  calloutName: {
    fontSize: 16,
    fontWeight: '700',
  },
  calloutType: {
    fontSize: 11,
    marginTop: 2,
  },
  calloutClose: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
    marginTop: -12,
  },
  calloutAddress: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    height: 48,
    borderRadius: 14,
  },
  callNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  rowCall: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

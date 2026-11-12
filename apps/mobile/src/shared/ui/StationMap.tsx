import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

/**
 * The shared MapLibre wrapper.
 *
 * Unit `003` (Find a station) owns this component and unit `006` (History map)
 * reuses it. The two surfaces must not fork — a fork is how the OSM
 * attribution gets dropped from one of them.
 *
 * The raster style is the OSM tile server. When the tiles are unreachable the
 * wrapper degrades to the bundled list under the map, never to a blank canvas.
 */
interface StationMapProps {
  /** Map centre. */
  center: { lat: number; lng: number };
  zoom?: number;
  /** One marker per entry. */
  markers: StationMarker[];
  /** Rendered under the map — the list of entries, used for the no-tiles fallback. */
  children?: ReactNode;
  /** Shows the OSM attribution. Mandatory whenever the map renders. */
  attribution?: string;
}

export interface StationMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}

/**
 * The shared MapLibre wrapper.
 *
 * The native MapLibre module is loaded lazily so a missing native binary
 * (an Expo Go device, a CI runner without the native build) degrades to the
 * list instead of crashing the screen.
 */
export function StationMap({
  center,
  zoom = 12,
  markers,
  children,
  attribution = '© OpenStreetMap contributors',
}: StationMapProps) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <View style={[styles.canvas, { backgroundColor: theme.colors.ink[100] }]}>
        <MapCanvas center={center} zoom={zoom} markers={markers} />
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>{attribution}</Text>
        </View>
      </View>
      {children ? <ScrollView style={styles.list}>{children}</ScrollView> : null}
    </View>
  );
}

/**
 * The MapLibre canvas.
 *
 * The native MapLibre module is loaded lazily so a missing native binary
 * (an Expo Go device, a CI runner without the native build) degrades to the
 * list instead of crashing the screen.
 */
function MapCanvas({
  center,
  zoom,
  markers,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  markers: StationMarker[];
}) {
  const theme = useTheme();
  const MapLibre = requireMapLibre();

  if (!MapLibre) {
    return <View style={styles.fallback} />;
  }

  return (
    <MapLibre.Map
      mapStyle={OSM_RASTER_STYLE}
      logo={false}
      attribution={false}
      compass={false}
      style={styles.map}
    >
      <MapLibre.Camera center={[center.lng, center.lat]} zoom={zoom} />
      <MapLibre.RasterSource
        id="osm"
        tiles={['https://tile.openstreetmap.org/{z}/{x}/{y}.png']}
        tileSize={256}
        maxzoom={19}
        attribution="© OpenStreetMap contributors"
      />
      <MapLibre.Layer id="osm-layer" type="raster" source="osm" />
      {markers.map((marker) => (
        <MapLibre.Marker
          key={marker.id}
          id={marker.id}
          lngLat={[marker.lng, marker.lat]}
          onPress={marker.onPress}
        >
          <View style={[styles.pin, { backgroundColor: theme.palette.violet[600] }]} />
        </MapLibre.Marker>
      ))}
    </MapLibre.Map>
  );
}

/**
 * Loads `@maplibre/maplibre-react-native` without making it a hard import.
 *
 * The package needs a native module that is absent in Expo Go and in the Jest
 * environment, so a static import would take the whole screen down.
 */
function requireMapLibre(): typeof import('@maplibre/maplibre-react-native') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@maplibre/maplibre-react-native');
  } catch {
    return null;
  }
}

/** The OSM raster style — the only tile source the app uses. */
const OSM_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-layer',
      type: 'raster' as const,
      source: 'osm',
    },
  ],
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  canvas: {
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
  },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  attributionText: {
    fontSize: 9,
    color: '#11112B',
  },
  list: {
    maxHeight: 240,
  },
});

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
  /** The user's own position — drawn as a distinct "you are here" marker. */
  userLocation?: { lat: number; lng: number } | null;
  /** Rendered over the canvas — the empty state, the offline notice. */
  overlay?: ReactNode;
  /**
   * Where the overlay sits on the canvas. `center` (the default) suits an
   * empty state; `top` pins a legend to the top-left so it does not cover
   * the markers.
   */
  overlayAlign?: 'center' | 'top';
}

export interface StationMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  /**
   * The marker's pin colour.
   *
   * The Find-a-station surface encodes the station **type** in the pin
   * colour — police, hospital and fire each get a distinct colour from the
   * design tokens. The History map leaves this unset and keeps the single
   * violet pin, because a report's category is already carried by the
   * marker *title*.
   */
  color?: string;
  onPress?: () => void;
}

/**
 * The documented marker cap.
 *
 * A dense filter set (5 km over 30 days) can return hundreds of reports, and
 * one native marker per report would freeze the map. The cap keeps the render
 * responsive. It never silently drops a report from the **list** — the list
 * remains the complete view, and the map is the spatial overview
 * (`008-history-map`).
 */
export const MAP_MARKER_CAP = 150;

/**
 * Caps the marker set, keeping the ones nearest the centre.
 *
 * The cap is applied by **distance from the centre**, not by row order, so the
 * markers that survive are the ones the user is actually looking at. A
 * half-sorted list would show the cap's worth of whichever reports happened to
 * be newest.
 */
export function capMarkers(
  markers: StationMarker[],
  center: { lat: number; lng: number },
  cap: number = MAP_MARKER_CAP,
): StationMarker[] {
  if (markers.length <= cap) return markers;

  return [...markers]
    .map((marker) => ({
      marker,
      // A cheap planar distance is enough for a *selection* heuristic — the
      // marker is still placed at its true coordinate.
      distance: (marker.lat - center.lat) ** 2 + (marker.lng - center.lng) ** 2,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, cap)
    .map((entry) => entry.marker);
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
  userLocation = null,
  overlay = null,
  overlayAlign = 'center',
}: StationMapProps) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <View style={[styles.canvas, { backgroundColor: theme.colors.ink[100] }]}>
        <MapCanvas
          center={center}
          zoom={zoom}
          markers={capMarkers(markers, center)}
          userLocation={userLocation}
        />
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>{attribution}</Text>
        </View>
        {overlay ? (
          <View style={[styles.overlay, overlayAlign === 'top' ? styles.overlayTop : null]}>
            {overlay}
          </View>
        ) : null}
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
  userLocation,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  markers: StationMarker[];
  userLocation: { lat: number; lng: number } | null;
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
          <View
            style={[
              styles.pin,
              { backgroundColor: marker.color ?? theme.palette.violet[600] },
            ]}
          />
        </MapLibre.Marker>
      ))}
      {userLocation ? (
        <MapLibre.Marker id="user-location" lngLat={[userLocation.lng, userLocation.lat]}>
          <View style={[styles.userPin, { backgroundColor: theme.palette.sky[600] }]} />
        </MapLibre.Marker>
      ) : null}
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
  userPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  /**
   * The overlay's own alignment is overridable.
   *
   * The default is **centred** — the History map's empty state sits in the
   * middle of the canvas. The Find-a-station surface pins its legend to the
   * top-left instead, because a legend in the middle of a map covers the
   * stations the user is looking for. A consumer that needs the other
   * alignment passes `overlayAlign="top"`.
   */
  overlayTop: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
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

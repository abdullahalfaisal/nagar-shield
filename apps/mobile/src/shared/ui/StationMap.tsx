import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { useRef, useState } from 'react'
import { FlatList, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme'
import { MapZoomButtons } from './MapZoomButtons'
import { MAX_ZOOM, MIN_ZOOM, TileMapFallback } from './TileMapFallback'
import { TILE_ATTRIBUTION, TILE_URL_TEMPLATE } from './tileSource'
import { pinCountLabel } from './tileMap'
// The type only — the value is required lazily below, so that a missing
// native module does not take the whole screen down.
import type * as MapLibreModule from '@maplibre/maplibre-react-native'
import type { CameraRef } from '@maplibre/maplibre-react-native'

/**
 * The shared MapLibre wrapper.
 *
 * Unit `003` (Find a station) owns this component and unit `006` (History map)
 * reuses it. The two surfaces must not fork — a fork is how the OSM
 * attribution gets dropped from one of them.
 *
 * The raster style is the configured tile source (`tileSource.ts`). When the tiles are unreachable the
 * wrapper degrades to the bundled list under the map, never to a blank canvas.
 */
interface StationMapProps {
  /** Map centre. */
  center: { lat: number; lng: number }
  zoom?: number
  /** One marker per entry. */
  markers: StationMarker[]
  /** Rendered under the map — the list of entries, used for the no-tiles fallback. */
  children?: ReactNode
  /**
   * The rows of the list, one keyed element each. They are rendered in a
   * `FlatList`, so a long list (every bundled station) mounts only what is on
   * screen. `children` becomes the list's header.
   */
  items?: ReactElement[]
  /**
   * Adds the bottom safe-area inset under the list. A screen that renders its
   * own footer below the map turns this off so the inset is not counted twice.
   */
  insetBottom?: boolean
  /** Shows the tile attribution. Mandatory whenever the map renders. */
  attribution?: string
  /** The user's own position — drawn as a distinct "you are here" marker. */
  userLocation?: { lat: number; lng: number } | null
  /**
   * Shows + / − zoom buttons over the canvas. On by default: every map pinches
   * and drags, and every map also has the buttons, for one-handed use and for
   * anyone who cannot pinch.
   */
  zoomControls?: boolean
  /** Rendered over the canvas — the empty state, the offline notice. */
  overlay?: ReactNode
  /**
   * Where the overlay sits on the canvas. `center` (the default) suits an
   * empty state; `top` pins a legend to the top-left so it does not cover
   * the markers.
   */
  overlayAlign?: 'center' | 'top'
}

export interface StationMarker {
  id: string
  lat: number
  lng: number
  title: string
  subtitle?: string
  /**
   * The marker's pin colour.
   *
   * The Find-a-station surface encodes the station **type** in the pin
   * colour — police, hospital and fire each get a distinct colour from the
   * design tokens. The History map leaves this unset and keeps the single
   * violet pin, because a report's category is already carried by the
   * marker *title*.
   */
  color?: string
  /**
   * How many reports share this pin's place. `undefined` for a single report.
   *
   * Reports at the same place would otherwise stack into one dot that looks
   * exactly like a single report's — 21 reports at one corner read as one
   * report there. With a count the pin says what it covers, and the list
   * under the map stays the complete, per-report view.
   */
  count?: number
  onPress?: () => void
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
export const MAP_MARKER_CAP = 150

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
  if (markers.length <= cap) return markers

  return [...markers]
    .map((marker) => ({
      marker,
      // A cheap planar distance is enough for a *selection* heuristic — the
      // marker is still placed at its true coordinate.
      distance: (marker.lat - center.lat) ** 2 + (marker.lng - center.lng) ** 2,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, cap)
    .map((entry) => entry.marker)
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
  items,
  insetBottom = true,
  attribution = TILE_ATTRIBUTION,
  userLocation = null,
  zoomControls = true,
  overlay = null,
  overlayAlign = 'center',
}: StationMapProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <View style={[styles.canvas, { backgroundColor: theme.colors.ink[100] }]}>
        <MapCanvas
          center={center}
          zoom={zoom}
          markers={capMarkers(markers, center)}
          userLocation={userLocation}
          zoomControls={zoomControls}
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
      {children || items ? (
        <FlatList
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insetBottom ? insets.bottom : 0 }}
          data={items ?? []}
          renderItem={({ item }) => item}
          keyExtractor={(item, index) =>
            isValidElement(item) && item.key !== null ? String(item.key) : String(index)
          }
          ListHeaderComponent={children ? <>{children}</> : undefined}
        />
      ) : null}
    </View>
  )
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
  zoomControls,
}: {
  center: { lat: number; lng: number }
  zoom: number
  markers: StationMarker[]
  userLocation: { lat: number; lng: number } | null
  zoomControls: boolean
}) {
  const theme = useTheme()
  const MapLibre = requireMapLibre()
  // The native map zooms by pinch on its own. These two only feed the buttons:
  // the camera to move, and the zoom the map is at now.
  const cameraRef = useRef<CameraRef>(null)
  const [currentZoom, setCurrentZoom] = useState(zoom)

  if (!MapLibre) {
    // No native module (Expo Go, CI): draw the tiles in plain views so the
    // map still shows. The pins stay tappable.
    return (
      <TileMapFallback
        center={center}
        zoom={zoom}
        markers={markers}
        userLocation={userLocation}
        zoomControls={zoomControls}
      />
    )
  }

  const zoomBy = (step: number) =>
    cameraRef.current?.zoomTo(
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(currentZoom) + step)),
      {
        duration: 200,
      },
    )

  return (
    <>
      <MapLibre.Map
        mapStyle={RASTER_STYLE}
        logo={false}
        attribution={false}
        compass={false}
        style={styles.map}
        onRegionDidChange={(event) => setCurrentZoom(event.nativeEvent.zoom)}
      >
        <MapLibre.Camera ref={cameraRef} center={[center.lng, center.lat]} zoom={zoom} />
        {TILE_URL_TEMPLATE ? (
          <>
            <MapLibre.RasterSource
              id="osm"
              tiles={[TILE_URL_TEMPLATE]}
              tileSize={256}
              maxzoom={19}
              attribution={TILE_ATTRIBUTION}
            />
            <MapLibre.Layer id="osm-layer" type="raster" source="osm" />
          </>
        ) : null}
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
                marker.count ? styles.pinStacked : null,
                { backgroundColor: marker.color ?? theme.palette.violet[600] },
              ]}
            >
              {marker.count ? (
                <Text style={styles.pinCount}>{pinCountLabel(marker.count)}</Text>
              ) : null}
            </View>
          </MapLibre.Marker>
        ))}
        {userLocation ? (
          <MapLibre.Marker id="user-location" lngLat={[userLocation.lng, userLocation.lat]}>
            <View style={[styles.userPin, { backgroundColor: theme.palette.sky[600] }]} />
          </MapLibre.Marker>
        ) : null}
      </MapLibre.Map>
      {zoomControls ? (
        <MapZoomButtons
          canZoomIn={Math.round(currentZoom) < MAX_ZOOM}
          canZoomOut={Math.round(currentZoom) > MIN_ZOOM}
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
        />
      ) : null}
    </>
  )
}

/**
 * Loads `@maplibre/maplibre-react-native` without making it a hard import.
 *
 * The package needs a native module that is absent in Expo Go and in the Jest
 * environment, so a static import would take the whole screen down. The
 * *type* is imported statically — that is erased at compile time and pulls
 * nothing into the bundle — while the *value* is still required lazily.
 */
function requireMapLibre(): typeof MapLibreModule | null {
  // Ask whether the native modules are registered *before* requiring the
  // package. Requiring it without them fails, and although the failure is
  // caught here, React Native's dev mode reports every failed module load as
  // an error and shows the red error screen on the map screens in Expo Go.
  if (!hasNativeMapLibre()) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@maplibre/maplibre-react-native')
  } catch {
    return null
  }
}

/** Whether this binary carries the MapLibre native modules (a dev or release build, not Expo Go). */
function hasNativeMapLibre(): boolean {
  try {
    return (
      TurboModuleRegistry.get('MLRNMapViewModule') != null &&
      TurboModuleRegistry.get('MLRNCameraModule') != null
    )
  } catch {
    return false
  }
}

/** The raster style — the one tile source the app uses (`tileSource.ts`). */
interface RasterSourceSpec {
  type: 'raster'
  tiles: string[]
  tileSize: number
  attribution: string
}

// No source configured: an empty style, so the native map draws a plain
// background under the markers and requests nothing.
const RASTER_STYLE = {
  version: 8 as const,
  sources: (TILE_URL_TEMPLATE
    ? {
        osm: {
          type: 'raster' as const,
          tiles: [TILE_URL_TEMPLATE],
          tileSize: 256,
          attribution: TILE_ATTRIBUTION,
        },
      }
    : {}) as Record<string, RasterSourceSpec>,
  layers: (TILE_URL_TEMPLATE
    ? [{ id: 'osm-layer', type: 'raster' as const, source: 'osm' }]
    : []) as Array<{ id: string; type: 'raster'; source: string }>,
}

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
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinStacked: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  pinCount: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
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
    fontSize: 12,
    color: '#11112B',
  },
  list: {
    maxHeight: 240,
  },
})

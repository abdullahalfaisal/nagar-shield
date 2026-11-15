import { useEffect, useRef, useState } from 'react'
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import {
  TILE_SIZE,
  mostTilesFailed,
  pinCountLabel,
  project,
  settleGesture,
  tilesForViewport,
  type GestureOffset,
  type Viewport,
} from './tileMap'
import { HAS_TILE_SOURCE, tileUrl } from './tileSource'
import { MapZoomButtons } from './MapZoomButtons'

interface FallbackMarker {
  id: string
  lat: number
  lng: number
  color?: string
  /** How many reports share this pin's place. `undefined` for a single one. */
  count?: number
  onPress?: () => void
}

interface TileMapFallbackProps {
  center: { lat: number; lng: number }
  zoom: number
  markers: FallbackMarker[]
  userLocation: { lat: number; lng: number } | null
  /**
   * A labelled "you are here" pin with a pulse. It is drawn on the map layer, at
   * the place's own coordinates, so it moves with the map when the map is dragged.
   */
  placePin?: { lat: number; lng: number; label: string; color: string }
  /** Shows + / − buttons. The map also drags and pinches. Defaults to on. */
  zoomControls?: boolean
}

/** How far the buttons zoom: city level to street level. */
export const MIN_ZOOM = 10
export const MAX_ZOOM = 18

/** Tile providers ask apps to identify themselves. */
const TILE_HEADERS = { 'User-Agent': 'NagarShield/1.0 (community safety app)' }

/**
 * The map for builds that have no native MapLibre module — Expo Go, a CI
 * runner. It lays raster tiles (see `tileSource.ts`) out in plain `Image` views and
 * pins the markers over them, so the map still shows instead of an empty box.
 *
 * It drags with one finger and pinches with two, like the native map. While
 * the fingers are down the tiles are only moved and scaled on screen; when they
 * lift, the new centre and zoom level are worked out (`settleGesture`) and the
 * tiles are laid out again at that level, so they end up sharp.
 */
export function TileMapFallback({
  center,
  zoom: initialZoom,
  markers,
  userLocation,
  placePin,
  zoomControls = true,
}: TileMapFallbackProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [size, setSize] = useState({ width: 0, height: 0 })
  // The tiles that are failing **now**, by key. A counter only went up, so one
  // bad moment left the notice on screen for good; a tile that loads (or a
  // tile that leaves the view) drops out of the set and the notice clears.
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(new Set())
  const markTile = (key: string, isFailed: boolean) =>
    setFailedKeys((current) => {
      if (current.has(key) === isFailed) return current
      const next = new Set(current)
      if (isFailed) next.add(key)
      else next.delete(key)
      return next
    })

  // What the user chose by dragging, pinching or pressing the buttons; the
  // props are the starting point and the new default whenever they change (a
  // fix arriving re-centres the map).
  const [chosenZoom, setChosenZoom] = useState<number | null>(null)
  const [chosenCenter, setChosenCenter] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    setChosenZoom(null)
    setChosenCenter(null)
  }, [initialZoom, center.lat, center.lng])
  const zoom = chosenZoom ?? initialZoom
  const shownCenter = chosenCenter ?? center

  // The drag and pinch in progress. It is kept in a ref as well as in state,
  // because the responder's handlers outlive the render that made them.
  const [live, setLive] = useState<GestureOffset>(IDENTITY)
  const liveRef = useRef<GestureOffset>(IDENTITY)
  const pinchStartRef = useRef<number | null>(null)

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    )
  }

  const viewport: Viewport = { center: shownCenter, zoom, width: size.width, height: size.height }
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  const setGesture = (next: GestureOffset) => {
    liveRef.current = next
    setLive(next)
  }
  const settle = () => {
    const result = settleGesture(viewportRef.current, liveRef.current, MIN_ZOOM, MAX_ZOOM)
    pinchStartRef.current = null
    setChosenCenter(result.center)
    setChosenZoom(result.zoom)
    setGesture(IDENTITY)
  }

  // One finger drags, two pinch. A tap on a pin is left to the pin: the map
  // only takes the touch once it moves (or a second finger lands).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      // A list or a page behind the map must not take the drag away.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches
        let scale = liveRef.current.scale
        const [a, b] = touches
        if (a && b) {
          const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)
          if (pinchStartRef.current === null) pinchStartRef.current = distance || 1
          scale = Math.max(0.5, Math.min(4, distance / pinchStartRef.current))
        } else {
          pinchStartRef.current = null
        }
        setGesture({ tx: gesture.dx, ty: gesture.dy, scale })
      },
      onPanResponderRelease: () => settle(),
      onPanResponderTerminate: () => settle(),
    }),
  ).current
  // No configured source: no request is made at all, and the pins sit on the
  // plain background.
  //
  // The tiles are laid out over the view plus one tile of margin on every side,
  // so dragging the map shows more map and not a blank strip while the fingers
  // are still down.
  const tiles = HAS_TILE_SOURCE
    ? tilesForViewport({
        ...viewport,
        width: size.width + TILE_SIZE * 2,
        height: size.height + TILE_SIZE * 2,
      }).map((tile) => ({ ...tile, left: tile.left - TILE_SIZE, top: tile.top - TILE_SIZE }))
    : []

  // A blank canvas says nothing. When most tiles fail (no network, a blocked
  // host) the map names the problem instead of staying silently empty. Only
  // the tiles in view count, and only a real load failure sets the notice.
  const failedInView = tiles.filter((tile) => failedKeys.has(tile.key)).length
  const tilesUnreachable = !HAS_TILE_SOURCE || mostTilesFailed(tiles.length, failedInView)

  return (
    <View style={styles.root} onLayout={onLayout} {...panResponder.panHandlers}>
      {/* Everything that moves with the map. The gesture offsets are applied
          here, about the view's centre, so the tiles and the pins stay together. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX: live.tx }, { translateY: live.ty }, { scale: live.scale }],
          },
        ]}
      >
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tileUrl(tile.z, tile.x, tile.y), headers: TILE_HEADERS }}
            style={[styles.tile, { left: tile.left, top: tile.top }]}
            onError={() => markTile(tile.key, true)}
            onLoad={() => markTile(tile.key, false)}
            // The tiles are decoration; the list below carries the content.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ))}

        {markers.map((marker) => {
          const { left, top } = project(marker, viewport)
          if (left < -CULL_MARGIN || top < -CULL_MARGIN) return null
          if (left > size.width + CULL_MARGIN || top > size.height + CULL_MARGIN) return null

          return (
            <Pressable
              key={marker.id}
              onPress={marker.onPress}
              disabled={!marker.onPress}
              accessibilityRole="button"
              hitSlop={14}
              style={[styles.pinHit, { left: left - PIN_HIT / 2, top: top - PIN_HIT / 2 }]}
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
            </Pressable>
          )
        })}

        {placePin ? <PlacePin position={project(placePin, viewport)} pin={placePin} /> : null}

        {userLocation ? (
          <UserPin position={project(userLocation, viewport)} color={theme.palette.sky[600]} />
        ) : null}
      </View>

      {zoomControls ? (
        <MapZoomButtons
          canZoomIn={zoom < MAX_ZOOM}
          canZoomOut={zoom > MIN_ZOOM}
          onZoomIn={() => setChosenZoom(Math.min(MAX_ZOOM, zoom + 1))}
          onZoomOut={() => setChosenZoom(Math.max(MIN_ZOOM, zoom - 1))}
        />
      ) : null}

      {tilesUnreachable ? (
        <View pointerEvents="none" style={styles.notice}>
          <Text style={[styles.noticeText, { color: theme.colors.ink[700] }]}>
            {t('history.mapUnavailable')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function PlacePin({
  position,
  pin,
}: {
  position: { left: number; top: number }
  pin: { label: string; color: string }
}) {
  return (
    // A zero-size anchor on the place: the label, pulse and dot are placed from it.
    <View
      pointerEvents="none"
      style={[styles.placeAnchor, { left: position.left, top: position.top }]}
    >
      <View style={styles.placeLabelRow}>
        <View style={styles.placeLabel}>
          <Text numberOfLines={1} style={styles.placeLabelText}>
            {pin.label}
          </Text>
        </View>
      </View>
      <View style={[styles.placePulse, { backgroundColor: pin.color }]} />
      <View style={[styles.placeDot, { backgroundColor: pin.color }]} />
    </View>
  )
}

function UserPin({ position, color }: { position: { left: number; top: number }; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.userPin,
        { backgroundColor: color, left: position.left - 9, top: position.top - 9 },
      ]}
    />
  )
}

const PIN_HIT = 32

/** Pins this far outside the view are still drawn, so a drag shows them arriving. */
const CULL_MARGIN = 256

const IDENTITY: GestureOffset = { tx: 0, ty: 0, scale: 1 }

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  pinHit: {
    position: 'absolute',
    // Literals, not `PIN_HIT`: the tap-target gate reads sizes from the source
    // and cannot follow a constant. Keep them equal to `PIN_HIT`.
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  placeAnchor: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  placeDot: {
    position: 'absolute',
    left: -12,
    top: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  placePulse: {
    position: 'absolute',
    left: -12,
    top: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    opacity: 0.35,
  },
  // Its own wide row above the dot; inside a 24 dp box the text wrapped a letter per line.
  placeLabelRow: {
    position: 'absolute',
    bottom: 18,
    left: -100,
    width: 200,
    alignItems: 'center',
  },
  // A fixed dark fill with white text: the tiles are light in both themes.
  placeLabel: {
    backgroundColor: '#11112B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  placeLabelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  userPin: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
})

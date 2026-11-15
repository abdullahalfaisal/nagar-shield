/**
 * Web-Mercator tile maths for the JS map fallback.
 *
 * Pure functions, so they are testable without rendering anything. A tile is
 * 256 px; at zoom `z` the world is `256 * 2^z` px wide.
 */
export const TILE_SIZE = 256

/** The highest latitude Web Mercator can represent. */
const MAX_LAT = 85.0511287798

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom
}

/** A position's pixel on the world map at `zoom`. */
export function lngLatToWorld(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const size = worldSize(zoom)
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)

  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}

/** The inverse of `lngLatToWorld`: the position of a world pixel at `zoom`. */
export function worldToLngLat(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const size = worldSize(zoom)
  const n = Math.PI - (2 * Math.PI * y) / size

  return {
    lng: (x / size) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  }
}

/** A drag and pinch in progress, as the screen sees it. */
export interface GestureOffset {
  /** How far the map has been dragged, in dp. */
  tx: number
  ty: number
  /** The pinch scale: 1 is unchanged, 2 is twice as close. */
  scale: number
}

/**
 * Where a finished drag and pinch leaves the map.
 *
 * While the fingers are down the map is only moved and scaled on screen. When
 * they lift, that offset is turned into a new centre and a whole zoom level,
 * and the tiles are laid out again at that level so they are sharp.
 *
 * The screen position of a map point `p` during the gesture is
 * `c + scale * (p - c) + t` (about the view centre `c`), so the point now under
 * the centre is `c - t / scale`.
 */
export function settleGesture(
  viewport: Viewport,
  gesture: GestureOffset,
  minZoom: number,
  maxZoom: number,
): { center: { lat: number; lng: number }; zoom: number } {
  const { center, zoom } = viewport
  const world = lngLatToWorld(center.lng, center.lat, zoom)
  const scale = gesture.scale > 0 ? gesture.scale : 1
  const target = worldToLngLat(world.x - gesture.tx / scale, world.y - gesture.ty / scale, zoom)
  const settledZoom = Math.max(minZoom, Math.min(maxZoom, Math.round(zoom + Math.log2(scale))))

  return { center: { lat: target.lat, lng: target.lng }, zoom: settledZoom }
}

export interface PlacedTile {
  key: string
  z: number
  x: number
  y: number
  /** Left edge inside the viewport, in dp. */
  left: number
  /** Top edge inside the viewport, in dp. */
  top: number
}

export interface Viewport {
  center: { lat: number; lng: number }
  zoom: number
  width: number
  height: number
}

/** The world pixel of the viewport's top-left corner. */
export function viewportOrigin({ center, zoom, width, height }: Viewport): {
  x: number
  y: number
} {
  const c = lngLatToWorld(center.lng, center.lat, zoom)
  return { x: c.x - width / 2, y: c.y - height / 2 }
}

/**
 * The tiles that cover the viewport, each with its position inside it.
 *
 * Longitude wraps around the antimeridian; latitude does not, so a row
 * outside the world is skipped.
 */
export function tilesForViewport(viewport: Viewport): PlacedTile[] {
  const { zoom, width, height } = viewport
  if (width <= 0 || height <= 0) return []

  const origin = viewportOrigin(viewport)
  const count = 2 ** zoom
  const firstX = Math.floor(origin.x / TILE_SIZE)
  const lastX = Math.floor((origin.x + width) / TILE_SIZE)
  const firstY = Math.floor(origin.y / TILE_SIZE)
  const lastY = Math.floor((origin.y + height) / TILE_SIZE)

  const tiles: PlacedTile[] = []
  for (let ty = firstY; ty <= lastY; ty += 1) {
    if (ty < 0 || ty >= count) continue
    for (let tx = firstX; tx <= lastX; tx += 1) {
      const wrapped = ((tx % count) + count) % count
      tiles.push({
        key: `${zoom}/${wrapped}/${ty}@${tx}`,
        z: zoom,
        x: wrapped,
        y: ty,
        left: tx * TILE_SIZE - origin.x,
        top: ty * TILE_SIZE - origin.y,
      })
    }
  }

  return tiles
}

/** A position's offset inside the viewport, in dp. */
export function project(
  position: { lat: number; lng: number },
  viewport: Viewport,
): { left: number; top: number } {
  const origin = viewportOrigin(viewport)
  const world = lngLatToWorld(position.lng, position.lat, viewport.zoom)
  return { left: world.x - origin.x, top: world.y - origin.y }
}

/**
 * The zoom at which a search radius fills about 150 dp of the map's half
 * width, so the area the list covers is the area the map shows. A fixed zoom
 * left a 5 km search as a dot in the middle of the screen, or a 100 m search
 * as a block of one tile.
 */
export function zoomForRadius(radiusKm: number, lat: number, min = 10, max = 18): number {
  const metres = Math.max(radiusKm, 0.05) * 1000
  const metresPerPixelAtZero = 156543.03 * Math.cos((lat * Math.PI) / 180)
  const zoom = Math.floor(Math.log2((metresPerPixelAtZero * 150) / metres))
  return Math.max(min, Math.min(max, zoom))
}

/**
 * The label a stacked pin shows: the report count, capped so a two-digit pin
 * never turns into a three-digit one.
 */
export function pinCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/** Whether at least half of the tiles in view have failed to load. */
export function mostTilesFailed(tileCount: number, failedCount: number): boolean {
  return tileCount > 0 && failedCount >= Math.ceil(tileCount / 2)
}

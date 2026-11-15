import {
  TILE_SIZE,
  lngLatToWorld,
  mostTilesFailed,
  project,
  settleGesture,
  tilesForViewport,
  worldSize,
  worldToLngLat,
  zoomForRadius,
} from './tileMap'

const DHAKA = { lat: 23.8103, lng: 90.4125 }

describe('lngLatToWorld', () => {
  it('puts (0, 0) in the middle of the world', () => {
    const point = lngLatToWorld(0, 0, 3)

    expect(point.x).toBeCloseTo(worldSize(3) / 2, 6)
    expect(point.y).toBeCloseTo(worldSize(3) / 2, 6)
  })

  it('puts the antimeridian at the edges', () => {
    expect(lngLatToWorld(-180, 0, 2).x).toBeCloseTo(0, 6)
    expect(lngLatToWorld(180, 0, 2).x).toBeCloseTo(worldSize(2), 6)
  })

  it('gives the standard tile for Dhaka at zoom 12', () => {
    // The slippy-map tile of 23.8103, 90.4125 at z12 is 3076 / 1768.
    const point = lngLatToWorld(DHAKA.lng, DHAKA.lat, 12)

    expect(Math.floor(point.x / TILE_SIZE)).toBe(3076)
    expect(Math.floor(point.y / TILE_SIZE)).toBe(1768)
  })

  it('clamps a latitude Mercator cannot represent', () => {
    expect(Number.isFinite(lngLatToWorld(0, 90, 4).y)).toBe(true)
  })
})

describe('tilesForViewport', () => {
  const viewport = { center: DHAKA, zoom: 12, width: 390, height: 320 }

  it('returns no tiles before the view has been measured', () => {
    expect(tilesForViewport({ ...viewport, width: 0 })).toEqual([])
  })

  it('covers the whole viewport', () => {
    const tiles = tilesForViewport(viewport)
    const left = Math.min(...tiles.map((t) => t.left))
    const right = Math.max(...tiles.map((t) => t.left + TILE_SIZE))
    const top = Math.min(...tiles.map((t) => t.top))
    const bottom = Math.max(...tiles.map((t) => t.top + TILE_SIZE))

    expect(left).toBeLessThanOrEqual(0)
    expect(right).toBeGreaterThanOrEqual(viewport.width)
    expect(top).toBeLessThanOrEqual(0)
    expect(bottom).toBeGreaterThanOrEqual(viewport.height)
  })

  it('uses unique keys', () => {
    const keys = tilesForViewport(viewport).map((t) => t.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('wraps longitude around the antimeridian and skips rows off the world', () => {
    const tiles = tilesForViewport({
      center: { lat: 0, lng: 179.9 },
      zoom: 2,
      width: 600,
      height: 400,
    })

    expect(tiles.every((t) => t.x >= 0 && t.x < 4)).toBe(true)
    expect(tiles.every((t) => t.y >= 0 && t.y < 4)).toBe(true)
  })
})

describe('project', () => {
  it('puts the centre in the middle of the viewport', () => {
    const viewport = { center: DHAKA, zoom: 12, width: 390, height: 320 }
    const point = project(DHAKA, viewport)

    expect(point.left).toBeCloseTo(195, 6)
    expect(point.top).toBeCloseTo(160, 6)
  })

  it('puts a point to the north-east up and to the right of the centre', () => {
    const viewport = { center: DHAKA, zoom: 12, width: 390, height: 320 }
    const point = project({ lat: DHAKA.lat + 0.01, lng: DHAKA.lng + 0.01 }, viewport)

    expect(point.left).toBeGreaterThan(195)
    expect(point.top).toBeLessThan(160)
  })
})

describe('zoomForRadius', () => {
  it('zooms out as the radius grows', () => {
    expect(zoomForRadius(1, DHAKA.lat)).toBe(14)
    expect(zoomForRadius(5, DHAKA.lat)).toBe(12)
    expect(zoomForRadius(0.5, DHAKA.lat)).toBeGreaterThan(zoomForRadius(5, DHAKA.lat))
  })

  it('stays inside the zoom range', () => {
    expect(zoomForRadius(50, DHAKA.lat)).toBe(10)
    expect(zoomForRadius(0.001, DHAKA.lat)).toBe(18)
  })
})

describe('mostTilesFailed', () => {
  it('is false with no tiles, so a map still loading is not "unreachable"', () => {
    expect(mostTilesFailed(0, 0)).toBe(false)
  })

  it('is true once half of the tiles failed, and clears when they recover', () => {
    expect(mostTilesFailed(6, 2)).toBe(false)
    expect(mostTilesFailed(6, 3)).toBe(true)
    expect(mostTilesFailed(6, 0)).toBe(false)
  })
})

describe('worldToLngLat', () => {
  it('is the inverse of lngLatToWorld', () => {
    const world = lngLatToWorld(DHAKA.lng, DHAKA.lat, 14)
    const back = worldToLngLat(world.x, world.y, 14)
    expect(back.lng).toBeCloseTo(DHAKA.lng, 6)
    expect(back.lat).toBeCloseTo(DHAKA.lat, 6)
  })
})

describe('settleGesture', () => {
  const viewport = { center: DHAKA, zoom: 14, width: 360, height: 300 }

  it('leaves the map where it was when nothing moved', () => {
    const result = settleGesture(viewport, { tx: 0, ty: 0, scale: 1 }, 10, 18)
    expect(result.zoom).toBe(14)
    expect(result.center.lat).toBeCloseTo(DHAKA.lat, 6)
    expect(result.center.lng).toBeCloseTo(DHAKA.lng, 6)
  })

  it('moves the centre west when the map is dragged to the right', () => {
    const result = settleGesture(viewport, { tx: 120, ty: 0, scale: 1 }, 10, 18)
    expect(result.center.lng).toBeLessThan(DHAKA.lng)
    expect(result.center.lat).toBeCloseTo(DHAKA.lat, 6)
  })

  it('moves the centre north when the map is dragged down', () => {
    const result = settleGesture(viewport, { tx: 0, ty: 120, scale: 1 }, 10, 18)
    expect(result.center.lat).toBeGreaterThan(DHAKA.lat)
  })

  it('turns a pinch into the nearest whole zoom level', () => {
    expect(settleGesture(viewport, { tx: 0, ty: 0, scale: 2 }, 10, 18).zoom).toBe(15)
    expect(settleGesture(viewport, { tx: 0, ty: 0, scale: 0.5 }, 10, 18).zoom).toBe(13)
    expect(settleGesture(viewport, { tx: 0, ty: 0, scale: 1.2 }, 10, 18).zoom).toBe(14)
  })

  it('keeps the zoom inside the limits', () => {
    expect(settleGesture(viewport, { tx: 0, ty: 0, scale: 16 }, 10, 18).zoom).toBe(18)
    expect(settleGesture(viewport, { tx: 0, ty: 0, scale: 0.05 }, 10, 18).zoom).toBe(10)
  })

  it('treats a zero scale as unchanged', () => {
    expect(settleGesture(viewport, { tx: 0, ty: 0, scale: 0 }, 10, 18).zoom).toBe(14)
  })
})

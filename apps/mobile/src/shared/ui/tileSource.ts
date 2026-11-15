/**
 * The map's one tile source.
 *
 * Every map surface (the native MapLibre map and the JS tile fallback) reads
 * the tile URL and the attribution from here, so changing provider is one
 * environment variable, and no surface can keep an old URL.
 *
 * **There is no default provider, on purpose.** Free public tile servers do not
 * serve applications: `tile.openstreetmap.org` answers with a "403 Access
 * blocked" tile, and CARTO's keyless basemap now answers every request with an
 * "API KEY REQUIRED" tile — both with HTTP 200, so a status check cannot tell a
 * real tile from a refusal. Shipping either as a default puts a refusal
 * message on the map.
 *
 * With no source configured the maps draw the markers over a plain background
 * and say the tiles are unavailable; the list under the map stays complete.
 * To turn the map on, set `EXPO_PUBLIC_MAP_TILE_URL` to a tile URL template
 * from a provider you hold an account with (MapTiler, Stadia Maps, ...) or to
 * tiles the project hosts, and `EXPO_PUBLIC_MAP_ATTRIBUTION` to the text that
 * provider requires. See `.env.example`.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` only when it is written out in full,
 * so the two reads below must stay as they are.
 */
export const TILE_URL_TEMPLATE: string | null = process.env.EXPO_PUBLIC_MAP_TILE_URL || null

export const TILE_ATTRIBUTION: string =
  process.env.EXPO_PUBLIC_MAP_ATTRIBUTION || '© OpenStreetMap contributors'

/** Whether a tile source is configured at all. */
export const HAS_TILE_SOURCE: boolean = TILE_URL_TEMPLATE !== null

/** The URL of one tile. Only meaningful when `HAS_TILE_SOURCE` is true. */
export function tileUrl(z: number, x: number, y: number): string {
  return (TILE_URL_TEMPLATE ?? '')
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

import { z } from 'zod';
import stationsPayload from './stations.json';
import hotlinesPayload from './hotlines.json';

/**
 * The curated reference data.
 *
 * These JSON files are the single source of truth. The mobile bundle ships
 * them verbatim (the offline dial path must work with no network), and the
 * Postgres mirror is regenerated from them by
 * `tools/mirror-reference-data.cjs`. A release can therefore never ship a
 * bundle that disagrees with the server.
 *
 * The `$comment` key is a build-time note for the curator. It is stripped
 * here so it never reaches the bundle payload.
 */

export const stationEntrySchema = z.object({
  id: z.string().min(1),
  stationType: z.enum(['police', 'hospital', 'fire']),
  name: z.string().min(1),
  nameBn: z.string().nullable(),
  phone: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
  isActive: z.boolean(),
});

export const hotlineEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameBn: z.string().nullable(),
  phone: z.string().min(1),
  category: z.string().min(1),
  description: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  lastVerifiedAt: z.string(),
});

export type StationEntry = z.infer<typeof stationEntrySchema>;
export type HotlineEntry = z.infer<typeof hotlineEntrySchema>;

const stationsPayloadSchema = z.object({
  version: z.string(),
  lastVerifiedAt: z.string(),
  stations: z.array(stationEntrySchema),
});

const hotlinesPayloadSchema = z.object({
  version: z.string(),
  lastVerifiedAt: z.string(),
  hotlines: z.array(hotlineEntrySchema),
});

/**
 * The payload is validated at module load. A malformed dataset must fail the
 * build, not surface as a runtime error on a user's phone.
 */
const parsedStations = stationsPayloadSchema.parse(stationsPayload);
const parsedHotlines = hotlinesPayloadSchema.parse(hotlinesPayload);

export const REFERENCE_DATA_VERSION = parsedStations.version;

export const STATIONS: readonly StationEntry[] = Object.freeze(
  parsedStations.stations.filter((station) => station.isActive),
);

export const HOTLINES: readonly HotlineEntry[] = Object.freeze(
  [...parsedHotlines.hotlines].sort((a, b) => a.sortOrder - b.sortOrder),
);

/**
 * The emergency numbers rendered on the Help Alert cards.
 *
 * These are **locked product facts** (PRD A-7), not dataset entries:
 *   * Police  = 999
 *   * Medical = 999
 *   * Fire    = 102
 *
 * The station dataset carries a `fire` row for the Find-a-station map only.
 * The Fire help card always prefills 102 and never a station number.
 */
export const EMERGENCY_NUMBERS = {
  police: '999',
  medical: '999',
  fire: '102',
} as const;

/**
 * The FR-SEEK-3 fallback: with no police station inside the radius the call
 * routes to 999.
 */
export const SEEK_FALLBACK_NUMBER = '999';

/**
 * The prototype's More Help sheet — six rows, 1:1. The sheet is a flat list,
 * not three categories (FR-SEEK-1 names three categories; the prototype ships
 * six rows, and the build keeps all six).
 */
export const MORE_HELP_ROWS = [
  { id: 'hl-women-children', phone: '109' },
  { id: 'hl-disaster', phone: '333' },
  { id: 'hl-ambulance', phone: '999' },
  { id: 'hl-electricity', phone: '16116' },
] as const;

/** Looks a station up by its curated slug. */
export function findStation(id: string): StationEntry | undefined {
  return STATIONS.find((station) => station.id === id);
}

/** Looks a hotline up by its curated slug. */
export function findHotline(id: string): HotlineEntry | undefined {
  return HOTLINES.find((hotline) => hotline.id === id);
}

/**
 * The haversine distance in kilometres.
 *
 * Used for the station map and the 10 km fallback. The same rule is enforced
 * server-side by the `nearest_thana` RPC — this copy exists so the offline
 * path can rank stations without a network call.
 */
export function distanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The active stations within `radiusKm` of a coordinate, nearest first. */
export function stationsWithin(
  lat: number,
  lng: number,
  radiusKm: number,
): Array<StationEntry & { distanceKm: number }> {
  return STATIONS.map((station) => ({
    ...station,
    distanceKm: distanceKm(lat, lng, station.lat, station.lng),
  }))
    .filter((station) => station.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

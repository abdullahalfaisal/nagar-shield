import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AreaHierarchy } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'
import { toBengaliDigits } from '@/shared/utils/relativeTime'

export interface GeocodeResult extends AreaHierarchy {
  lat: number
  lng: number
  accuracyM: number | null
  /** `local` = the Dhaka-local table, `nominatim` = the online fallback. */
  source: 'local' | 'nominatim' | 'unknown'
}

/**
 * Reverse-geocode a coordinate.
 *
 * Resolution order (waiver W-3 — Dhaka-local geocode first):
 *   1. the `geocode_cache` table (nearest rounded coordinate)
 *   2. the server-side `reverse_geocode` RPC, which consults the Dhaka-local
 *      table and falls back to the allowlisted Nominatim lookup
 *   3. a degraded result with the coordinate only — **never** a fabricated
 *      street address
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  accuracyM: number | null = null,
): Promise<GeocodeResult> {
  const { data, error } = await supabase.rpc('reverse_geocode', {
    p_lat: lat,
    p_lng: lng,
  })

  if (error) {
    // A missing geocode is not a hard failure — degrade to the coordinate.
    if (!fromSupabaseError(error)) throw error
    return {
      lat,
      lng,
      accuracyM,
      division: '',
      city: '',
      thana: '',
      source: 'unknown',
    }
  }

  return parseReverseGeocode(data, lat, lng, accuracyM)
}

type AreaLevels = Partial<Pick<GeocodeResult, 'division' | 'city' | 'thana' | 'neighborhood'>>

/**
 * Reads the `reverse_geocode` RPC's answer.
 *
 * The RPC answers `{ source, area_hierarchy: { division, city, thana,
 * neighborhood } }`. This used to read the levels off the top of the object,
 * where they are not, so every lookup came back empty: Capture sat on "Getting
 * your location…" and Location sharing said there was no address, for places
 * the server had in fact resolved. A flat row is still read, in case the RPC is
 * ever changed to return one.
 */
export function parseReverseGeocode(
  data: unknown,
  lat: number,
  lng: number,
  accuracyM: number | null,
): GeocodeResult {
  const row = (data ?? {}) as AreaLevels & {
    source?: GeocodeResult['source']
    area_hierarchy?: AreaLevels | null
  }
  const area: AreaLevels = row.area_hierarchy ?? row

  return {
    lat,
    lng,
    accuracyM,
    division: area.division ?? '',
    city: area.city ?? '',
    thana: area.thana ?? '',
    neighborhood: area.neighborhood ?? undefined,
    source: row.source ?? 'local',
  }
}

export function useReverseGeocode(
  lat: number | null,
  lng: number | null,
  accuracyM: number | null = null,
): UseQueryResult<GeocodeResult | null, Error> {
  return useQuery({
    queryKey: ['geocode', lat, lng],
    queryFn: () => reverseGeocode(lat as number, lng as number, accuracyM),
    enabled: lat !== null && lng !== null,
    staleTime: 5 * 60_000,
    retry: 0,
  })
}

/** Formats a coordinate pair the way the prototype does: `23.7806° N, 90.4066° E`. */
export function formatCoordinates(lat: number, lng: number, locale?: string): string {
  const latHemisphere = lat >= 0 ? 'N' : 'S'
  const lngHemisphere = lng >= 0 ? 'E' : 'W'
  const text = `${Math.abs(lat).toFixed(4)}° ${latHemisphere}, ${Math.abs(lng).toFixed(4)}° ${lngHemisphere}`
  // Digits follow the app's language; the hemisphere letters stay as printed on maps.
  return locale === 'bn' ? toBengaliDigits(text) : text
}

/** The short form for a screen: `23.746, 90.374`, no hemisphere letters. */
export function formatCoordinatesShort(lat: number, lng: number, locale?: string): string {
  const text = `${lat.toFixed(3)}, ${lng.toFixed(3)}`
  return locale === 'bn' ? toBengaliDigits(text) : text
}

/**
 * Joins the non-empty parts of an area hierarchy into one readable line.
 *
 * `translate` puts each stored (English) name into the app's language — see
 * `areaNameTranslator`.
 */
export function formatAddressLine(
  area: Partial<AreaHierarchy> | null | undefined,
  translate: (name: string) => string = (name) => name,
): string {
  if (!area) return ''
  const parts = [area.neighborhood, area.thana, area.city, area.division]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => translate(part.trim()))
  // De-duplicate while preserving order — a city that repeats the division
  // should not read "Dhaka · Dhaka".
  return parts.filter((part, index) => parts.indexOf(part) === index).join(', ')
}

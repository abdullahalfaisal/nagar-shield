import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AreaHierarchy } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

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

  const row = (data ?? {}) as Partial<GeocodeResult>

  return {
    lat,
    lng,
    accuracyM,
    division: row.division ?? '',
    city: row.city ?? '',
    thana: row.thana ?? '',
    neighborhood: row.neighborhood ?? undefined,
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
export function formatCoordinates(lat: number, lng: number): string {
  const latHemisphere = lat >= 0 ? 'N' : 'S'
  const lngHemisphere = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${latHemisphere}, ${Math.abs(lng).toFixed(4)}° ${lngHemisphere}`
}

/** Joins the non-empty parts of an area hierarchy into one readable line. */
export function formatAddressLine(area: Partial<AreaHierarchy> | null | undefined): string {
  if (!area) return ''
  const parts = [area.neighborhood, area.thana, area.city, area.division].filter(
    (part): part is string => Boolean(part && part.trim()),
  )
  // De-duplicate while preserving order — a city that repeats the division
  // should not read "Dhaka · Dhaka".
  return parts.filter((part, index) => parts.indexOf(part) === index).join(', ')
}

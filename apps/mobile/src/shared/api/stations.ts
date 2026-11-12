import { useQuery } from '@tanstack/react-query';
import { STATIONS, type StationEntry } from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

/**
 * The nearest police station within the 10 km radius.
 *
 * The fallback decision is made in **exactly one place** — the `nearest_thana`
 * RPC. It returns the fallback row (`fallback = true`, `phone = '999'`) when
 * nothing is inside the radius, and the client must not substitute a number
 * on its own.
 */
export interface NearestThana {
  id: string | null;
  name: string | null;
  nameBn: string | null;
  phone: string | null;
  distanceKm: number | null;
  /** True when no station was within the radius and the call routes to 999. */
  fallback: boolean;
}

export async function fetchNearestThana(
  lat: number,
  lng: number,
  radiusKm = 10,
): Promise<NearestThana> {
  const { data, error } = await supabase.rpc('nearest_thana', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  });

  if (error) throw fromSupabaseError(error);

  const rows = (data ?? []) as Array<{
    id: string | null;
    name: string | null;
    name_bn: string | null;
    phone: string | null;
    distance_km: number | null;
    fallback: boolean;
  }>;

  const row = rows[0];

  if (!row) {
    return { id: null, name: null, nameBn: null, phone: '999', distanceKm: null, fallback: true };
  }

  return {
    id: row.id,
    name: row.name,
    nameBn: row.name_bn,
    phone: row.phone ?? '999',
    distanceKm: typeof row.distance_km === 'number' ? row.distance_km : null,
    fallback: Boolean(row.fallback),
  };
}

export function useNearestThana(
  lat: number | null,
  lng: number | null,
  radiusKm = 10,
) {
  return useQuery({
    queryKey: ['nearest-thana', lat, lng, radiusKm],
    queryFn: () => fetchNearestThana(lat as number, lng as number, radiusKm),
    enabled: lat !== null && lng !== null,
    // The station list changes on a quarterly refresh, so the lookup is cached
    // for the session.
    staleTime: 15 * 60_000,
    retry: 0,
  });
}

/**
 * The **bundled** station list.
 *
 * The curated JSON in `packages/shared` is the source of truth and it ships in
 * the app bundle, so the Find-a-station list renders with no network at all.
 */
export function bundledStations(): readonly StationEntry[] {
  return STATIONS;
}

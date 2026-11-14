/**
 * The area resolver — the server-side `area_hierarchy` resolution.
 *
 * The order is fixed and load-bearing (waiver W-3 / FR-CAPTURE-4):
 *
 *   1. `area_lookup` — the curated Dhaka-local nearest-centroid lookup. This
 *      is the **primary** source and it runs inside the `reverse_geocode` RPC.
 *   2. `geocode_cache` — the resolved hierarchy for a rounded coordinate key.
 *      Also inside the RPC.
 *   3. The online Nominatim-compatible backup — **cache-miss only**, one
 *      attempt, a short timeout, and only the allowlisted host.
 *   4. Graceful degrade — `division = 'Dhaka'`, `city = 'Dhaka'`, an unknown
 *      thana. The submit still succeeds.
 *
 * The submit never blocks on the geocoder: the local resolution is
 * synchronous, the online call is attempted once with a tight timeout, and a
 * failure degrades rather than fails.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolvedArea {
  division: string | null
  city: string | null
  thana: string | null
  neighborhood: string | null
}

export type GeocodeSource = 'local' | 'online' | 'degraded'

export interface AreaResolution {
  area: ResolvedArea
  source: GeocodeSource
}

/** The degraded hierarchy — never a fabricated thana. */
export const DEGRADED_AREA: ResolvedArea = {
  division: 'Dhaka',
  city: 'Dhaka',
  thana: null,
  neighborhood: null,
}

/** The online backup is attempted at most this often per minute, per instance. */
const ONLINE_REQUESTS_PER_MINUTE = 10
const ONLINE_TIMEOUT_MS = 2500

let onlineCallsThisMinute = 0
let onlineWindowStartedAt = 0

/** The per-instance limiter — a burst of cache misses cannot flood the host. */
function onlineCallAllowed(): boolean {
  const now = Date.now()
  if (now - onlineWindowStartedAt >= 60_000) {
    onlineWindowStartedAt = now
    onlineCallsThisMinute = 0
  }
  if (onlineCallsThisMinute >= ONLINE_REQUESTS_PER_MINUTE) return false
  onlineCallsThisMinute += 1
  return true
}

/** The allowlisted base URL. There is no user-supplied host — that is the point. */
function geocodeBaseUrl(): URL | null {
  const raw = Deno.env.get('GEOCODE_BASE_URL')
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** Maps a Nominatim-compatible payload onto the four-level hierarchy. */
export function parseOnlineGeocode(payload: unknown): ResolvedArea | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as {
    address?: Record<string, string | undefined>
    display_name?: string
  }
  const address = record.address ?? {}

  const thana = address.city_district ?? address.suburb ?? address.county ?? address.city ?? null
  const city = address.city ?? address.state ?? 'Dhaka'
  const division = address.state ?? 'Dhaka'
  const neighborhood = address.neighbourhood ?? address.quarter ?? address.village ?? null

  if (!thana) return null

  return {
    division: division || 'Dhaka',
    city: city || 'Dhaka',
    thana,
    neighborhood,
  }
}

/**
 * Resolves the area for a coordinate.
 *
 * `client` must be the **user** client: the `reverse_geocode` RPC reads
 * `auth.uid()`-independent data but it is granted to `anon` / `authenticated`
 * and the service role bypasses it cleanly too. Either client works for the
 * read; the cache **write** uses the service client.
 */
export async function resolveArea(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  lat: number,
  lng: number,
): Promise<AreaResolution> {
  const { data, error } = await userClient.rpc('reverse_geocode', {
    p_lat: lat,
    p_lng: lng,
  })

  if (!error && data && typeof data === 'object') {
    const record = data as { area_hierarchy?: Record<string, unknown>; source?: string }
    const source = record.source

    if (source === 'local' || source === 'online') {
      return {
        area: normaliseArea(record.area_hierarchy),
        source,
      }
    }
  }

  // The local resolution missed — attempt the online backup once.
  const online = await resolveOnline(userClient, serviceClient, lat, lng)
  if (online) return online

  return { area: { ...DEGRADED_AREA }, source: 'degraded' }
}

/** The cache-miss-only online backup. A failure returns `null` — never throws. */
async function resolveOnline(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  lat: number,
  lng: number,
): Promise<AreaResolution | null> {
  const base = geocodeBaseUrl()
  if (!base) return null
  if (!onlineCallAllowed()) return null

  const url = new URL('reverse', base)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('format', 'jsonv2')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      redirect: 'error',
    })
    if (!response.ok) return null

    const area = parseOnlineGeocode(await response.json())
    if (!area) return null

    // The cache write belongs to the capture path, never to the cleanup job.
    await serviceClient.from('geocode_cache').upsert(
      {
        key: await cacheKey(userClient, lat, lng),
        area_hierarchy: area,
        source: 'online',
        last_hit_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )

    return { area, source: 'online' }
  } catch {
    // A geocoder failure is never a submit failure — it degrades.
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** The rounded-coordinate cache key, computed by the database. */
async function cacheKey(client: SupabaseClient, lat: number, lng: number): Promise<string> {
  const { data } = await client.rpc('geocode_key', { p_lat: lat, p_lng: lng })
  return typeof data === 'string' ? data : `${lat}_${lng}`
}

/** Normalises a hierarchy document coming back from the database. */
export function normaliseArea(raw: unknown): ResolvedArea {
  if (!raw || typeof raw !== 'object') return { ...DEGRADED_AREA }

  const record = raw as Record<string, unknown>
  const text = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return {
    division: text(record.division) ?? 'Dhaka',
    city: text(record.city) ?? 'Dhaka',
    thana: text(record.thana),
    neighborhood: text(record.neighborhood),
  }
}

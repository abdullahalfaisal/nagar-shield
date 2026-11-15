import { useCurrentFix } from '@/shared/services/location'
import { useReverseGeocode } from '@/shared/api/geocode'
import { useAreaName } from '@/shared/api/areas'

/** What the Home header can say about where the user is. */
export type HomeAreaStatus = 'locating' | 'ready' | 'off' | 'unavailable' | 'unknown'

export interface HomeArea {
  status: HomeAreaStatus
  /** The short place name; empty unless `status` is `ready`. */
  label: string
  /** Tries the fix again. */
  retry: () => void
}

/**
 * The place line for the Home header: the neighbourhood (or thana) and the
 * city, e.g. "Dhanmondi, Dhaka".
 *
 * Two levels, not four: it sits in a header next to two buttons, and the
 * neighbourhood plus the city is enough to tell the user the app has the right
 * place. A level that repeats the one before it is dropped, so a city that is
 * also the division never reads "Dhaka, Dhaka".
 */
export function shortAreaLine(
  area: {
    neighborhood?: string | null
    thana?: string | null
    city?: string | null
    division?: string | null
  },
  translate: (name: string) => string = (name) => name,
): string {
  const clean = (value: string | null | undefined) => (value ?? '').trim()
  const local = clean(area.neighborhood) || clean(area.thana)
  const wide = clean(area.city) || clean(area.division)
  const parts = [local, wide].filter((part) => part.length > 0).map(translate)
  return parts.filter((part, index) => parts.indexOf(part) === index).join(', ')
}

/**
 * Reads the fix the user already gave permission for, and names the area.
 *
 * It never asks for the permission: that belongs to the screens that need a
 * precise fix (Capture, History), and to onboarding. With the permission off,
 * the header says so instead of guessing a place.
 */
export function useHomeArea(): HomeArea {
  const { state, refresh } = useCurrentFix({ requestPermission: false })
  const areaName = useAreaName()
  const fix = state.status === 'ready' ? state.fix : null
  const geocode = useReverseGeocode(fix?.lat ?? null, fix?.lng ?? null, fix?.accuracyM ?? null)

  if (state.status === 'denied') return { status: 'off', label: '', retry: refresh }
  if (state.status === 'unavailable') return { status: 'unavailable', label: '', retry: refresh }
  if (state.status !== 'ready' || geocode.isLoading) {
    return { status: 'locating', label: '', retry: refresh }
  }

  const label = geocode.data ? shortAreaLine(geocode.data, areaName) : ''
  return label
    ? { status: 'ready', label, retry: refresh }
    : { status: 'unknown', label: '', retry: refresh }
}

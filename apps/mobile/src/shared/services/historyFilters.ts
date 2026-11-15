import {
  HISTORY_DEFAULT_WINDOW_HOURS,
  REPORT_CATEGORIES,
  type ReportCategory,
} from '@nagar-shield/shared'

/**
 * The History filter state — one object, one source of truth.
 *
 * `006-alerts / 007-history-filters` AC #8 — "the radius, the window, and the
 * category are all part of the **query key**, so a different filter combination
 * produces a different cache entry and the cache never serves the wrong page".
 *
 * The same object drives three things, and they must never disagree:
 *
 *   * the sheet's draft (a copy the user edits),
 *   * the query key (which selects the cache entry), and
 *   * the RPC arguments (which select the rows).
 *
 * The sheet edits a **draft** and commits it on confirm, so a cancelled sheet
 * changes nothing at all (AC #10 — "the active filters, the applied query, and
 * the rendered list are all unchanged").
 */

/** One History filter set. */
export interface HistoryFilters {
  /** The radius in kilometres — the wire unit of `history_nearby`'s `radius_km`. */
  radiusKm: number
  /** The window in hours — the wire unit of `history_nearby`'s `window_hours`. */
  windowHours: number
  /** `null` means "no category filter", which is **not** the same as `'other'`. */
  category: ReportCategory | null
  /**
   * An area the person chose to look at, by its `area_lookup` id. `null` means
   * "around my location". An area replaces the phone's position as the centre of
   * the radius, so the same radius, window and type filters apply to it.
   */
  areaId: string | null
}

/** The radius options — 500 m, 1 km, 2 km, 5 km, 10 km, 15 km. */
export const HISTORY_RADIUS_OPTIONS = [0.5, 1, 2, 5, 10, 15] as const

/** The window options — 1 h, 24 h, 7 d, 30 d. */
export const HISTORY_WINDOW_OPTIONS = [1, 24, 168, 720] as const

/**
 * The filter set a cold launch uses.
 *
 * The radius opens at the **widest option the sheet offers**, not the shared
 * `HISTORY_DEFAULT_RADIUS_KM` (which stays the *server's* fallback for a
 * caller that omits the parameter). A 1 km cold launch over a quiet hour
 * reads as "nothing is happening anywhere"; the widest radius opens on the
 * full picture the data can give, and narrowing is one tap away in the
 * sheet. The window stays the shared 24 h default.
 *
 * The reset action restores exactly these values; an empty filter set is not
 * a legal configuration (AC #7).
 */
export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  radiusKm: Math.max(...HISTORY_RADIUS_OPTIONS),
  windowHours: HISTORY_DEFAULT_WINDOW_HOURS,
  category: null,
  areaId: null,
}

/**
 * The category options — the fixed 11-value enum.
 *
 * One vocabulary: this is the same list the author can set from the report
 * detail. A second list is how two screens start disagreeing about what
 * "accident" means.
 */
export const HISTORY_CATEGORY_OPTIONS = REPORT_CATEGORIES

/**
 * The order the incident types are shown in, in the filter sheet and in the
 * summary: everyday crimes, then emergencies, then the rest. Fixed, so the two
 * places never disagree and the grid does not reshuffle with the data.
 */
export const HISTORY_TYPE_ORDER = [
  'theft',
  'robbery',
  'assault',
  'harassment',
  'fraud',
  'vandalism',
  'fire',
  'medical',
  'accident',
  'suspicious',
  'other',
] as const satisfies readonly (typeof REPORT_CATEGORIES)[number][]

/** Restores the defaults. The reset action, and the cold-launch state. */
export function resetHistoryFilters(): HistoryFilters {
  return { ...DEFAULT_HISTORY_FILTERS }
}

/**
 * Whether two filter sets are the same.
 *
 * The sheet's confirm action uses this to avoid a needless re-query: selecting
 * the radius that is already active is not a change (AC — "the sheet may close
 * without re-querying, and the result set is identical").
 */
export function historyFiltersEqual(a: HistoryFilters, b: HistoryFilters): boolean {
  return (
    a.radiusKm === b.radiusKm &&
    a.windowHours === b.windowHours &&
    a.category === b.category &&
    a.areaId === b.areaId
  )
}

/**
 * The **query key** for a filter set.
 *
 * The key is a plain object so React Query can compare it structurally. Every
 * component that reads History — the list, the totals, the distribution, the
 * map — uses the same key, so a filter change is reflected everywhere at once
 * and no surface can serve a page from a stale filter (AC #8).
 */
export function historyQueryKey(
  origin: { lat: number; lng: number },
  filters: HistoryFilters,
): {
  lat: number
  lng: number
  radiusKm: number
  windowHours: number
  category: ReportCategory | null
} {
  return {
    lat: origin.lat,
    lng: origin.lng,
    radiusKm: filters.radiusKm,
    windowHours: filters.windowHours,
    category: filters.category,
  }
}

import {
  HISTORY_DEFAULT_RADIUS_KM,
  HISTORY_DEFAULT_WINDOW_HOURS,
  REPORT_CATEGORIES,
  type ReportCategory,
} from '@nagar-shield/shared';

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
  radiusKm: number;
  /** The window in hours — the wire unit of `history_nearby`'s `window_hours`. */
  windowHours: number;
  /** `null` means "no category filter", which is **not** the same as `'other'`. */
  category: ReportCategory | null;
}

/**
 * The filter set a cold launch uses.
 *
 * FR-HIST-1 — 1 km, 24 h, no category. The reset action restores exactly
 * these values; an empty filter set is not a legal configuration (AC #7).
 */
export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  radiusKm: HISTORY_DEFAULT_RADIUS_KM,
  windowHours: HISTORY_DEFAULT_WINDOW_HOURS,
  category: null,
};

/** The radius options — 500 m, 1 km, 2 km, 5 km. */
export const HISTORY_RADIUS_OPTIONS = [0.5, 1, 2, 5] as const;

/** The window options — 1 h, 24 h, 7 d, 30 d. */
export const HISTORY_WINDOW_OPTIONS = [1, 24, 168, 720] as const;

/**
 * The category options — the fixed 11-value enum.
 *
 * One vocabulary: this is the same list the author can set from the report
 * detail. A second list is how two screens start disagreeing about what
 * "accident" means.
 */
export const HISTORY_CATEGORY_OPTIONS = REPORT_CATEGORIES;

/** Restores the defaults. The reset action, and the cold-launch state. */
export function resetHistoryFilters(): HistoryFilters {
  return { ...DEFAULT_HISTORY_FILTERS };
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
    a.category === b.category
  );
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
  lat: number;
  lng: number;
  radiusKm: number;
  windowHours: number;
  category: ReportCategory | null;
} {
  return {
    lat: origin.lat,
    lng: origin.lng,
    radiusKm: filters.radiusKm,
    windowHours: filters.windowHours,
    category: filters.category,
  };
}

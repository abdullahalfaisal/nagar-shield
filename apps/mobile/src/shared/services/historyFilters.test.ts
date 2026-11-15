import { HISTORY_DEFAULT_WINDOW_HOURS, REPORT_CATEGORIES } from '@nagar-shield/shared'
import {
  DEFAULT_HISTORY_FILTERS,
  HISTORY_CATEGORY_OPTIONS,
  HISTORY_RADIUS_OPTIONS,
  HISTORY_TYPE_ORDER,
  HISTORY_WINDOW_OPTIONS,
  historyFiltersEqual,
  historyQueryKey,
  resetHistoryFilters,
  type HistoryFilters,
} from './historyFilters'

/**
 * The History filters.
 *
 * `006-alerts / 007-history-filters`.
 *
 * The filter object is the single source of truth for three things that must
 * never disagree: the sheet's draft, the query key, and the RPC arguments.
 * The tests below pin the mapping, the defaults (the widest offered radius,
 * the shared 24 h window), and the reset action.
 */

const ORIGIN = { lat: 23.8103, lng: 90.4125 }

describe('the default History filters', () => {
  it('open at the widest radius the sheet offers, with the shared 24 h window', () => {
    expect(DEFAULT_HISTORY_FILTERS.radiusKm).toBe(Math.max(...HISTORY_RADIUS_OPTIONS))
    expect(DEFAULT_HISTORY_FILTERS.radiusKm).toBe(15)
    expect(DEFAULT_HISTORY_FILTERS.windowHours).toBe(24)
    expect(DEFAULT_HISTORY_FILTERS.category).toBeNull()
  })

  it('derive the radius from the option list, not a copy of it', () => {
    expect(DEFAULT_HISTORY_FILTERS.radiusKm).toBe(Math.max(...HISTORY_RADIUS_OPTIONS))
    expect(DEFAULT_HISTORY_FILTERS.windowHours).toBe(HISTORY_DEFAULT_WINDOW_HOURS)
  })

  it('reset restores them', () => {
    const dirty: HistoryFilters = {
      radiusKm: 0.5,
      windowHours: 720,
      category: 'fire',
      areaId: 'area-1',
    }

    expect(resetHistoryFilters()).toEqual(DEFAULT_HISTORY_FILTERS)
    expect(resetHistoryFilters()).not.toBe(dirty)
  })

  it('resets to a fresh object each time, so a caller cannot corrupt the default', () => {
    const first = resetHistoryFilters()
    first.radiusKm = 99

    expect(resetHistoryFilters().radiusKm).toBe(15)
    expect(DEFAULT_HISTORY_FILTERS.radiusKm).toBe(15)
  })
})

describe('the filter options', () => {
  it('offer six radii, from the 500 m one to the 15 km one', () => {
    expect([...HISTORY_RADIUS_OPTIONS]).toEqual([0.5, 1, 2, 5, 10, 15])
  })

  it('offer four windows, in hours', () => {
    expect([...HISTORY_WINDOW_OPTIONS]).toEqual([1, 24, 168, 720])
  })

  it('offer exactly the shared category vocabulary', () => {
    expect([...HISTORY_CATEGORY_OPTIONS]).toEqual([...REPORT_CATEGORIES])
  })
})

describe('comparing two filter sets', () => {
  const base: HistoryFilters = {
    radiusKm: 1,
    windowHours: 24,
    category: null,
    areaId: null,
  }

  it('says two identical sets are equal', () => {
    expect(historyFiltersEqual(base, { ...base })).toBe(true)
  })

  it('says a different radius is a change', () => {
    expect(historyFiltersEqual(base, { ...base, radiusKm: 2 })).toBe(false)
  })

  it('says a different window is a change', () => {
    expect(historyFiltersEqual(base, { ...base, windowHours: 168 })).toBe(false)
  })

  it('says a different category is a change', () => {
    expect(historyFiltersEqual(base, { ...base, category: 'fire' })).toBe(false)
  })

  it('distinguishes no category from the "other" category', () => {
    expect(historyFiltersEqual(base, { ...base, category: 'other' })).toBe(false)
  })

  it('treats a chosen area as a different filter set', () => {
    expect(historyFiltersEqual(base, { ...base, areaId: 'area-1' })).toBe(false)
    expect(historyFiltersEqual({ ...base, areaId: 'area-1' }, { ...base, areaId: 'area-1' })).toBe(
      true,
    )
  })
})

describe('the query key', () => {
  const filters: HistoryFilters = {
    radiusKm: 2,
    windowHours: 168,
    category: 'fire',
    areaId: null,
  }

  it('carries the origin and every filter', () => {
    expect(historyQueryKey(ORIGIN, filters)).toEqual({
      lat: 23.8103,
      lng: 90.4125,
      radiusKm: 2,
      windowHours: 168,
      category: 'fire',
    })
  })

  it('changes when a filter changes, so the cache cannot serve a stale page', () => {
    const base = historyQueryKey(ORIGIN, DEFAULT_HISTORY_FILTERS)

    expect(historyQueryKey(ORIGIN, { ...filters })).not.toEqual(base)
    expect(historyQueryKey(ORIGIN, { ...DEFAULT_HISTORY_FILTERS, radiusKm: 2 })).not.toEqual(base)
    expect(historyQueryKey(ORIGIN, { ...DEFAULT_HISTORY_FILTERS, windowHours: 168 })).not.toEqual(
      base,
    )
    expect(historyQueryKey(ORIGIN, { ...DEFAULT_HISTORY_FILTERS, category: 'fire' })).not.toEqual(
      base,
    )
  })

  it('changes when the origin changes', () => {
    const base = historyQueryKey(ORIGIN, DEFAULT_HISTORY_FILTERS)

    expect(historyQueryKey({ lat: 23.75, lng: 90.39 }, DEFAULT_HISTORY_FILTERS)).not.toEqual(base)
  })

  it('is structurally comparable — the same filters make the same key', () => {
    expect(historyQueryKey(ORIGIN, { ...filters })).toEqual(historyQueryKey(ORIGIN, { ...filters }))
  })
})

describe('HISTORY_TYPE_ORDER', () => {
  it('lists every incident type once, so the sheet and the summary show the same set', () => {
    expect([...HISTORY_TYPE_ORDER].sort()).toEqual([...REPORT_CATEGORIES].sort())
  })
})

import type { ReportCategory } from '@nagar-shield/shared'
import { countByCategory, type HistoryReport } from './history'

/**
 * The Supabase client is mocked at the module boundary. The distribution is a
 * pure function over the rows the query returned, so the client is never
 * exercised — but the module imports it, and the native modules it pulls in
 * (AsyncStorage, SecureStore) do not run under Jest.
 */
jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}))

/**
 * The History distribution.
 *
 * `006-alerts / 004-distribution-by-category` (FR-NG-3 / FR-NG-4 / ADR-010).
 *
 * The rule this file protects: the distribution is a **count per category in a
 * list** — never a chart, a bar, a percentage, or a trend. The prototype's
 * screen 23 (Charts) is never built, and the বিতরণ tab is the list.
 *
 * A count is derived from the rows the same query already returned, so it can
 * never disagree with the list the user is looking at.
 */

function report(category: ReportCategory | null, id = 'r'): HistoryReport {
  return {
    id,
    category,
    description: null,
    areaHierarchy: null,
    capturedAt: '2026-11-05T10:00:00.000Z',
    moderationStatus: 'visible',
    authorDisplayName: null,
    hasMedia: false,
    mediaCount: 0,
    distanceM: 100,
    isOwn: false,
    lat: 23.81,
    lng: 90.41,
  }
}

describe('the per-category counts', () => {
  it('count each category', () => {
    const counts = countByCategory([
      report('theft', '1'),
      report('theft', '2'),
      report('fire', '3'),
    ])

    expect(counts).toEqual([
      { category: 'theft', count: 2 },
      { category: 'fire', count: 1 },
    ])
  })

  it('order by the count, largest first', () => {
    const counts = countByCategory([
      report('fire', '1'),
      report('theft', '2'),
      report('theft', '3'),
      report('assault', '4'),
    ])

    expect(counts.map((entry) => entry.category)).toEqual(['theft', 'fire', 'assault'])
    expect(counts.map((entry) => entry.count)).toEqual([2, 1, 1])
  })

  it('count a report with no category under no category, not under "other"', () => {
    const counts = countByCategory([report(null, '1')])

    expect(counts).toEqual([{ category: null, count: 1 }])
    expect(counts.some((entry) => entry.category === 'other')).toBe(false)
  })

  it('keep the no-category count separate from the "other" count', () => {
    const counts = countByCategory([report(null, '1'), report('other', '2')])

    // Two rows, two distinct buckets — neither merged into the other.
    expect(counts).toHaveLength(2)
    expect(counts).toContainEqual({ category: null, count: 1 })
    expect(counts).toContainEqual({ category: 'other', count: 1 })
  })

  it('sum to the number of rows, so the list and the count cannot disagree', () => {
    const rows = [
      report('theft', '1'),
      report('theft', '2'),
      report(null, '3'),
      report('fraud', '4'),
    ]

    const total = countByCategory(rows).reduce((sum, entry) => sum + entry.count, 0)

    expect(total).toBe(rows.length)
  })

  it('return an empty list for no rows', () => {
    expect(countByCategory([])).toEqual([])
  })

  it('carry a raw count — never a percentage, a rate, or a share', () => {
    const counts = countByCategory([
      report('theft', '1'),
      report('theft', '2'),
      report('fire', '3'),
    ])

    for (const entry of counts) {
      // A percentage or a share would be a non-integer or a value above 1.
      expect(Number.isInteger(entry.count)).toBe(true)
      expect(entry.count).toBeGreaterThanOrEqual(1)
      expect(Object.keys(entry).sort()).toEqual(['category', 'count'])
    }
  })

  it('expose no series, no geometry, and no comparison — there is nothing to chart', () => {
    const counts = countByCategory([report('theft', '1'), report('fire', '2')])

    for (const entry of counts) {
      expect(entry).not.toHaveProperty('percentage')
      expect(entry).not.toHaveProperty('share')
      expect(entry).not.toHaveProperty('trend')
      expect(entry).not.toHaveProperty('series')
      expect(entry).not.toHaveProperty('points')
      expect(entry).not.toHaveProperty('height')
      expect(entry).not.toHaveProperty('percent')
    }
  })
})

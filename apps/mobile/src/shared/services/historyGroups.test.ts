import { groupByDay, historyDayGroup } from './historyGroups'

// A fixed "now": 15 Nov 2026, 14:00 local.
const NOW = new Date(2026, 10, 15, 14, 0, 0)
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0).toISOString()

describe('historyDayGroup', () => {
  it('puts a report from earlier today under today', () => {
    expect(historyDayGroup(at(15, 0), NOW)).toBe('today')
  })

  it('puts yesterday evening under yesterday, even if it is under 24 hours old', () => {
    expect(historyDayGroup(at(14, 23), NOW)).toBe('yesterday')
  })

  it('puts anything older under earlier', () => {
    expect(historyDayGroup(at(13, 23), NOW)).toBe('earlier')
  })

  it('puts an unreadable date under earlier', () => {
    expect(historyDayGroup('not a date', NOW)).toBe('earlier')
  })
})

describe('groupByDay', () => {
  it('keeps the order and drops empty groups', () => {
    const rows = [
      { id: 'a', capturedAt: at(15, 9) },
      { id: 'b', capturedAt: at(13, 9) },
      { id: 'c', capturedAt: at(12, 9) },
    ]

    const groups = groupByDay(rows, NOW)

    expect(groups.map((entry) => entry.group)).toEqual(['today', 'earlier'])
    expect(groups[1]?.rows.map((row) => row.id)).toEqual(['b', 'c'])
  })
})

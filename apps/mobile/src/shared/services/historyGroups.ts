export type HistoryDayGroup = 'today' | 'yesterday' | 'earlier'

/** The start of a local calendar day. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Which day a report belongs under in the list: today, yesterday, or earlier. */
export function historyDayGroup(capturedAt: string, now: Date = new Date()): HistoryDayGroup {
  const captured = new Date(capturedAt)
  if (Number.isNaN(captured.getTime())) return 'earlier'

  const dayMs = 24 * 60 * 60 * 1000
  const today = startOfDay(now)
  const day = startOfDay(captured)

  if (day >= today) return 'today'
  if (day >= today - dayMs) return 'yesterday'
  return 'earlier'
}

/**
 * Splits rows (newest first) into day groups, keeping their order and leaving
 * out a group with nothing in it.
 */
export function groupByDay<T extends { capturedAt: string }>(
  rows: readonly T[],
  now: Date = new Date(),
): Array<{ group: HistoryDayGroup; rows: T[] }> {
  const order: HistoryDayGroup[] = ['today', 'yesterday', 'earlier']
  return order
    .map((group) => ({
      group,
      rows: rows.filter((row) => historyDayGroup(row.capturedAt, now) === group),
    }))
    .filter((entry) => entry.rows.length > 0)
}

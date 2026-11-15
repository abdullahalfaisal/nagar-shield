import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import { alertsItems, isRefreshPausedError, type AlertsFeedData } from './alerts'

/**
 * Whether the feed **failed to load** and has nothing to show.
 *
 * The query errored and there is no cached page. That is a failure, not an
 * empty feed — the screen says so and offers a retry instead of falling
 * through to "no alerts". When a cached page survives, the offline notice
 * covers it (`alertsShowingCachedPage`) and this is false.
 *
 * A **paused** refusal is not a failure either: the guard's refusal is an
 * `Error`, so it puts the query in its error state, but nothing went wrong.
 */
export function alertsLoadFailed(
  query: Pick<UseInfiniteQueryResult<AlertsFeedData, Error>, 'isError' | 'data'> & {
    error?: unknown
  },
): boolean {
  if (!query.isError) return false
  if (isRefreshPausedError(query.error)) return false
  return alertsItems(query.data).length === 0
}

'use client'

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  disableAccount,
  fetchAuditTrail,
  fetchModerationQueue,
  fetchReportDetail,
  getBrowserClient,
  searchAccounts,
  submitDecision,
  toAppError,
  type AccountRow,
  type AuditPage,
  type QueuePage,
  type ReportDetail,
} from '@/lib/api'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'

/**
 * The console's query layer.
 *
 * The admin declares `@tanstack/react-query` as a dependency, and this is
 * where it is used. Before this file the console hand-rolled every fetch with
 * `useState` + `useEffect` + `useCallback`, and every screen owned its own
 * reload callback. Two things went wrong with that:
 *
 *   * **The refresh was per-call-site.** A moderator who decided a report
 *     reloaded the one screen they were on. The audit trail was never
 *     invalidated, so it could show a feed fetched *before* the decision.
 *   * **A forgotten reload was invisible.** Nothing could notice a missing
 *     one, because there was no registry of what should have been refreshed.
 *
 * A query key is that registry. `invalidateQueries` invalidates **by key**,
 * so one decision invalidates every surface that shows the effect of that
 * decision — whether or not anyone remembered to call a reload.
 *
 * The keys
 * --------
 * Every key starts with the shared `'admin'` root segment, and each key is a
 * **prefix** of the query keys derived from it. That is not a style choice:
 * `invalidateQueries` matches by prefix (`partialMatchKey` in
 * `@tanstack/query-core`), so invalidating `['admin', 'audit']` reaches
 * `['admin', 'audit', 'restore']` — the filter variant — but would NOT reach
 * a key that did not start with `['admin', 'audit']`. A key shape that does
 * not prefix-match fails **silently**, which is why
 * `queries.test.ts` proves the invalidation actually lands.
 */

// -----------------------------------------------------------------------------
// The query keys
// -----------------------------------------------------------------------------

/** The shared root of every console query. */
export const ADMIN_QUERY_ROOT = ['admin'] as const

/** The moderation queue. Carries no group — the group is a client-side slice. */
export const QUEUE_QUERY_KEY = ['admin', 'queue'] as const

/** The report review detail. The report id is the last segment. */
export const REPORT_DETAIL_QUERY_KEY = ['admin', 'report-detail'] as const

/** The append-only audit trail. The decision filter is the last segment. */
export const AUDIT_QUERY_KEY = ['admin', 'audit'] as const

/** The account lookup. */
export const USERS_QUERY_KEY = ['admin', 'users'] as const

/** The page size for both cursor-paginated feeds. */
export const PAGE_SIZE = 20

// -----------------------------------------------------------------------------
// The reads
// -----------------------------------------------------------------------------

/**
 * The moderation queue — the reports awaiting review.
 *
 * Cursor-paginated through `useInfiniteQuery`: the server returns a
 * `next_cursor`, and `getNextPageParam` hands it back so "Load more" fetches
 * the next page and **appends** it. The rows are appended, never replaced —
 * the cursor guarantees no duplicate and no skipped row.
 *
 * The **group is not in the key**, and never reaches the server. The
 * author-auto-hide group is a client-side slice over the rows already
 * loaded — the same rows, the same cursor, the same pagination. It adds no
 * rows to the schema and it invents no second read model, and a moderator's
 * own read writes nothing.
 */
export function useModerationQueue(): UseInfiniteQueryResult<
  InfiniteData<QueuePage, string | null>,
  Error
> {
  return useInfiniteQuery({
    queryKey: QUEUE_QUERY_KEY,
    // The first page has no cursor. `null` is the API's own "no cursor"
    // spelling, so the same value means the same thing on both sides.
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      try {
        return await fetchModerationQueue(getBrowserClient(), {
          cursor: pageParam,
          limit: PAGE_SIZE,
        })
      } catch (caught) {
        // `getBrowserClient` throws a plain Error when the env vars are
        // missing, so every throw is normalised to an AppError here and the
        // screen can switch on a stable code.
        throw toAppError(caught)
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

/**
 * The full review detail for one report.
 *
 * The key ends with the report id, so invalidating the detail for one
 * decision touches that report's row and no other.
 */
export function useReportDetail(reportId: string | undefined): UseQueryResult<ReportDetail, Error> {
  return useQuery({
    queryKey: [...REPORT_DETAIL_QUERY_KEY, reportId],
    queryFn: async () => {
      try {
        return await fetchReportDetail(getBrowserClient(), reportId as string)
      } catch (caught) {
        throw toAppError(caught)
      }
    },
    enabled: Boolean(reportId),
  })
}

/**
 * The append-only audit trail, newest first.
 *
 * The decision filter **is** a server parameter (`p_decision`), so it belongs
 * in the key — changing the filter changes the key, which resets the
 * pagination automatically. A client-side slice would be wrong here: the
 * server filters, and the trail is not a list the console owns.
 */
export function useAuditTrail(
  filter: string,
): UseInfiniteQueryResult<InfiniteData<AuditPage, string | null>, Error> {
  return useInfiniteQuery({
    queryKey: [...AUDIT_QUERY_KEY, filter],
    // The first page has no cursor — `null` is the API's own "no cursor"
    // spelling.
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      try {
        return await fetchAuditTrail(getBrowserClient(), {
          cursor: pageParam,
          limit: PAGE_SIZE,
          decision: filter === 'all' ? null : filter,
        })
      } catch (caught) {
        throw toAppError(caught)
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

/**
 * The exact-match account lookup.
 *
 * `enabled: false` — the search is an **explicit action**, not a per-keystroke
 * fetch. The page calls `fetchQuery` when the moderator submits. A query
 * that ran on every keystroke would hit the server with a query the moderator
 * has not finished typing, and the endpoint is an exact match on a phone, an
 * email or an id — a prefix would not match it anyway.
 */
export function useAccountSearch(query: string): UseQueryResult<AccountRow[], Error> {
  return useQuery({
    queryKey: [...USERS_QUERY_KEY, query],
    queryFn: async () => {
      try {
        return await searchAccounts(getBrowserClient(), query)
      } catch (caught) {
        throw toAppError(caught)
      }
    },
    enabled: false,
  })
}

// -----------------------------------------------------------------------------
// The writes
// -----------------------------------------------------------------------------

/**
 * The restore / remove decision.
 *
 * On success this invalidates **three** keys, and that is the whole point of
 * the story: the queue, the report detail, and the audit trail all show the
 * effect of the decision, so all three have to be re-read. The decided row
 * leaves the queue on the next fetch — it is not optimistically removed from
 * the cache without a server round-trip, because the client is never the
 * authority on what was stored.
 */
export function useSubmitDecision(): UseMutationResult<
  void,
  Error,
  { reportId: string; decision: 'restore' | 'remove'; note: string }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input) => {
      try {
        await submitDecision(getBrowserClient(), input)
      } catch (caught) {
        throw toAppError(caught)
      }
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY })
      await queryClient.invalidateQueries({
        queryKey: [...REPORT_DETAIL_QUERY_KEY, variables.reportId],
      })
      await queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY })
    },
  })
}

/**
 * The account disable.
 *
 * Invalidates the account lookup and the audit trail: the disabled account's
 * row must change, and the disable is an audit action like any other.
 */
export function useDisableAccount(): UseMutationResult<
  void,
  Error,
  { userId: string; note: string }
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input) => {
      try {
        await disableAccount(getBrowserClient(), input)
      } catch (caught) {
        throw toAppError(caught)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY })
    },
  })
}

// -----------------------------------------------------------------------------
// The error branches
// -----------------------------------------------------------------------------

/**
 * The decision panel's error copy.
 *
 * The panel renders `VALIDATION_FAILED` in the **note field**, not in the
 * banner: a blank note is a field problem, and the field is where the
 * moderator is looking. Every other code goes to the banner.
 */
export function decisionErrorMessage(code: string): string {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)

  switch (code) {
    case 'VALIDATION_FAILED':
      return copy.decisionNoteRequired
    case 'FORBIDDEN':
      return copy.errorForbidden
    case 'CONFLICT':
      return copy.errorConflict
    case 'AUTH_DISABLED':
      return copy.errorForbidden
    case 'AUTH_REQUIRED':
      return copy.errorAuthRequired
    default:
      return copy.errorGeneric
  }
}

/**
 * The disable panel's error copy.
 *
 * The split from the decision panel is deliberate and must be kept:
 * `FORBIDDEN` here means *a moderator cannot be disabled* — a specific,
 * actionable message — not the generic permission message. And
 * `VALIDATION_FAILED` is a **banner** here, because the disable form has no
 * separate field error; the note's requirement is stated by the disabled
 * submit button.
 */
export function disableErrorMessage(code: string): string {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)

  switch (code) {
    case 'VALIDATION_FAILED':
      return copy.decisionNoteRequired
    case 'FORBIDDEN':
      return copy.usersDisableForbidden
    case 'CONFLICT':
      return copy.errorConflict
    case 'AUTH_DISABLED':
      return copy.errorForbidden
    case 'AUTH_REQUIRED':
      return copy.errorAuthRequired
    default:
      return copy.errorGeneric
  }
}

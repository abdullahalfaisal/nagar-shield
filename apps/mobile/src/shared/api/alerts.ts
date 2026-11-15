import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query'
import { ALERTS_REFRESH_INTERVAL_MS } from '@nagar-shield/shared'
import type {
  AreaFilter,
  AreaHierarchy,
  Paginated,
  PublicReport,
  ReportCategory,
} from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'
import {
  RefreshPausedError,
  useRefreshGuard,
  type RefreshGuard,
} from '@/shared/services/refreshGuard'

/**
 * The public Alerts feed.
 *
 * The feed is read through the `alerts_feed` **RPC**, not the view. The view
 * is the unfiltered projection; the RPC adds the four area filters and the
 * cursor, and it reads the area from the `area_hierarchy` jsonb document.
 *
 * The projection deliberately carries no `author_id` (FR-DATA-3 / FR-NG-5). A
 * nulled column would still be named `author_id`, so the column is omitted at
 * the projection level, not nulled.
 */
export interface AlertsQuery extends AreaFilter {
  limit?: number
}

/**
 * The **area filter** half of the query — the part that identifies the feed.
 *
 * The cursor is deliberately **not** part of it. The cursor is the page
 * parameter of the infinite query, not a filter: including it in the query
 * key would make every page its own query, and the feed would reset to page
 * one on every request.
 */
export type AlertsFilter = AreaFilter

/** The shape the RPC returns for one feed row. */
interface FeedRow {
  id: string
  category: ReportCategory | null
  description: string | null
  area_hierarchy: Partial<AreaHierarchy> | null
  captured_at: string
  author_display_name: string | null
  has_media: boolean
  media_count: number
}

interface FeedEnvelope {
  items: FeedRow[]
  next_cursor: string | null
}

function toAreaHierarchy(raw: Partial<AreaHierarchy> | null): AreaHierarchy | null {
  if (!raw) return null
  return {
    division: raw.division ?? '',
    city: raw.city ?? '',
    thana: raw.thana ?? '',
    neighborhood: raw.neighborhood ?? undefined,
    place: raw.place ?? undefined,
  }
}

function toPublicReport(row: FeedRow): PublicReport {
  return {
    id: row.id,
    category: row.category ?? null,
    description: row.description,
    areaHierarchy: toAreaHierarchy(row.area_hierarchy),
    capturedAt: row.captured_at,
    // The public projection only ever carries visible or restored reports, so
    // the status is `visible` to the reader. The real status is moderator-only.
    moderationStatus: 'visible',
    authorDisplayName: row.author_display_name ?? null,
    hasMedia: row.has_media,
    mediaCount: row.media_count,
  }
}

export async function fetchAlerts(
  query: AlertsQuery,
  cursor: string | null = null,
): Promise<Paginated<PublicReport>> {
  const { data, error } = await supabase.rpc('alerts_feed', {
    p_division: query.division ?? null,
    p_city: query.city ?? null,
    p_thana: query.thana ?? null,
    p_neighborhood: query.neighborhood ?? null,
    p_cursor: cursor,
    p_limit: query.limit ?? 20,
  })

  if (error) throw fromSupabaseError(error)

  const envelope = (data ?? { items: [], next_cursor: null }) as unknown as FeedEnvelope
  const items = (envelope.items ?? []).map(toPublicReport)

  return { items, nextCursor: envelope.next_cursor ?? null }
}

/** The accumulated feed: every page, in order, flattened. */
export type AlertsFeedData = InfiniteData<Paginated<PublicReport>, string | null>

/**
 * The Alerts feed query.
 *
 * The feed is **cursor-paginated** (`alerts_feed` orders by
 * `captured_at DESC, id DESC` and hands back a `next_cursor`). It is read
 * through `useInfiniteQuery` so that page two is reachable: the previous
 * `useQuery` received the `next_cursor` and **discarded it**, so a feed longer
 * than one page silently truncated at the limit and the user could never scroll
 * further.
 *
 * The **cursor is the page parameter**, not part of the query key. The key
 * carries the area filter alone, so changing the chip starts a new feed at
 * page one while scrolling forward appends to the accumulated pages.
 *
 * ## The refresh guard is intrinsic to this hook
 *
 * The feed polls every 60 s, and it must stop when the device is unhealthy.
 * The guard lives **here** rather than in each screen, because a guard a
 * caller has to remember is a guard a caller will forget — and the Home
 * screen did forget it, polling every 60 s in the background forever.
 *
 * Two levers stop the poll, and both are needed:
 *
 *   * the **interval function** stops the *timer*;
 *   * the **`queryFn` refusal** stops the *request* (background only).
 *
 * The second one covers the race window between the native
 * `appStateDidChange` event and React's commit of the new state: the timer
 * can fire in that window, and a request issued then would go out even though
 * the app is already backgrounded.
 */
export function useAlertsFeed(query: AlertsFilter): AlertsFeedResult {
  // ONE guard instance for this feed surface. The screen reads it from the
  // hook's return value — it never calls `useRefreshGuard` itself, so the
  // screen and the poll can never disagree about why the refresh is paused.
  const guard = useRefreshGuard()

  const result = useInfiniteQuery<
    Paginated<PublicReport>,
    Error,
    AlertsFeedData,
    ['alerts', AlertsFilter],
    string | null
  >({
    queryKey: ['alerts', query],
    queryFn: async ({ pageParam }) => {
      // The **live** check, not `guard.isPaused`.
      //
      // `guard.isPaused` is React state, so it describes the last render. A
      // native `appStateDidChange` that has not been committed yet is
      // invisible to it — and a request issued in that window would go out
      // after the app was already backgrounded.
      //
      // `isBackgroundedNow()` reads the app state source directly, so it sees
      // the backgrounding the moment the native event arrives.
      //
      // Only the **background** refuses here. The battery and offline pauses
      // belong to the automatic poll (the interval below): a first load, a
      // pull, Retry or "Load more" is something the user asked for, and
      // refusing it at 19 % battery left the feed unable to load at all.
      if (guard.isBackgroundedNow()) throw new RefreshPausedError('background')
      return fetchAlerts(query, pageParam ?? null)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // The poll is foreground-only **by construction**.
    //
    // `refetchIntervalInBackground: false` is a **no-op in React Native**:
    // TanStack's `focusManager.isFocused()` reads
    // `globalThis.document?.visibilityState`, and React Native has no DOM
    // `document`, so it is *always* `true`. The flag is kept because it is
    // the correct thing to write — but it is **not** what stops the
    // background poll. The **interval function** below is.
    //
    // (The root layout now also feeds `focusManager` the app state, so the flag
    // does take effect; the interval function is still the guarantee.)
    //
    // The interval is a **function** so its computed value changes when the
    // guard changes. TanStack re-arms the timer whenever the computed value
    // changes (`queryObserver.js:149`), which re-arms it at the moment the
    // app returns to the foreground — the next interval is measured from
    // that moment, so there is no catch-up burst.
    refetchInterval: () => (guard.isPaused ? false : ALERTS_REFRESH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  })

  return { ...result, guard }
}

/**
 * The feed query's result, plus the guard that decided whether it may poll.
 *
 * The guard travels **with** the result so the screen cannot read a different
 * guard's state than the one the poll is using.
 */
export type AlertsFeedResult = UseInfiniteQueryResult<AlertsFeedData, Error> & {
  guard: RefreshGuard
}

/**
 * The feed's rows, flattened across every loaded page.
 *
 * This is the **only** way the screens read the feed. A screen that read
 * `data.pages[0].items` would be back to showing one page, so the flattening
 * lives here and is the shape the screens consume.
 */
export function alertsItems(data: AlertsFeedData | undefined): PublicReport[] {
  if (!data) return []
  return data.pages.flatMap((page) => page.items)
}

/**
 * Whether the feed is showing **cached** results because the last request
 * failed.
 *
 * The story's promise is *"the offline behaviour is a cached page, not an empty
 * screen"*: the feed renders the last cached page with an offline indication
 * and never blanks the list. That needs **both** halves:
 *
 *   * the query is in an error state — the last request failed; and
 *   * a cached page exists — there is something to show.
 *
 * The second half is what stops the app claiming it is showing "the last
 * results" on a cold start with no network and no cache. There, the feed is
 * genuinely empty and the honest surface is the empty state, not an offline
 * notice over nothing.
 *
 * ## A paused refresh is a state, not a failure
 *
 * The `queryFn` refuses to fetch while the guard says the refresh is paused,
 * and that refusal is an `Error` — so the query lands in its error state. But
 * a **paused** refresh is not a **failed** one: the feed keeps its cached
 * page, and the header says *why* the refresh is paused. Reporting it as an
 * offline failure would put an offline notice over a feed that is not offline
 * — a false claim.
 *
 * So the paused refusal is classified and returns `false` early.
 *
 * The rule lives here, next to `alertsItems`, so the two feed screens cannot
 * disagree about what "offline" means.
 */
export function alertsShowingCachedPage(
  query: Pick<UseInfiniteQueryResult<AlertsFeedData, Error>, 'isError' | 'data' | 'error'>,
): boolean {
  if (!query.isError) return false
  if (isRefreshPausedError(query.error)) return false
  return alertsItems(query.data).length > 0
}

/**
 * Whether an error is the refresh guard's refusal rather than a real failure.
 *
 * The check is by **name**, not by `instanceof`: the error crosses the
 * module boundary between the query layer and the screen layer, and an
 * `instanceof` check fails across a duplicated module instance. The name is
 * stable and is asserted by `refreshGuard.test.ts`.
 */
export function isRefreshPausedError(error: unknown): error is RefreshPausedError {
  return error instanceof Error && error.name === 'RefreshPausedError' && 'reason' in error
}

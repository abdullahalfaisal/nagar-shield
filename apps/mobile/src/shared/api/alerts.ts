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
 */
export function useAlerts(
  query: AlertsFilter,
  options?: { enabled?: boolean },
): UseInfiniteQueryResult<AlertsFeedData, Error> {
  return useInfiniteQuery({
    queryKey: ['alerts', query],
    queryFn: ({ pageParam }) => fetchAlerts(query, pageParam ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    // Auto-refresh every 60 s in the foreground (FR-ALERTS-2).
    refetchInterval: ALERTS_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
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
 * The rule lives here, next to `alertsItems`, so the two feed screens cannot
 * disagree about what "offline" means.
 */
export function alertsShowingCachedPage(
  query: Pick<UseInfiniteQueryResult<AlertsFeedData, Error>, 'isError' | 'data'>,
): boolean {
  if (!query.isError) return false
  return alertsItems(query.data).length > 0
}

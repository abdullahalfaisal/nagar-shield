import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  ALERTS_REFRESH_INTERVAL_MS,
  HISTORY_DEFAULT_RADIUS_KM,
  HISTORY_DEFAULT_WINDOW_HOURS,
  type AreaHierarchy,
  type PublicReport,
  type ReportCategory,
} from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { useRefreshGuard } from '@/shared/services/refreshGuard'
import { fromSupabaseError } from '@/shared/api/errors'
import { toBengaliDigits } from '@/shared/utils/relativeTime'

/**
 * The local History read model.
 *
 * `history_nearby` is the only History read path. It applies the radius and
 * window filters server-side (PostGIS `ST_DWithin` over the geography GiST
 * index) and always includes the caller's **own** reports, so a report the
 * user just submitted appears immediately regardless of the filters
 * (FR-HIST-3).
 */
export interface HistoryQuery {
  lat: number
  lng: number
  radiusKm?: number
  windowHours?: number
  category?: ReportCategory | null
  cursor?: string | null
  limit?: number
}

/** One History row. The public projection plus the author's own flag. */
export interface HistoryReport extends PublicReport {
  /** Distance from the origin in metres — `null` for the user's own reports. */
  distanceM: number | null
  /** True when the row is the signed-in user's own report. */
  isOwn: boolean
  /** The report's own coordinates — `null` when the row carries no geometry. */
  lat: number | null
  lng: number | null
}

interface HistoryRow {
  id: string
  category: ReportCategory | null
  description: string | null
  area_hierarchy: Partial<AreaHierarchy> | null
  captured_at: string
  author_display_name: string | null
  has_media: boolean
  media_count: number
  distance_m: number | null
  is_own: boolean
  lat: number | null
  lng: number | null
}

interface HistoryEnvelope {
  items: HistoryRow[]
  next_cursor: string | null
  total_count: number
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

function toHistoryReport(row: HistoryRow): HistoryReport {
  return {
    id: row.id,
    category: row.category ?? null,
    description: row.description,
    areaHierarchy: toAreaHierarchy(row.area_hierarchy),
    capturedAt: row.captured_at,
    // The public projection only carries visible or restored reports.
    moderationStatus: 'visible',
    authorDisplayName: row.author_display_name ?? null,
    hasMedia: row.has_media,
    mediaCount: row.media_count,
    distanceM: typeof row.distance_m === 'number' ? row.distance_m : null,
    isOwn: Boolean(row.is_own),
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
  }
}

/**
 * The History result envelope.
 *
 * `totalCount` is the number of rows the query matched — a **per-query
 * result**, not an aggregate crime statistic. The client renders it as the
 * **মোট** tab's single number and never as a trend, a rate, or a comparison
 * (FR-NG-3 / FR-NG-4 / ADR-010).
 */
export interface HistoryPage {
  items: HistoryReport[]
  nextCursor: string | null
  totalCount: number
}

export async function fetchHistory(query: HistoryQuery): Promise<HistoryPage> {
  const { data, error } = await supabase.rpc('history_nearby', {
    p_lat: query.lat,
    p_lng: query.lng,
    p_radius_km: query.radiusKm ?? HISTORY_DEFAULT_RADIUS_KM,
    p_window_hours: query.windowHours ?? HISTORY_DEFAULT_WINDOW_HOURS,
    p_category: query.category ?? null,
    p_cursor: query.cursor ?? null,
    p_limit: query.limit ?? 20,
  })

  if (error) throw fromSupabaseError(error)

  const envelope = (data ?? {
    items: [],
    next_cursor: null,
    total_count: 0,
  }) as unknown as HistoryEnvelope
  const items = (envelope.items ?? []).map(toHistoryReport)

  return {
    items,
    nextCursor: envelope.next_cursor ?? null,
    totalCount: typeof envelope.total_count === 'number' ? envelope.total_count : items.length,
  }
}

export function useHistory(
  query: HistoryQuery,
  options?: { enabled?: boolean },
): UseQueryResult<HistoryPage, Error> {
  return useQuery({
    queryKey: ['history', query],
    queryFn: () => fetchHistory(query),
    enabled: options?.enabled ?? true,
    // The History view is a warm-session read — a 60 s stale window matches the
    // feed's cadence without hammering the RPC.
    staleTime: 60_000,
  })
}

/** The History list's accumulated pages. */
export type HistoryFeedData = InfiniteData<HistoryPage, string | null>

/** How many rows one History page asks for. */
export const HISTORY_PAGE_SIZE = 50

/**
 * The History list, cursor-paginated.
 *
 * The first page used to be the whole list, so in a busy area the newest 50
 * rows crowded out the user's own reports and the totals disagreed with the
 * rows. The list now reads page after page; the screen says how many of the
 * matched rows it has loaded.
 *
 * The key starts with `history`, so one `invalidateQueries(['history'])` after
 * an edit refreshes this list and the single-page map read together.
 */
export function useHistoryFeed(
  query: Omit<HistoryQuery, 'cursor' | 'limit'>,
  options?: { enabled?: boolean },
): UseInfiniteQueryResult<HistoryFeedData, Error> {
  // The same pause rules as the feed: no polling in the background, on a low
  // battery or offline.
  const guard = useRefreshGuard()

  return useInfiniteQuery<HistoryPage, Error, HistoryFeedData, unknown[], string | null>({
    queryKey: ['history', 'feed', query],
    queryFn: ({ pageParam }) =>
      fetchHistory({ ...query, cursor: pageParam, limit: HISTORY_PAGE_SIZE }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    // History used to load once and then sit still: a report someone else filed
    // nearby showed only after a pull. It now refreshes on the feed's cadence.
    refetchInterval: () => (guard.isPaused ? false : ALERTS_REFRESH_INTERVAL_MS),
    refetchIntervalInBackground: false,
  })
}

/** Every loaded row, in order. */
export function historyItems(data: HistoryFeedData | undefined): HistoryReport[] {
  return data ? data.pages.flatMap((page) => page.items) : []
}

/** The number of rows the query matched, as the newest page reports it. */
export function historyTotal(data: HistoryFeedData | undefined): number | null {
  const last = data?.pages[data.pages.length - 1]
  return last ? last.totalCount : null
}

/**
 * How a row's distance is written: metres below a kilometre, kilometres from
 * a kilometre up (`4200 m` is hard to read). The digits follow the language.
 */
export function distanceLabelParts(
  metres: number,
  language: string,
): { key: 'history.distanceAway' | 'history.kmAway'; distance: string } {
  const bn = language === 'bn'
  if (metres < 1000) {
    const text = String(Math.round(metres))
    return { key: 'history.distanceAway', distance: bn ? toBengaliDigits(text) : text }
  }
  const km = (Math.round(metres / 100) / 10).toFixed(1).replace(/\.0$/, '')
  return { key: 'history.kmAway', distance: bn ? toBengaliDigits(km) : km }
}

/**
 * The per-category counts for the current filter set.
 *
 * This is a **count per category**, never a chart. The distribution is derived
 * from the rows the same query already returned, so it can never disagree with
 * the list the user is looking at (FR-NG-3 / FR-NG-4 / ADR-010).
 */
export function countByCategory(reports: HistoryReport[]): Array<{
  category: ReportCategory | null
  count: number
}> {
  const counts = new Map<ReportCategory | null, number>()

  for (const report of reports) {
    counts.set(report.category, (counts.get(report.category) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

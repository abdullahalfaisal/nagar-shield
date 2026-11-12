import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  HISTORY_DEFAULT_RADIUS_KM,
  HISTORY_DEFAULT_WINDOW_HOURS,
  type AreaHierarchy,
  type Paginated,
  type PublicReport,
  type ReportCategory,
} from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

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
  lat: number;
  lng: number;
  radiusKm?: number;
  windowHours?: number;
  category?: ReportCategory | null;
  cursor?: string | null;
  limit?: number;
}

/** One History row. The public projection plus the author's own flag. */
export interface HistoryReport extends PublicReport {
  /** Distance from the origin in metres — `null` for the user's own reports. */
  distanceM: number | null;
  /** True when the row is the signed-in user's own report. */
  isOwn: boolean;
}

interface HistoryRow {
  id: string;
  category: ReportCategory | null;
  description: string | null;
  area_hierarchy: Partial<AreaHierarchy> | null;
  captured_at: string;
  author_display_name: string | null;
  has_media: boolean;
  media_count: number;
  distance_m: number | null;
  is_own: boolean;
}

interface HistoryEnvelope {
  items: HistoryRow[];
  next_cursor: string | null;
  total_count: number;
}

function toAreaHierarchy(raw: Partial<AreaHierarchy> | null): AreaHierarchy | null {
  if (!raw) return null;
  return {
    division: raw.division ?? '',
    city: raw.city ?? '',
    thana: raw.thana ?? '',
    neighborhood: raw.neighborhood ?? undefined,
  };
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
  };
}

export async function fetchHistory(query: HistoryQuery): Promise<Paginated<HistoryReport>> {
  const { data, error } = await supabase.rpc('history_nearby', {
    p_lat: query.lat,
    p_lng: query.lng,
    p_radius_km: query.radiusKm ?? HISTORY_DEFAULT_RADIUS_KM,
    p_window_hours: query.windowHours ?? HISTORY_DEFAULT_WINDOW_HOURS,
    p_category: query.category ?? null,
    p_cursor: query.cursor ?? null,
    p_limit: query.limit ?? 20,
  });

  if (error) throw fromSupabaseError(error);

  const envelope = (data ?? { items: [], next_cursor: null, total_count: 0 }) as unknown as HistoryEnvelope;
  const items = (envelope.items ?? []).map(toHistoryReport);

  return { items, nextCursor: envelope.next_cursor ?? null };
}

export function useHistory(
  query: HistoryQuery,
  options?: { enabled?: boolean },
): UseQueryResult<Paginated<HistoryReport>, Error> {
  return useQuery({
    queryKey: ['history', query],
    queryFn: () => fetchHistory(query),
    enabled: options?.enabled ?? true,
    // The History view is a warm-session read — a 60 s stale window matches the
    // feed's cadence without hammering the RPC.
    staleTime: 60_000,
  });
}

/**
 * The per-category counts for the current filter set.
 *
 * This is a **count per category**, never a chart. The distribution is derived
 * from the rows the same query already returned, so it can never disagree with
 * the list the user is looking at (FR-NG-3 / FR-NG-4 / ADR-010).
 */
export function countByCategory(reports: HistoryReport[]): Array<{
  category: ReportCategory | null;
  count: number;
}> {
  const counts = new Map<ReportCategory | null, number>();

  for (const report of reports) {
    counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

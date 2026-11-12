import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ALERTS_REFRESH_INTERVAL_MS } from '@nagar-shield/shared';
import type {
  AreaFilter,
  AreaHierarchy,
  Paginated,
  PublicReport,
  ReportCategory,
} from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';
import { fromSupabaseError } from '@/shared/api/errors';

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
  cursor?: string | null;
  limit?: number;
}

/** The shape the RPC returns for one feed row. */
interface FeedRow {
  id: string;
  category: ReportCategory | null;
  description: string | null;
  area_hierarchy: Partial<AreaHierarchy> | null;
  captured_at: string;
  author_display_name: string | null;
  has_media: boolean;
  media_count: number;
}

interface FeedEnvelope {
  items: FeedRow[];
  next_cursor: string | null;
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
  };
}

export async function fetchAlerts(query: AlertsQuery): Promise<Paginated<PublicReport>> {
  const { data, error } = await supabase.rpc('alerts_feed', {
    p_division: query.division ?? null,
    p_city: query.city ?? null,
    p_thana: query.thana ?? null,
    p_neighborhood: query.neighborhood ?? null,
    p_cursor: query.cursor ?? null,
    p_limit: query.limit ?? 20,
  });

  if (error) throw fromSupabaseError(error);

  const envelope = (data ?? { items: [], next_cursor: null }) as unknown as FeedEnvelope;
  const items = (envelope.items ?? []).map(toPublicReport);

  return { items, nextCursor: envelope.next_cursor ?? null };
}

export function useAlerts(
  query: AlertsQuery,
  options?: { enabled?: boolean },
): UseQueryResult<Paginated<PublicReport>, Error> {
  return useQuery({
    queryKey: ['alerts', query],
    queryFn: () => fetchAlerts(query),
    enabled: options?.enabled ?? true,
    // Auto-refresh every 60 s in the foreground (FR-ALERTS-2).
    refetchInterval: ALERTS_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

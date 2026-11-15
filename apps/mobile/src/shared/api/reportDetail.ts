import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import {
  AppError,
  reportCategorySchema,
  type AreaHierarchy,
  type ModerationStatus,
  type OwnedReport,
  type PublicVisibility,
  type ReportCategory,
  type ReportMedia,
} from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

/**
 * The author's own report, and the category edit.
 *
 * `004-capture / 003-report-detail-and-category-edit`:
 *
 *   * AC #1 — "the Report detail screen renders … the media, the description,
 *     the resolved area, the capture time, and the category";
 *   * AC #4 — "`updateCategory(reportId, category)` writes the value, the
 *     stored `reports.category` equals it";
 *   * AC #5 — "the stored `reports.category` is replaced with the new value
 *     and the previous value is not retained anywhere";
 *   * AC #6 — "a signed-in user who is **not** the author … the update is
 *     rejected with `FORBIDDEN` and the stored category is unchanged";
 *   * AC #7 — "a value outside the fixed 11 … is rejected by the shared
 *     `ReportCategory` parser and the database CHECK constraint, and no row
 *     is written";
 *   * AC #8 — "the report is present in the author's own History immediately,
 *     with `moderation_status = 'visible'` and no pending-review gate".
 *
 * The author's own row, never the public projection
 * -----------------------------------------------
 * `reports.author_id` is always stored, even when `public_visibility` is
 * `anonymous` (FR-DATA-3). This screen is the author's own view of their own
 * report, so it may show the author row; the **public** projection must never
 * return `author_id`, and this module never reads through it. It reads the
 * `reports` table directly, where the `reports_select_own` policy scopes the
 * read to `author_id = auth.uid()` — so a non-author's report simply does not
 * resolve, rather than resolving and being hidden by the UI.
 *
 * Only the category is editable
 * -----------------------------
 * The media, the location, the description and the visibility are immutable
 * after submit, and the **database** says so: `reports_update_guard` raises
 * `ONLY_CATEGORY_EDITABLE` for any other column change, and the
 * `update_category` RPC is the only write path the client uses. There is no
 * client method that edits anything else, and there is no RPC that would
 * accept it.
 */

const REPORT_DETAIL_KEY = ['report-detail'] as const

interface ReportRow {
  id: string
  author_id: string
  public_visibility: PublicVisibility
  category: ReportCategory | null
  description: string | null
  lat: number
  lng: number
  area_hierarchy: Partial<AreaHierarchy> | null
  captured_at: string
  moderation_status: ModerationStatus
  created_at: string
}

interface ReportMediaRow {
  id: string
  report_id: string
  storage_path: string
  media_type: ReportMedia['mediaType']
  byte_size: number
  duration_seconds: number | null
  width: number | null
  height: number | null
  created_at: string
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

function toMedia(row: ReportMediaRow): ReportMedia {
  return {
    id: row.id,
    reportId: row.report_id,
    storagePath: row.storage_path,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  }
}

/**
 * Reads the author's own report.
 *
 * Returns `null` when the report does not exist **or** is not the caller's —
 * the two are indistinguishable from outside, which is the point. A
 * non-author's report is not an error to be shown; it is a row that does not
 * exist for this session.
 */
export async function fetchOwnedReport(reportId: string): Promise<OwnedReport | null> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, author_id, public_visibility, category, description, lat, lng, area_hierarchy, captured_at, moderation_status, created_at',
    )
    .eq('id', reportId)
    .maybeSingle()

  if (error) throw fromSupabaseError(error)
  if (!data) return null

  const row = data as unknown as ReportRow

  // The media are a second query because the `report_media` rows live in
  // their own table with their own policy — the same policy shape as every
  // other owner-scoped table in the schema.
  const { data: mediaData, error: mediaError } = await supabase
    .from('report_media')
    .select(
      'id, report_id, storage_path, media_type, byte_size, duration_seconds, width, height, created_at',
    )
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })

  if (mediaError) throw fromSupabaseError(mediaError)

  return {
    id: row.id,
    authorId: row.author_id,
    publicVisibility: row.public_visibility,
    category: row.category ?? null,
    description: row.description,
    lat: row.lat,
    lng: row.lng,
    areaHierarchy: toAreaHierarchy(row.area_hierarchy),
    capturedAt: row.captured_at,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    media: (mediaData ?? []).map((m) => toMedia(m as unknown as ReportMediaRow)),
  }
}

/**
 * The author's own report, as a query.
 *
 * The query is keyed on the report id, so two detail screens open side by side
 * do not share a cache entry.
 */
export function useOwnedReport(
  reportId: string | undefined,
): UseQueryResult<OwnedReport | null, Error> {
  return useQuery({
    queryKey: [...REPORT_DETAIL_KEY, reportId],
    queryFn: () => (reportId ? fetchOwnedReport(reportId) : Promise.resolve(null)),
    enabled: Boolean(reportId),
  })
}

/**
 * Sets the report's category.
 *
 * The write goes through the `update_category` RPC, which is `SECURITY
 * DEFINER` and checks `auth.uid() = author_id` itself. A forged request from
 * a non-author is refused with `FORBIDDEN` **by the database**, regardless of
 * what the client sent — the UI hides the affordance, but the UI is not the
 * authority.
 *
 * The value is validated **twice** before the call:
 *
 *   1. by the shared `reportCategorySchema`, which is the fixed 11-value
 *      parser — a value outside the vocabulary never reaches the network;
 *   2. by the database, where the `report_category` enum and the column's
 *      CHECK are the second line of defence.
 *
 * The save is **pessimistic**: the caller sees the previous category until the
 * RPC has returned. The user must never see a category the database rejected.
 */
export async function updateCategory(
  reportId: string,
  category: ReportCategory,
): Promise<ReportCategory> {
  const parsed = reportCategorySchema.safeParse(category)

  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', { field: 'category' })
  }

  const { error } = await supabase.rpc('update_category', {
    p_report_id: reportId,
    p_category: parsed.data,
  })

  if (error) throw fromSupabaseError(error)

  return parsed.data
}

/**
 * The cached reads a category change makes stale.
 *
 * The category shows on this report's own detail, on the public detail, on
 * the card thumbnail, on every History row and on the feed. Refreshing only
 * the first of those left History and the feed showing the old category until
 * their one-minute stale window ran out.
 */
export function categoryChangeQueryKeys(reportId: string): Array<readonly unknown[]> {
  return [
    [...REPORT_DETAIL_KEY, reportId],
    ['history'],
    ['alerts'],
    ['alert-detail', reportId],
    ['alert-thumbnail', reportId],
  ]
}

/**
 * Invalidates what a category change made stale.
 *
 * Called after a successful category save so the detail screen re-reads the
 * row from the database rather than trusting the client's own copy — the
 * client is never the authority on what is stored — and so History and the
 * feed show the new category straight away.
 */
export function useInvalidateReport(): (reportId: string) => Promise<void> {
  const queryClient = useQueryClient()

  return async (reportId: string) => {
    await Promise.all(
      categoryChangeQueryKeys(reportId).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  }
}

/**
 * A signed URL for one media object.
 *
 * The bucket is **private** — `report_media` is read through an owner-scoped
 * Storage policy, and the bytes are never public. A signed URL is therefore
 * needed to render the image, and it is fetched on demand rather than stored.
 *
 * The URL is short-lived and is never written to a log, a crash report, or
 * the queue file.
 */
export async function signMediaUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('report-media')
    .createSignedUrl(storagePath, 60 * 10)

  if (error) return null

  return data?.signedUrl ?? null
}

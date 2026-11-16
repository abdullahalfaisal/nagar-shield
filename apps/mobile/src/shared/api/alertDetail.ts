import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  AreaHierarchy,
  MediaType,
  PublicVisibility,
  ReportCategory,
} from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'
import { signMediaUrl } from '@/shared/api/reportDetail'

/**
 * The **public** alert detail.
 *
 * `006-alerts / 009-alert-detail-screen` — the surface behind the feed card's
 * `বিস্তারিত দেখুন` link.
 *
 * Two distinct surfaces live behind the prototype's `21a`
 * ---------------------------------------------------
 * The prototype's `data-nav="21a"` target exists only as the **author's own**
 * report-detail / category-refinement surface, which is unit `004-capture`'s
 * and is reached from History. There is **no** prototype screen for the
 * *public* alert detail. This module is the public one.
 *
 * The two read different paths, and the difference is the whole point:
 *
 *   * the author's own detail reads the owner-scoped `reports` row, so it has
 *     an `authorId` — and may show the category editor;
 *   * the public detail reads through `public.alert_detail`, a
 *     `SECURITY DEFINER` read model that returns **no author id at all**.
 *
 * The public surface never has an author id to hide. It simply has no author
 * field. A type that carried one would be a field waiting to be rendered.
 */
export interface PublicAlertMedia {
  id: string
  reportId: string
  storagePath: string
  mediaType: MediaType
  byteSize: number
  durationSeconds: number | null
  width: number | null
  height: number | null
}

/**
 * One public alert.
 *
 * There is deliberately **no** `authorId` on this type. The projection omits
 * the column entirely (FR-DATA-3 / FR-NG-5) — a nulled column would still be
 * named `author_id`, and a type that named it would invite a render.
 */
export interface PublicAlertDetail {
  id: string
  category: ReportCategory | null
  description: string | null
  areaHierarchy: AreaHierarchy | null
  capturedAt: string
  publicVisibility: PublicVisibility
  /** Present only when the author explicitly chose `identified`. */
  authorDisplayName: string | null
  lat: number | null
  lng: number | null
  media: PublicAlertMedia[]
}

interface AlertDetailRow {
  id: string
  category: ReportCategory | null
  description: string | null
  area_hierarchy: Partial<AreaHierarchy> | null
  captured_at: string
  public_visibility: PublicVisibility
  author_display_name: string | null
  lat: number | null
  lng: number | null
  media: Array<{
    id: string
    report_id: string
    storage_path: string
    media_type: MediaType
    byte_size: number
    duration_seconds: number | null
    width: number | null
    height: number | null
  }>
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

/**
 * Reads one public alert.
 *
 * Returns `null` when the report does not resolve — because it does not
 * exist, because it was removed by moderation, or because it was soft-deleted.
 * The three are indistinguishable from outside, which is the point: a client
 * cannot use this read to discover which reports exist but are hidden.
 */
export async function fetchPublicAlertDetail(reportId: string): Promise<PublicAlertDetail | null> {
  const { data, error } = await supabase.rpc('alert_detail', {
    p_report_id: reportId,
  })

  if (error) throw fromSupabaseError(error)

  if (!data) return null

  const row = data as unknown as AlertDetailRow

  return {
    id: row.id,
    category: row.category ?? null,
    description: row.description,
    areaHierarchy: toAreaHierarchy(row.area_hierarchy),
    capturedAt: row.captured_at,
    publicVisibility: row.public_visibility,
    authorDisplayName: row.author_display_name ?? null,
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
    media: (row.media ?? []).map((media) => ({
      id: media.id,
      reportId: media.report_id,
      storagePath: media.storage_path,
      mediaType: media.media_type,
      byteSize: media.byte_size,
      durationSeconds: media.duration_seconds,
      width: media.width,
      height: media.height,
    })),
  }
}

export function usePublicAlertDetail(
  reportId: string | undefined,
): UseQueryResult<PublicAlertDetail | null, Error> {
  return useQuery({
    queryKey: ['alert-detail', reportId],
    queryFn: () => (reportId ? fetchPublicAlertDetail(reportId) : Promise.resolve(null)),
    enabled: Boolean(reportId),
  })
}

/**
 * The signed URLs for the alert's media, keyed by the storage path.
 *
 * The bucket is **private** — the bytes are never public — so a signed URL is
 * needed to render the image. The URL is short-lived, fetched on demand, and
 * held in memory for the life of the screen. It is never written to storage,
 * never logged, and never sent anywhere else.
 *
 * A media whose URL cannot be signed is simply **absent** from the map. The
 * screen then renders its graceful placeholder for that tile and shows the
 * rest of the report — an expired URL never breaks the screen.
 */
export async function signAlertMediaUrls(
  media: PublicAlertMedia[],
): Promise<Record<string, string>> {
  if (media.length === 0) return {}

  const pairs = await Promise.all(
    media.map(async (item) => {
      const url = await signMediaUrl(item.storagePath)
      return [item.storagePath, url] as const
    }),
  )

  return Object.fromEntries(pairs.filter(([, url]) => Boolean(url)) as Array<[string, string]>)
}

/**
 * How long a signed link is trusted. The link lasts ten minutes
 * (`signMediaUrl`), so it is renewed a little before that: a photo opened at
 * minute nine must not turn blank at minute ten.
 */
export const SIGNED_URL_RENEW_MS = 8 * 60_000

/** Whether links signed at `signedAt` (epoch ms, 0 for never) are due for renewal. */
export function signedUrlsAreStale(signedAt: number, now: number = Date.now()): boolean {
  return now - signedAt >= SIGNED_URL_RENEW_MS
}

/** One of a feed report's attachments, with its signed URL when it has one. */
export interface AlertThumbnailItem {
  id: string
  kind: MediaType
  url: string | null
}

/**
 * What a feed card shows for a report's first media item, plus every item so
 * the card can open them full screen.
 */
export type AlertThumbnail =
  | { kind: 'photo'; url: string; count: number; items: AlertThumbnailItem[] }
  | { kind: 'video'; count: number; items: AlertThumbnailItem[] }
  | { kind: 'file'; count: number; items: AlertThumbnailItem[] }

/**
 * The first media item of a feed report, ready for the card.
 *
 * The feed projection carries only `has_media` / `media_count`, so the card
 * reads the report's public detail (the same query the detail screen uses, so
 * opening the report afterwards is instant) and mints a signed URL for each
 * item. The bucket stays private; the URL lasts ten minutes, so the query is
 * kept a little less than that.
 *
 * A video shows a play tile rather than a frame — extracting a frame would
 * mean downloading the clip on the feed.
 */
export function useAlertThumbnail(
  reportId: string,
  hasMedia: boolean,
): UseQueryResult<AlertThumbnail | null, Error> {
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['alert-thumbnail', reportId],
    enabled: hasMedia,
    staleTime: SIGNED_URL_RENEW_MS,
    gcTime: 9 * 60_000,
    retry: 0,
    queryFn: async () => {
      const detail = await queryClient.fetchQuery({
        queryKey: ['alert-detail', reportId],
        queryFn: () => fetchPublicAlertDetail(reportId),
      })
      const first = detail?.media[0]
      if (!detail || !first) return null

      const count = detail.media.length
      const urls = await signAlertMediaUrls(detail.media)
      const items = detail.media.map((media) => ({
        id: media.id,
        kind: media.mediaType,
        url: urls[media.storagePath] ?? null,
      }))

      if (first.mediaType === 'video') return { kind: 'video', count, items }
      if (first.mediaType !== 'photo') return { kind: 'file', count, items }

      const url = urls[first.storagePath]
      return url ? { kind: 'photo', url, count, items } : null
    },
  })
}

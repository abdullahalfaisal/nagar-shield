import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AppError, type FlagReason } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

/**
 * The flag write path — the only write unit `006` owns.
 *
 * The server owns the rate limit (10 flags per hour), the 3-flag auto-hide and
 * the 5-distinct-flagged-reports author auto-hide. The client only maps the
 * outcome to a stable code and shows it; it never counts flags itself.
 *
 * The two author counts are kept apart because they mean different things.
 * `authorFlags24h` is the number of **flags**; `authorFlaggedReports24h` is
 * the number of **distinct flagged reports**, and it is the latter that decides
 * the hide. A single heavily-flagged report is one flagged report however many
 * times it was flagged.
 */
export type FlagOutcome =
  | {
      status: 'ok'
      reportHidden: boolean
      authorHidden: boolean
      flagCount: number
      /** The author's flag count in the last 24 h — a context number, not a verdict. */
      authorFlags24h: number
      /** The author's DISTINCT flagged reports in the last 24 h — the tally the hide uses. */
      authorFlaggedReports24h: number
    }
  | { status: 'duplicate' }
  | { status: 'own_report' }
  | { status: 'rate_limited'; retryAfterSec: number }

interface FlagResponse {
  status: string
  flag_count?: number
  report_hidden?: boolean
  author_hidden?: boolean
  author_flags_24h?: number
  author_flagged_reports_24h?: number
  retry_after_sec?: number
}

/**
 * Flags a public alert.
 *
 * A duplicate flag, the author's own report and the hourly rate limit are all
 * **normal outcomes**, not transport failures — they come back as a typed
 * result so the UI can show the right message without an error toast.
 */
export async function flagReport(reportId: string, reason: FlagReason): Promise<FlagOutcome> {
  const { data, error } = await supabase.rpc('flag_report', {
    p_report_id: reportId,
    p_reason: reason,
  })

  if (error) throw fromSupabaseError(error)

  const body = (data ?? {}) as unknown as FlagResponse

  switch (body.status) {
    case 'ok':
      return {
        status: 'ok',
        reportHidden: Boolean(body.report_hidden),
        authorHidden: Boolean(body.author_hidden),
        flagCount: body.flag_count ?? 0,
        authorFlags24h: body.author_flags_24h ?? 0,
        authorFlaggedReports24h: body.author_flagged_reports_24h ?? 0,
      }
    case 'duplicate':
      return { status: 'duplicate' }
    case 'own_report':
      return { status: 'own_report' }
    case 'rate_limited':
      return { status: 'rate_limited', retryAfterSec: body.retry_after_sec ?? 3600 }
    default:
      throw new AppError('INTERNAL')
  }
}

/** The flag mutation — invalidates the feed so a hidden report disappears. */
export function useFlagReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ reportId, reason }: { reportId: string; reason: FlagReason }) =>
      flagReport(reportId, reason),
    onSuccess: (outcome) => {
      // The 3-flag threshold removes the report from the public feed, so the
      // feed has to be re-read after every successful flag.
      if (outcome.status === 'ok' && outcome.reportHidden) {
        void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      }
    },
  })
}

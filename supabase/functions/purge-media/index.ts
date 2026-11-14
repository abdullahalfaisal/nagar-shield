/**
 * The 90-day media purge.
 *
 * `POST /functions/v1/purge-media` with the **service-role** bearer.
 *
 * What it does:
 *   1. Derives the candidate worklist from the data (never from a stored
 *      queue): media older than 90 days, plus the media of any withdrawn
 *      report, which is eligible immediately.
 *   2. Deletes each Storage object from the private `report-media` bucket.
 *   3. Sets `report_media.purged_at` — the object goes first, so the flag can
 *      never claim a deletion that did not happen.
 *
 * What it never does:
 *   * it never touches the `reports` row — the report metadata survives the
 *     purge with its category, description, area, coordinates, capture time,
 *     and moderation status intact
 *   * it never relaxes the bucket's privacy
 *
 * The run is idempotent: a second invocation selects nothing, because every
 * processed row now carries `purged_at`.
 */

import { MEDIA_RETENTION_DAYS } from '@shared/jobs/index.ts'
import { errorResponse, successResponse } from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { requireServiceRole, CallerError } from '../_shared/auth.ts'
import { closeJobRun, newRequestId, recordJobRun } from '../_shared/job-runner.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const BUCKET_ID = 'report-media'
const DEFAULT_BATCH_SIZE = 100
const MAX_BATCHES = 20

interface PurgeCandidate {
  id: string
  storage_path: string
  byte_size: number
}

/** The worklist query — a single indexed range scan, no stored queue. */
const CANDIDATE_QUERY = `
  select rm.id, rm.storage_path, rm.byte_size
  from public.report_media rm
  join public.reports r on r.id = rm.report_id
  where rm.purged_at is null
    and (rm.created_at < now() - interval '90 days' or r.deleted_at is not null)
  order by rm.created_at asc
  limit $1;
`

async function readCandidates(
  client: ReturnType<typeof createServiceClient>,
  batchSize: number,
): Promise<PurgeCandidate[]> {
  const { data, error } = await client.rpc('job_purge_media_candidates', {
    p_batch_size: batchSize,
  })

  if (error) throw error

  // The RPC returns the candidate set. The raw table is never selected
  // directly so the candidate definition lives in exactly one place.
  return (data ?? []) as PurgeCandidate[]
}

Deno.serve(async (request) => {
  const requestId = newRequestId()

  try {
    requireServiceRole(request)
  } catch (error) {
    if (error instanceof CallerError) {
      return errorResponse(error.code === 'INTERNAL' ? 'INTERNAL' : 'FORBIDDEN')
    }
    return errorResponse('INTERNAL')
  }

  const serviceClient = createServiceClient()

  let dryRun = false
  try {
    const body = (await request.json().catch(() => ({}))) as { dry_run?: unknown }
    dryRun = body.dry_run === true
  } catch {
    dryRun = false
  }

  const runId = await recordJobRun(serviceClient, 'purge_media')
  if (!runId) {
    logEvent('error', {
      requestId,
      jobName: 'purge_media',
      action: 'job_run_open_failed',
    })
    return errorResponse('INTERNAL')
  }

  let itemsProcessed = 0
  let itemsFailed = 0
  let bytesReclaimed = 0

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const candidates = await readCandidates(serviceClient, DEFAULT_BATCH_SIZE)
      if (candidates.length === 0) break

      for (const candidate of candidates) {
        if (dryRun) {
          // The dry run reports the worklist and touches nothing.
          itemsProcessed += 1
          bytesReclaimed += Number(candidate.byte_size ?? 0)
          continue
        }

        try {
          // (1) The object first.
          const { error: removeError } = await serviceClient.storage
            .from(BUCKET_ID)
            .remove([candidate.storage_path])

          if (removeError && !isMissingObject(removeError)) {
            itemsFailed += 1
            continue
          }

          // (2) The flag second. A crash between the two leaves exactly one
          //     row to re-process, and the retry converges.
          const { error: flagError } = await serviceClient
            .from('report_media')
            .update({ purged_at: new Date().toISOString() })
            .eq('id', candidate.id)

          if (flagError) {
            itemsFailed += 1
            continue
          }

          itemsProcessed += 1
          bytesReclaimed += Number(candidate.byte_size ?? 0)
        } catch {
          itemsFailed += 1
        }
      }

      if (candidates.length < DEFAULT_BATCH_SIZE) break
    }

    // The row is closed on **every** invocation, dry run included. A dry run
    // that leaves its row `running` would show up in the runbook's monitor
    // stage as a stale in-flight job, and the monitor reads those rows as a
    // signal that something died mid-flight.
    await closeJobRun(serviceClient, runId, 'succeeded', {
      itemsProcessed,
      itemsFailed,
      bytesReclaimed,
    })

    logEvent('info', {
      requestId,
      jobName: 'purge_media',
      action: dryRun ? 'dry_run' : 'completed',
      itemsProcessed,
      itemsFailed,
      bytesReclaimed,
    })

    return successResponse({
      job_name: 'purge_media',
      items_processed: itemsProcessed,
      items_failed: itemsFailed,
      bytes_reclaimed: bytesReclaimed,
      dry_run: dryRun,
      retention_days: MEDIA_RETENTION_DAYS,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown purge failure'

    await closeJobRun(serviceClient, runId, 'failed', {
      itemsProcessed,
      itemsFailed,
      bytesReclaimed,
      errorDetail: detail,
    })

    logEvent('error', {
      requestId,
      jobName: 'purge_media',
      action: 'failed',
      itemsProcessed,
      itemsFailed,
    })

    return errorResponse('INTERNAL', undefined, { error_detail: detail })
  }
})

/**
 * A missing Storage object is a **no-op success**, not a failure.
 *
 * The delete is idempotent: the object may already be gone because of a crash
 * between the delete and the `purged_at` write, or because an operator
 * removed it. The retry must converge, not loop.
 */
function isMissingObject(error: { message?: string; statusCode?: number }): boolean {
  const message = error.message ?? ''
  return error.statusCode === 404 || /not found|does not exist|no such file/i.test(message)
}

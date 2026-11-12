/**
 * The geocode-cache eviction job.
 *
 * `POST /functions/v1/cleanup-geocode-cache` with the **service-role**
 * bearer. It is not a client-callable endpoint.
 *
 * The unit owns **eviction only** — it never writes a cache row, never
 * updates `last_hit_at`, and never changes the schema. A cache miss costs one
 * re-resolve, so this job is a safety valve against unbounded growth rather
 * than a correctness requirement.
 *
 * The TTL is anchored on `created_at`, **not** `last_hit_at`: a hot entry
 * still expires at 90 days and is re-resolved once. That keeps the table's
 * growth bounded by the number of distinct coordinates seen in 90 days.
 *
 * The job is idempotent by predicate: a row that has been evicted no longer
 * exists, so a second run's predicate simply matches fewer rows. There is no
 * "purged" marker on a cache row — that is the whole idempotency argument.
 */

import { GEOCODE_CACHE_TTL_DAYS } from '@shared/jobs/index.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { logEvent } from '../_shared/logger.ts';
import { CallerError, requireServiceRole } from '../_shared/auth.ts';
import { closeJobRun, newRequestId, recordJobRun } from '../_shared/job-runner.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCHES = 20;

interface EvictionCandidate {
  key: string;
}

Deno.serve(async (request) => {
  const requestId = newRequestId();

  try {
    requireServiceRole(request);
  } catch (error) {
    if (error instanceof CallerError) {
      return errorResponse(error.code === 'INTERNAL' ? 'INTERNAL' : 'FORBIDDEN');
    }
    return errorResponse('INTERNAL');
  }

  const serviceClient = createServiceClient();

  const runId = await recordJobRun(serviceClient, 'cleanup_geocode_cache');
  if (!runId) {
    logEvent('error', {
      requestId,
      jobName: 'cleanup_geocode_cache',
      action: 'job_run_open_failed',
    });
    return errorResponse('INTERNAL');
  }

  let itemsProcessed = 0;
  let itemsFailed = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const { data, error } = await serviceClient.rpc('job_geocode_cache_evictions', {
        p_batch_size: DEFAULT_BATCH_SIZE,
      });

      if (error) throw error;

      const candidates = (data ?? []) as EvictionCandidate[];
      if (candidates.length === 0) break;

      // The batch is deleted by key. The predicate is re-evaluated between
      // batches, so a large backlog cannot time the function out.
      const { error: deleteError } = await serviceClient
        .from('geocode_cache')
        .delete()
        .in(
          'key',
          candidates.map((candidate) => candidate.key),
        );

      if (deleteError) {
        itemsFailed += candidates.length;
      } else {
        itemsProcessed += candidates.length;
      }

      if (candidates.length < DEFAULT_BATCH_SIZE) break;
    }

    await closeJobRun(serviceClient, runId, 'succeeded', {
      itemsProcessed,
      itemsFailed,
    });

    logEvent('info', {
      requestId,
      jobName: 'cleanup_geocode_cache',
      action: 'completed',
      itemsProcessed,
      itemsFailed,
    });

    return successResponse({
      job_name: 'cleanup_geocode_cache',
      items_processed: itemsProcessed,
      items_failed: itemsFailed,
      ttl_days: GEOCODE_CACHE_TTL_DAYS,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown cleanup failure';

    await closeJobRun(serviceClient, runId, 'failed', {
      itemsProcessed,
      itemsFailed,
      errorDetail: detail,
    });

    logEvent('error', {
      requestId,
      jobName: 'cleanup_geocode_cache',
      action: 'failed',
      itemsProcessed,
      itemsFailed,
    });

    return errorResponse('INTERNAL', undefined, { error_detail: detail });
  }
});

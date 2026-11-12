/**
 * The free-tier heartbeat.
 *
 * `POST /functions/v1/keep-project-awake` with the **service-role**
 * bearer. It is not a client-callable endpoint.
 *
 * Supabase pauses a free project after a period of inactivity. The
 * heartbeat is the control that keeps it awake: a trivial, cheap
 * invocation on a cadence well inside the pause window (NFR-Availability).
 *
 * It is a **reliability** control, not an optimisation:
 *   * it reads nothing but the project's own job history
 *   * it writes nothing but its own `job_runs` audit row
 *   * it never touches a report, a profile, a contact, or a media object
 *
 * There is no worklist, so the counts are always zero. The heartbeat's
 * success **is** the audit row — a missing row means the heartbeat stopped,
 * and the runbook's monitor stage reads exactly that.
 */

import { errorResponse, successResponse } from '../_shared/http.ts';
import { logEvent } from '../_shared/logger.ts';
import { CallerError, requireServiceRole } from '../_shared/auth.ts';
import { closeJobRun, newRequestId, recordJobRun } from '../_shared/job-runner.ts';
import { createServiceClient } from '../_shared/supabase.ts';

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

  const runId = await recordJobRun(serviceClient, 'keep_project_awake');
  if (!runId) {
    logEvent('error', {
      requestId,
      jobName: 'keep_project_awake',
      action: 'job_run_open_failed',
    });
    return errorResponse('INTERNAL');
  }

  try {
    // (1) The liveness ping — a `select 1` inside the database.
    const { error: pingError } = await serviceClient.rpc('job_keep_project_awake_ping');
    if (pingError) throw pingError;

    // (2) The no-op read — the latest heartbeat row for this job, so the
    //     heartbeat confirms it can read the audit trail it writes to.
    const { error: readError } = await serviceClient
      .from('job_runs')
      .select('id')
      .eq('job_name', 'keep_project_awake')
      .order('started_at', { ascending: false })
      .limit(1);

    if (readError) throw readError;

    await closeJobRun(serviceClient, runId, 'succeeded', {
      itemsProcessed: 0,
      itemsFailed: 0,
    });

    logEvent('info', {
      requestId,
      jobName: 'keep_project_awake',
      action: 'completed',
      itemsProcessed: 0,
      itemsFailed: 0,
    });

    return successResponse({
      job_name: 'keep_project_awake',
      items_processed: 0,
      items_failed: 0,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown heartbeat failure';

    await closeJobRun(serviceClient, runId, 'failed', {
      itemsProcessed: 0,
      itemsFailed: 0,
      errorDetail: detail,
    });

    logEvent('error', {
      requestId,
      jobName: 'keep_project_awake',
      action: 'failed',
      itemsProcessed: 0,
      itemsFailed: 0,
    });

    return errorResponse('INTERNAL', undefined, { error_detail: detail });
  }
});

/**
 * The 30-day deleted-account PII purge.
 *
 * `POST /functions/v1/purge-deleted-accounts` with the **service-role**
 * bearer. It is not a client-callable endpoint.
 *
 * What it does, per candidate account:
 *   1. Replaces the phone and the email with non-reversible, non-identifying
 *      placeholders — the `profiles` row survives as a tombstone so the
 *      report and moderation foreign keys keep holding.
 *   2. Deletes the emergency contacts and the location-share audit rows.
 *   3. Deletes the `auth.users` row — the identity that was deliberately
 *      preserved through the soft-delete window is destroyed once the window
 *      closes.
 *   4. Sets `profiles.pii_purged_at`.
 *
 * What it never does:
 *   * it never deletes the `reports` rows — the report metadata survives with
 *     its category, description, area, coordinates, capture time, and
 *     moderation status intact
 *   * it never runs before the 30-day window closes — the predicate is
 *     evaluated server-side by Postgres `now()`
 */

import { ACCOUNT_RECOVERY_WINDOW_DAYS } from '@shared/jobs/index.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { logEvent } from '../_shared/logger.ts';
import { CallerError, requireServiceRole } from '../_shared/auth.ts';
import { closeJobRun, hashUserId, newRequestId, recordJobRun } from '../_shared/job-runner.ts';
import { buildTombstoneValues } from '@shared/jobs/index.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCHES = 20;

interface PurgedAccount {
  id: string;
  deleted_at: string;
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

  const runId = await recordJobRun(serviceClient, 'purge_deleted_accounts');
  if (!runId) {
    logEvent('error', {
      requestId,
      jobName: 'purge_deleted_accounts',
      action: 'job_run_open_failed',
    });
    return errorResponse('INTERNAL');
  }

  let itemsProcessed = 0;
  let itemsFailed = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const { data, error } = await serviceClient.rpc('job_purge_deleted_accounts', {
        p_batch_size: DEFAULT_BATCH_SIZE,
      });

      if (error) throw error;

      const candidates = (data ?? []) as PurgedAccount[];
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        try {
          await purgeAccount(serviceClient, candidate.id);
          itemsProcessed += 1;
        } catch {
          // The account keeps `pii_purged_at IS NULL`, so the next run resumes
          // it. The run itself continues with the other candidates.
          itemsFailed += 1;
          logEvent('warn', {
            requestId,
            jobName: 'purge_deleted_accounts',
            action: 'account_purge_failed',
            account: hashUserId(candidate.id),
          });
        }
      }

      if (candidates.length < DEFAULT_BATCH_SIZE) break;
    }

    await closeJobRun(serviceClient, runId, 'succeeded', {
      itemsProcessed,
      itemsFailed,
    });

    logEvent('info', {
      requestId,
      jobName: 'purge_deleted_accounts',
      action: 'completed',
      itemsProcessed,
      itemsFailed,
    });

    return successResponse({
      job_name: 'purge_deleted_accounts',
      items_processed: itemsProcessed,
      items_failed: itemsFailed,
      window_days: ACCOUNT_RECOVERY_WINDOW_DAYS,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown purge failure';

    await closeJobRun(serviceClient, runId, 'failed', {
      itemsProcessed,
      itemsFailed,
      errorDetail: detail,
    });

    logEvent('error', {
      requestId,
      jobName: 'purge_deleted_accounts',
      action: 'failed',
      itemsProcessed,
      itemsFailed,
    });

    return errorResponse('INTERNAL', undefined, { error_detail: detail });
  }
});

/**
 * Scrubs one account.
 *
 * The order is deliberate: the PII goes first, the identity second, and the
 * `pii_purged_at` stamp last. A crash between the steps leaves the account
 * un-stamped, so the next run re-runs the scrub — and the scrub is written to
 * be re-runnable.
 */
async function purgeAccount(
  client: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<void> {
  const tombstone = buildTombstoneValues(userId);

  // (1) The PII becomes a non-identifying tombstone. The row survives.
  const { error: profileError } = await client
    .from('profiles')
    .update({
      phone: tombstone.phone,
      email: tombstone.email,
      full_name: null,
      alternate_phone: null,
    })
    .eq('id', userId);

  if (profileError) throw profileError;

  // (2) The contacts are the user's PII; the location rows carry the shared
  //     coordinates. Both go.
  const { error: contactsError } = await client
    .from('contacts')
    .delete()
    .eq('user_id', userId);

  if (contactsError) throw contactsError;

  const { error: sharesError } = await client
    .from('location_shares')
    .delete()
    .eq('sender_id', userId);

  if (sharesError) throw sharesError;

  // (3) The Auth identity is destroyed — the soft-delete window has closed.
  const { error: authError } = await client.auth.admin.deleteUser(userId);
  if (authError && !isMissingUser(authError)) throw authError;

  // (4) The stamp last, so an interrupted scrub is retried.
  const { error: stampError } = await client
    .from('profiles')
    .update({ pii_purged_at: new Date().toISOString() })
    .eq('id', userId);

  if (stampError) throw stampError;
}

/** A missing Auth user is a no-op success, so the retry converges. */
function isMissingUser(error: { message?: string; statusCode?: number }): boolean {
  const message = error.message ?? '';
  return error.statusCode === 404 || /not found|does not exist/i.test(message);
}

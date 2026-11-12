/**
 * The shared job runner — the **only** writer of `job_runs`.
 *
 * Structural property: every job opens exactly one `job_runs` row at the
 * start of an invocation and closes it at the end (`succeeded` or `failed`).
 * A job that dies mid-flight leaves a `running` row with a null
 * `finished_at`; the runbook's monitor stage reads those rows, it never
 * deletes them.
 *
 * The runner is deliberately dumb: it opens, closes, and counts. It knows
 * nothing about media, accounts, or the geocode cache.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashUserId } from '@shared/jobs/index.ts';

/** The closed vocabulary of `job_runs.job_name`. */
export const JOB_NAMES = [
  'purge_media',
  'cleanup_geocode_cache',
  'purge_deleted_accounts',
  'keep_project_awake',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export type JobStatus = 'running' | 'succeeded' | 'failed';

export interface JobRunCounts {
  itemsProcessed?: number;
  itemsFailed?: number;
  bytesReclaimed?: number;
  errorDetail?: string | null;
}

/**
 * Opens the single `job_runs` row for an invocation.
 *
 * Returns the run id, or `null` when the row could not be opened. A `null`
 * is a hard failure for a job: the audit trail is the contract, so a job that
 * cannot open its row must not proceed.
 */
export async function recordJobRun(
  client: SupabaseClient,
  jobName: JobName,
): Promise<string | null> {
  const { data, error } = await client
    .from('job_runs')
    .insert({ job_name: jobName, status: 'running' })
    .select('id')
    .maybeSingle();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Closes the `job_runs` row with the outcome of the invocation.
 *
 * `finished_at` is always written, and `error_detail` is non-null whenever
 * the status is `failed`.
 */
export async function closeJobRun(
  client: SupabaseClient,
  runId: string,
  status: Exclude<JobStatus, 'running'>,
  counts: JobRunCounts = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    items_processed: counts.itemsProcessed ?? 0,
    items_failed: counts.itemsFailed ?? 0,
    bytes_reclaimed: counts.bytesReclaimed ?? 0,
    finished_at: new Date().toISOString(),
    error_detail: status === 'failed' ? (counts.errorDetail ?? 'Job failed') : null,
  };

  await client.from('job_runs').update(patch).eq('id', runId);
}

/** A fresh request id for one invocation. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export { hashUserId };

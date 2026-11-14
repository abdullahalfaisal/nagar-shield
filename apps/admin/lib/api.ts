import { AppError, type ApiErrorCode } from '@nagar-shield/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrowserClient } from './supabase/client';

/**
 * The console's API layer.
 *
 * Every read is an **RPC** and every write is an **Edge Function**, and every
 * one of them is authorized **server-side** by the moderator role check inside
 * the function. The console never holds a credential more powerful than the
 * moderator's own session, and the service-role key never appears anywhere in
 * this package.
 *
 * The functions return the uniform `{ data }` / `{ error }` envelope, and the
 * errors are collapsed to the shared stable codes so the UI switches on
 * `code` and never on the raw message.
 */

// -----------------------------------------------------------------------------
// The shared read model shapes
// -----------------------------------------------------------------------------

export interface QueueFlag {
  id: string;
  reason: string;
  flaggerId: string;
  createdAt: string;
}

export interface QueueMedia {
  id: string;
  storagePath: string;
  mediaType: 'photo' | 'video' | 'file';
  byteSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export interface QueueUploader {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  role: 'citizen' | 'moderator';
  disabledAt: string | null;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  category: string | null;
  description: string | null;
  areaHierarchy: {
    division?: string | null;
    city?: string | null;
    thana?: string | null;
    neighborhood?: string | null;
  } | null;
  capturedAt: string;
  publicVisibility: 'anonymous' | 'identified';
  flagCount: number;
  authorFlags24h: number;
  hideReason: 'flag_threshold' | 'author_auto_hide' | 'both' | 'manual';
  flags: QueueFlag[];
  media: QueueMedia[];
  uploader: QueueUploader | null;
}

export interface QueuePage {
  items: QueueItem[];
  nextCursor: string | null;
}

export interface ReportDetail {
  id: string;
  category: string | null;
  description: string | null;
  areaHierarchy: {
    division?: string | null;
    city?: string | null;
    thana?: string | null;
    neighborhood?: string | null;
  } | null;
  capturedAt: string;
  publicVisibility: 'anonymous' | 'identified';
  moderationStatus: 'visible' | 'hidden_pending_review' | 'restored' | 'removed';
  hideReason: 'flag_threshold' | 'author_auto_hide' | 'both' | 'manual' | null;
  flagCount: number;
  flags: QueueFlag[];
  media: QueueMedia[];
  uploader: QueueUploader | null;
  priorActions: AuditAction[];
}

export interface AuditAction {
  id: string;
  reportId: string | null;
  moderatorId: string | null;
  moderatorDisplayName: string | null;
  targetUserId: string | null;
  decision: 'restore' | 'remove' | 'disable_user';
  note: string;
  createdAt: string;
}

export interface AuditPage {
  items: AuditAction[];
  nextCursor: string | null;
}

export interface AccountRow {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  role: 'citizen' | 'moderator';
  disabledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reportCount: number;
}

// -----------------------------------------------------------------------------
// The raw wire shapes
// -----------------------------------------------------------------------------

interface RawQueueEnvelope {
  items?: unknown;
  next_cursor?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function toQueueFlag(raw: unknown): QueueFlag {
  const record = asRecord(raw);
  return {
    id: asString(record.id) ?? '',
    reason: asString(record.reason) ?? 'other',
    flaggerId: asString(record.flagger_id) ?? '',
    createdAt: asString(record.created_at) ?? '',
  };
}

function toQueueMedia(raw: unknown): QueueMedia {
  const record = asRecord(raw);
  return {
    id: asString(record.id) ?? '',
    storagePath: asString(record.storage_path) ?? '',
    mediaType: (asString(record.media_type) as QueueMedia['mediaType']) ?? 'photo',
    byteSize: asNumber(record.byte_size),
    durationSeconds: typeof record.duration_seconds === 'number' ? record.duration_seconds : null,
    width: typeof record.width === 'number' ? record.width : null,
    height: typeof record.height === 'number' ? record.height : null,
  };
}

function toUploader(raw: unknown): QueueUploader | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = asRecord(raw);
  return {
    id: asString(record.id) ?? '',
    fullName: asString(record.full_name),
    phone: asString(record.phone),
    email: asString(record.email),
    role: (asString(record.role) as QueueUploader['role']) ?? 'citizen',
    disabledAt: asString(record.disabled_at),
    createdAt: asString(record.created_at) ?? '',
  };
}

function toQueueItem(raw: unknown): QueueItem {
  const record = asRecord(raw);
  return {
    id: asString(record.id) ?? '',
    category: asString(record.category),
    description: asString(record.description),
    areaHierarchy: (asRecord(record.area_hierarchy) as QueueItem['areaHierarchy']) ?? null,
    capturedAt: asString(record.captured_at) ?? '',
    publicVisibility: (asString(record.public_visibility) as QueueItem['publicVisibility']) ?? 'anonymous',
    flagCount: asNumber(record.flag_count),
    authorFlags24h: asNumber(record.author_flags_24h),
    hideReason: (asString(record.hide_reason) as QueueItem['hideReason']) ?? 'flag_threshold',
    flags: Array.isArray(record.flags) ? record.flags.map(toQueueFlag) : [],
    media: Array.isArray(record.media) ? record.media.map(toQueueMedia) : [],
    uploader: toUploader(record.uploader),
  };
}

function toAuditAction(raw: unknown): AuditAction {
  const record = asRecord(raw);
  return {
    id: asString(record.id) ?? '',
    reportId: asString(record.report_id),
    moderatorId: asString(record.moderator_id),
    moderatorDisplayName: asString(record.moderator_display_name),
    targetUserId: asString(record.target_user_id),
    decision: (asString(record.decision) as AuditAction['decision']) ?? 'remove',
    note: asString(record.note) ?? '',
    createdAt: asString(record.created_at) ?? '',
  };
}

function toAccountRow(raw: unknown): AccountRow {
  const record = asRecord(raw);
  return {
    id: asString(record.id) ?? '',
    fullName: asString(record.full_name),
    phone: asString(record.phone),
    email: asString(record.email),
    role: (asString(record.role) as AccountRow['role']) ?? 'citizen',
    disabledAt: asString(record.disabled_at),
    deletedAt: asString(record.deleted_at),
    createdAt: asString(record.created_at) ?? '',
    reportCount: asNumber(record.report_count),
  };
}

// -----------------------------------------------------------------------------
// Error mapping
// -----------------------------------------------------------------------------

/**
 * Collapses a Supabase / PostgREST error into the shared stable code.
 *
 * The raw driver text never reaches the UI — the console switches on `code`
 * and resolves a localized string from it.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (!error) return new AppError('INTERNAL');

  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? '';
  const message = candidate.message ?? '';

  switch (code) {
    case '23505':
      return new AppError('CONFLICT');
    case '23503':
    case '23514':
    case '23502':
    case '22023':
      return new AppError('VALIDATION_FAILED');
    case '42501':
      return new AppError('FORBIDDEN');
    case 'P0002':
      return new AppError('NOT_FOUND');
    case 'PGRST116':
      return new AppError('NOT_FOUND');
    case 'PGRST301':
      return new AppError('AUTH_REQUIRED');
    default:
      break;
  }

  if (/row-level security|permission denied/i.test(message)) return new AppError('FORBIDDEN');
  if (/not authenticated|jwt/i.test(message)) return new AppError('AUTH_REQUIRED');
  if (/not found/i.test(message)) return new AppError('NOT_FOUND');

  return new AppError('INTERNAL');
}

/** Reads the stable code out of an Edge Function's error envelope. */
export function parseErrorBody(body: unknown): AppError {
  if (body && typeof body === 'object' && 'error' in body) {
    const envelope = asRecord(asRecord(body).error);
    const code = asString(envelope.code);
    if (code) {
      return new AppError(code as ApiErrorCode, undefined, asString(envelope.message) ?? undefined);
    }
  }
  return new AppError('INTERNAL');
}

// -----------------------------------------------------------------------------
// The reads
// -----------------------------------------------------------------------------

/** The moderator-only queue of reports awaiting review. */
export async function fetchModerationQueue(
  client: SupabaseClient,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<QueuePage> {
  const { data, error } = await client.rpc('moderation_queue', {
    p_cursor: options.cursor ?? null,
    p_limit: options.limit ?? 20,
  });

  if (error) throw toAppError(error);

  const envelope = asRecord(data) as RawQueueEnvelope;
  const items = Array.isArray(envelope.items) ? envelope.items.map(toQueueItem) : [];

  return { items, nextCursor: envelope.next_cursor ?? null };
}

/** The full review detail for one report. */
export async function fetchReportDetail(
  client: SupabaseClient,
  reportId: string,
): Promise<ReportDetail> {
  const { data, error } = await client.rpc('moderation_report_detail', {
    p_report_id: reportId,
  });

  if (error) throw toAppError(error);

  const record = asRecord(data);
  const detail: ReportDetail = {
    id: asString(record.id) ?? reportId,
    category: asString(record.category),
    description: asString(record.description),
    areaHierarchy: (asRecord(record.area_hierarchy) as ReportDetail['areaHierarchy']) ?? null,
    capturedAt: asString(record.captured_at) ?? '',
    publicVisibility:
      (asString(record.public_visibility) as ReportDetail['publicVisibility']) ?? 'anonymous',
    moderationStatus:
      (asString(record.moderation_status) as ReportDetail['moderationStatus']) ?? 'visible',
    hideReason: asString(record.hide_reason) as ReportDetail['hideReason'],
    flagCount: asNumber(record.flag_count),
    flags: Array.isArray(record.flags) ? record.flags.map(toQueueFlag) : [],
    media: Array.isArray(record.media) ? record.media.map(toQueueMedia) : [],
    uploader: toUploader(record.uploader),
    priorActions: Array.isArray(record.prior_actions)
      ? record.prior_actions.map(toAuditAction)
      : [],
  };

  return detail;
}

/**
 * A signed URL for one media object.
 *
 * The `report-media` bucket is **private** — the bytes are never public, and
 * a moderator reads them through a signed URL rather than a public one. The
 * database already allows this: the `report_media_select_moderator` Storage
 * policy grants a moderator `SELECT` on every object in the bucket, so the
 * console signs the URL with the moderator's **own session** and the anon key.
 * No service-role credential is involved.
 *
 * The URL is short-lived (ten minutes) and is never written to a query key, a
 * URL, or a log — it lives in component state for as long as the preview is on
 * screen, and it is re-requested on demand.
 *
 * A URL that cannot be signed returns `null` rather than throwing: the story's
 * rule is that an unavailable preview shows a neutral placeholder, never a
 * broken image and never a failed screen.
 */
export async function signMediaUrl(
  client: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  if (!storagePath) return null;

  const { data, error } = await client.storage
    .from('report-media')
    .createSignedUrl(storagePath, 60 * 10);

  if (error) return null;

  return data?.signedUrl ?? null;
}

/** The append-only audit trail, newest first. */
export async function fetchAuditTrail(
  client: SupabaseClient,
  options: { cursor?: string | null; limit?: number; decision?: string | null } = {},
): Promise<AuditPage> {
  const { data, error } = await client.rpc('moderation_audit_feed', {
    p_cursor: options.cursor ?? null,
    p_limit: options.limit ?? 20,
    p_decision: options.decision ?? null,
  });

  if (error) throw toAppError(error);

  const envelope = asRecord(data) as RawQueueEnvelope;
  const items = Array.isArray(envelope.items) ? envelope.items.map(toAuditAction) : [];

  return { items, nextCursor: envelope.next_cursor ?? null };
}

/** The exact-match account lookup. */
export async function searchAccounts(
  client: SupabaseClient,
  query: string,
): Promise<AccountRow[]> {
  const { data, error } = await client.rpc('moderator_search_users', {
    p_query: query.trim(),
  });

  if (error) throw toAppError(error);

  const envelope = asRecord(data);
  const items = Array.isArray(envelope.items) ? envelope.items.map(toAccountRow) : [];

  return items;
}

// -----------------------------------------------------------------------------
// The writes
// -----------------------------------------------------------------------------

/**
 * The restore / remove decision.
 *
 * The note is validated **here** before the request is sent, and again by the
 * shared Zod schema inside the Edge Function, and again by the database CHECK
 * — three layers, and the outermost one is a UX affordance so the moderator
 * gets an immediate answer instead of a round-trip.
 */
export async function submitDecision(
  client: SupabaseClient,
  input: { reportId: string; decision: 'restore' | 'remove'; note: string },
): Promise<void> {
  const note = input.note.trim();

  if (note.length === 0) {
    throw new AppError('VALIDATION_FAILED', { field: 'note' });
  }

  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new AppError('AUTH_REQUIRED');
  }

  const response = await fetch(`${supabaseUrl()}/functions/v1/moderation-decide`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report_id: input.reportId,
      decision: input.decision,
      note,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw parseErrorBody(body);
  }
}

/** The account disable, with its required reason. */
export async function disableAccount(
  client: SupabaseClient,
  input: { userId: string; note: string },
): Promise<void> {
  const note = input.note.trim();

  if (note.length === 0) {
    throw new AppError('VALIDATION_FAILED', { field: 'note' });
  }

  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new AppError('AUTH_REQUIRED');
  }

  const response = await fetch(`${supabaseUrl()}/functions/v1/disable-user`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: input.userId,
      note,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw parseErrorBody(body);
  }
}

/** The Supabase project URL. Public by design. */
export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return value;
}

/** The Supabase anon key. Public by design — RLS is the boundary. */
export function supabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return value;
}

/** The browser client. Exported so the routes share one instance. */
export { getBrowserClient };

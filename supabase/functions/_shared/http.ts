/**
 * The shared request/response plumbing for the Edge Functions.
 *
 * The uniform envelope (`memory-bank/standards/api-conventions.md`):
 *   * success → `{ "data": … }`
 *   * failure → `{ "error": { "code", "message", "details" } }`
 *
 * The error `code` is the stable, `SCREAMING_SNAKE_CASE` value the client
 * switches on. The `message` is an English developer-facing summary and is
 * never shown raw to a user — the client maps the code to a Bangla / English
 * string through the shared i18n bundles.
 */

import { API_ERROR_HTTP_STATUS, API_ERROR_MESSAGES, type ApiErrorCode } from '@shared/errors/index.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const;

/**
 * The CORS headers for the browser-facing functions.
 *
 * The admin console runs in a browser and calls the moderation functions
 * cross-origin. The scheduled jobs are server-to-server and never need CORS,
 * so they do not send these headers.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(payload: unknown, status = 200, cors = false): Response {
  const headers = cors ? { ...JSON_HEADERS, ...CORS_HEADERS } : { ...JSON_HEADERS };
  return new Response(JSON.stringify(payload), { status, headers });
}

export function successResponse<T>(data: T, status = 200, cors = false): Response {
  return jsonResponse({ data }, status, cors);
}

export function errorResponse(
  code: ApiErrorCode,
  message?: string,
  details?: Record<string, unknown>,
  cors = false,
): Response {
  const body: Record<string, unknown> = {
    code,
    message: message ?? API_ERROR_MESSAGES[code],
  };
  if (details) body.details = details;
  return jsonResponse({ error: body }, API_ERROR_HTTP_STATUS[code], cors);
}

/** The pre-flight answer for a browser-facing function. */
export function preflightResponse(cors = true): Response {
  const headers = cors ? { ...CORS_HEADERS } : {};
  return new Response('ok', { status: 204, headers });
}

/**
 * The Postgres / PostgREST errors the functions can raise, mapped onto the
 * stable code table. An unmapped error collapses to `INTERNAL` — the raw
 * driver text never reaches the client.
 */
export function mapDatabaseError(error: unknown): {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
} {
  const candidate = error as { code?: string; message?: string; details?: string } | null;
  const rawMessage = candidate?.message ?? '';
  const rawCode = candidate?.code ?? '';

  if (rawCode === '23505' || /duplicate key|already exists/i.test(rawMessage)) {
    return { code: 'CONFLICT', message: API_ERROR_MESSAGES.CONFLICT };
  }
  if (rawCode === '23503' || rawCode === '23514' || rawCode === '23502') {
    return { code: 'VALIDATION_FAILED', message: API_ERROR_MESSAGES.VALIDATION_FAILED };
  }
  if (rawCode === '42501') {
    if (/ACCOUNT_DISABLED/i.test(rawMessage)) {
      return { code: 'AUTH_DISABLED', message: API_ERROR_MESSAGES.AUTH_DISABLED };
    }
    if (/AUTH_REQUIRED/i.test(rawMessage)) {
      return { code: 'AUTH_REQUIRED', message: API_ERROR_MESSAGES.AUTH_REQUIRED };
    }
    return { code: 'FORBIDDEN', message: API_ERROR_MESSAGES.FORBIDDEN };
  }
  if (rawCode === 'P0002' || /not found/i.test(rawMessage)) {
    return { code: 'NOT_FOUND', message: API_ERROR_MESSAGES.NOT_FOUND };
  }
  if (/NOTE_REQUIRED/i.test(rawMessage) || /INVALID_DECISION/i.test(rawMessage)) {
    return { code: 'VALIDATION_FAILED', message: API_ERROR_MESSAGES.VALIDATION_FAILED };
  }
  if (/CANNOT_DISABLE_SELF|MODERATOR_TARGET/i.test(rawMessage)) {
    return { code: 'FORBIDDEN', message: API_ERROR_MESSAGES.FORBIDDEN };
  }
  if (/CAPTURE_RATE_LIMIT/i.test(rawMessage)) {
    return { code: 'CAPTURE_RATE_LIMIT', message: API_ERROR_MESSAGES.CAPTURE_RATE_LIMIT };
  }
  if (/FLAG_RATE_LIMIT/i.test(rawMessage)) {
    return { code: 'FLAG_RATE_LIMIT', message: API_ERROR_MESSAGES.FLAG_RATE_LIMIT };
  }

  return { code: 'INTERNAL', message: API_ERROR_MESSAGES.INTERNAL };
}

/** Turns a mapped database error into an HTTP response. */
export function databaseErrorResponse(error: unknown, cors = false): Response {
  const mapped = mapDatabaseError(error);
  return errorResponse(mapped.code, mapped.message, mapped.details, cors);
}

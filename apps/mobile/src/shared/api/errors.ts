import { AppError, type ApiErrorCode, type ApiErrorResponse } from '@nagar-shield/shared';

/**
 * Turns a Supabase / PostgREST error into a stable `AppError`.
 * Raw database messages never reach the UI — the caller switches on `code`.
 */
export function fromSupabaseError(error: unknown): AppError {
  if (!error) return new AppError('INTERNAL');

  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const code = candidate.code ?? '';
  const message = candidate.message ?? '';

  // Postgres error codes we map explicitly.
  switch (code) {
    case '23505': // unique_violation
      return new AppError('CONFLICT', { constraint: candidate.details });
    case '23503': // foreign_key_violation
      return new AppError('VALIDATION_FAILED');
    case '23514': // check_violation
      return new AppError('VALIDATION_FAILED');
    case '42501': // insufficient_privilege
      // The disabled-account guard raises `ACCOUNT_DISABLED` with this code.
      // It is the one 42501 that is not a plain permission problem, and the
      // user needs to be told their account is disabled — not that they
      // lack permission — so it is matched on the message before the
      // generic FORBIDDEN.
      if (/ACCOUNT_DISABLED/i.test(message)) {
        return new AppError('AUTH_DISABLED');
      }
      return new AppError('FORBIDDEN');
    case 'PGRST116': // no rows returned for a single-row select
      return new AppError('NOT_FOUND');
    case 'PGRST301': // JWT expired
      return new AppError('AUTH_REQUIRED');
    case '23502': // not_null_violation
      return new AppError('VALIDATION_FAILED');
    default:
      break;
  }

  // PostgREST surfaces RLS denials as a permission error without a code.
  if (/row-level security|permission denied/i.test(message)) {
    return new AppError('FORBIDDEN');
  }

  if (/not authenticated|jwt/i.test(message)) {
    return new AppError('AUTH_REQUIRED');
  }

  if (/rate limit|too many/i.test(message)) {
    return new AppError('FLAG_RATE_LIMIT');
  }

  return new AppError('INTERNAL');
}

/** Reads the stable code out of an error envelope returned by an Edge Function. */
export function parseErrorBody(body: unknown): AppError {
  if (body && typeof body === 'object' && 'error' in body) {
    const envelope = (body as ApiErrorResponse).error;
    if (envelope?.code) {
      return new AppError(
        envelope.code as ApiErrorCode,
        envelope.details,
        envelope.message,
      );
    }
  }
  return new AppError('INTERNAL');
}

/** True when the failure is a transport problem rather than a server rejection. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AppError) return false;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /network request failed|failed to fetch|timeout/i.test(message);
}

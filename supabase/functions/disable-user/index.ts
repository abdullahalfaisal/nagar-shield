/**
 * The remote account disable.
 *
 * `POST /functions/v1/disable-user` with the **moderator's** JWT.
 *
 * The same double gate as `moderation-decide`: the role is checked here
 * before anything is attempted, and again inside the `disable_user` RPC,
 * which is the actual writer and the owner of the audit row.
 *
 * The function never reveals the moderator's note to the citizen, and the
 * note is never echoed in the response — the citizen sees only the fixed
 * disable message.
 */

import { disableUserSchema } from '../_shared/contracts.ts';
import { authenticateCaller, assertModerator, CallerError } from '../_shared/auth.ts';
import { databaseErrorResponse, errorResponse, preflightResponse, successResponse } from '../_shared/http.ts';
import { logEvent } from '../_shared/logger.ts';
import { newRequestId } from '../_shared/job-runner.ts';
import { createServiceClient, createUserClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const requestId = newRequestId();

  if (request.method === 'OPTIONS') return preflightResponse();

  if (request.method !== 'POST') {
    return errorResponse('VALIDATION_FAILED', 'Only POST is accepted.');
  }

  try {
    const serviceClient = createServiceClient();
    const caller = await authenticateCaller(serviceClient, request);
    assertModerator(caller);

    const body = await request.json().catch(() => null);
    const parsed = disableUserSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('VALIDATION_FAILED', undefined, {
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { user_id, note } = parsed.data;

    if (user_id === caller.id) {
      return errorResponse('FORBIDDEN', 'A moderator cannot disable their own account.');
    }

    const userClient = createUserClient(callerToken(request));
    const { data, error } = await userClient.rpc('disable_user', {
      p_user_id: user_id,
      p_note: note,
    });

    if (error) {
      logEvent('warn', {
        requestId,
        action: 'disable_user_rejected',
        reason: 'rpc_error',
      });
      return databaseErrorResponse(error, true);
    }

    logEvent('info', {
      requestId,
      action: 'disable_user_applied',
    });

    return successResponse(data ?? { user_id, disabled: true }, 200, true);
  } catch (error) {
    if (error instanceof CallerError) {
      logEvent('warn', {
        requestId,
        action: 'disable_user_rejected',
        reason: error.code,
      });
      return errorResponse(error.code, undefined, undefined, true);
    }

    logEvent('error', {
      requestId,
      action: 'disable_user_failed',
    });

    return errorResponse('INTERNAL', undefined, undefined, true);
  }
});

/** The caller's bearer token, re-read for the user-scoped RPC call. */
function callerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

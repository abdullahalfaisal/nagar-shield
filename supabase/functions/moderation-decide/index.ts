/**
 * The moderator's restore / remove decision.
 *
 * `POST /functions/v1/moderation-decide` with the **moderator's** JWT.
 *
 * The role check happens twice on purpose:
 *   * here, in the function, before anything is attempted
 *   * again inside the `moderation_decide` RPC, which is the actual writer
 *
 * The RPC owns the write and the append-only audit row. This function is the
 * transport and the gate — it never writes the decision itself, so a bug in
 * the function can never bypass the database's own checks.
 */

import { moderationDecideSchema } from '../_shared/contracts.ts'
import { authenticateCaller, assertModerator, CallerError } from '../_shared/auth.ts'
import {
  databaseErrorResponse,
  errorResponse,
  preflightResponse,
  successResponse,
} from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { newRequestId } from '../_shared/job-runner.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

Deno.serve(async (request) => {
  const requestId = newRequestId()

  if (request.method === 'OPTIONS') return preflightResponse()

  if (request.method !== 'POST') {
    return errorResponse('VALIDATION_FAILED', 'Only POST is accepted.')
  }

  let callerId = 'unknown'

  try {
    const serviceClient = createServiceClient()
    const caller = await authenticateCaller(serviceClient, request)
    assertModerator(caller)
    callerId = caller.id

    const body = await request.json().catch(() => null)
    const parsed = moderationDecideSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse('VALIDATION_FAILED', undefined, {
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const { report_id, decision, note } = parsed.data

    // The RPC is the writer. It carries the role check, the state machine,
    // and the append-only `moderation_actions` row.
    const userClient = createUserClient(callerToken(request))
    const { data, error } = await userClient.rpc('moderation_decide', {
      p_report_id: report_id,
      p_decision: decision,
      p_note: note,
    })

    if (error) {
      logEvent('warn', {
        requestId,
        action: 'moderation_decide_rejected',
        decision,
        reason: 'rpc_error',
      })
      return databaseErrorResponse(error, true)
    }

    logEvent('info', {
      requestId,
      action: 'moderation_decide_applied',
      decision,
    })

    return successResponse(data ?? { report_id, decision }, 200, true)
  } catch (error) {
    if (error instanceof CallerError) {
      logEvent('warn', {
        requestId,
        action: 'moderation_decide_rejected',
        reason: error.code,
      })
      return errorResponse(error.code, undefined, undefined, true)
    }

    logEvent('error', {
      requestId,
      action: 'moderation_decide_failed',
    })

    return errorResponse('INTERNAL', undefined, undefined, true)
  }
})

/** The caller's bearer token, re-read for the user-scoped RPC call. */
function callerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

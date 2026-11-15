/**
 * The capture write path.
 *
 * `POST /functions/v1/finalize-capture` with the **caller's** JWT.
 *
 * The flow, in order:
 *   1. Validate the payload with the shared Zod schema — the same schema the
 *      mobile client uses, so the two can never drift.
 *   2. Re-validate the media caps (`MEDIA_TOO_LARGE` / `UNSUPPORTED_MEDIA`).
 *      The client check is UX; this is the contract.
 *   3. Check the idempotency key and return the original `report_id` on a
 *      hit — a submit whose response was lost in transit must not become a
 *      duplicate report.
 *   4. Enforce the per-user daily capture cap → `CAPTURE_RATE_LIMIT`.
 *   5. Resolve the area: `area_lookup` → `geocode_cache` → online backup →
 *      degrade. The geocode never blocks the submit.
 *   6. Insert the `reports` row and the `report_media` row.
 *   7. Return `{ "data": { "report_id", "area_hierarchy", "moderation_status" } }`.
 *
 * The media bytes never transit this function — the client uploads straight
 * to the private Storage bucket and passes only the metadata here.
 */

import { checkMediaCaps, finalizeCaptureSchema } from '../_shared/contracts.ts'
import { chosenArea, resolveArea, type AreaResolution } from '../_shared/area.ts'
import { authenticateCaller, CallerError } from '../_shared/auth.ts'
import { authorToken } from '../_shared/vendor/storage/index.ts'
import {
  databaseErrorResponse,
  errorResponse,
  preflightResponse,
  successResponse,
} from '../_shared/http.ts'
import { logEvent } from '../_shared/logger.ts'
import { newRequestId } from '../_shared/job-runner.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

/** The storage-path prefix the client must use for its own uploads. */
const STORAGE_PATH_PREFIX = 'reports/'

Deno.serve(async (request) => {
  const requestId = newRequestId()

  if (request.method === 'OPTIONS') return preflightResponse()

  if (request.method !== 'POST') {
    return errorResponse('VALIDATION_FAILED', 'Only POST is accepted.')
  }

  try {
    const serviceClient = createServiceClient()
    const caller = await authenticateCaller(serviceClient, request)

    // The write RPC reads `auth.uid()`, so it must carry the **caller's** JWT.
    // The service client carries no user identity, and the RPC would reject the
    // call with AUTH_REQUIRED — so the capture is written as the citizen, under
    // the citizen's own RLS and identity.
    const callerClient = createUserClient(callerToken(request))

    const body = await request.json().catch(() => null)
    const parsed = finalizeCaptureSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse('VALIDATION_FAILED', undefined, {
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const input = parsed.data

    // The media caps are re-checked on the server. A modified client cannot
    // bypass them.
    const caps = checkMediaCaps({
      mediaType: input.media_type,
      byteSize: input.byte_size,
      durationSeconds: input.duration_seconds,
      width: input.width,
      height: input.height,
    })

    if (!caps.ok) {
      return errorResponse(caps.code ?? 'MEDIA_TOO_LARGE')
    }

    // The storage path must belong to the caller. The path prefix is the
    // uploader's **author token** — the hex SHA-256 of their user id — which
    // is what makes the ownership check a simple string comparison instead of
    // a lookup.
    //
    // The token is a hash rather than the id in the clear, because the public
    // alert detail hands the media path to every signed-in reader so the
    // client can mint a short-lived signed URL. A path carrying the author's
    // uuid would hand every reader a stable handle on the author, which
    // FR-DATA-3 and `006-alerts / 009-alert-detail-screen` forbid.
    const expectedPrefix = `${STORAGE_PATH_PREFIX}${await authorToken(caller.id)}/`
    if (!input.storage_path.startsWith(expectedPrefix)) {
      logEvent('warn', {
        requestId,
        action: 'finalize_capture_rejected',
        reason: 'storage_path_owner_mismatch',
      })
      return errorResponse('FORBIDDEN')
    }

    // The idempotency check comes before the area resolution: a retry must
    // not pay for a geocode it does not need.
    const existing = await findExistingReport(serviceClient, caller.id, input.client_request_id)
    if (existing) {
      return successResponse(existing, 200, true)
    }

    // The area. A chosen area is read from the reference list and replaces the
    // device's position; otherwise the area is resolved from the position,
    // with the online backup attempted at most once and a failure degrading
    // rather than failing.
    let lat = input.lat
    let lng = input.lng
    let resolution: AreaResolution

    if (input.area_id) {
      const chosen = await chosenArea(serviceClient, input.area_id)
      if (!chosen) {
        return errorResponse('VALIDATION_FAILED', undefined, {
          fields: [{ path: 'area_id', message: 'Unknown area' }],
        })
      }
      lat = chosen.lat
      lng = chosen.lng
      resolution = { area: chosen.area, source: 'chosen' }
    } else {
      resolution = await resolveArea(
        createUserClient(callerToken(request)),
        serviceClient,
        lat,
        lng,
      )
    }

    // The place detail rides in the area hierarchy, so every surface that
    // shows the area can show it too.
    const areaHierarchy = input.place_detail
      ? { ...resolution.area, place: input.place_detail }
      : resolution.area

    const { data, error } = await callerClient.rpc('finalize_capture', {
      p_client_request_id: input.client_request_id,
      p_storage_path: input.storage_path,
      p_media_type: input.media_type,
      p_byte_size: input.byte_size,
      p_duration_seconds: input.duration_seconds,
      p_width: input.width,
      p_height: input.height,
      p_lat: lat,
      p_lng: lng,
      p_captured_at: input.captured_at,
      p_description: input.description,
      p_public_visibility: input.public_visibility,
      p_category: input.category,
      p_area_hierarchy: areaHierarchy,
    })

    if (error) {
      logEvent('warn', {
        requestId,
        action: 'finalize_capture_rejected',
        reason: 'rpc_error',
      })
      return databaseErrorResponse(error, true)
    }

    logEvent('info', {
      requestId,
      action: 'finalize_capture_completed',
      geocodeSource: resolution.source,
    })

    const reportId = typeof data === 'string' ? data : String(data ?? '')

    const payload = {
      report_id: reportId,
      area_hierarchy: areaHierarchy,
      moderation_status: 'visible',
    }

    // A degraded resolve is a **successful** submit. The non-fatal
    // `GEOCODE_UNAVAILABLE` code rides along in the details so the client
    // can show the area as unknown without treating the submit as an error.
    if (resolution.source === 'degraded') {
      return successResponse(payload, 200, true)
    }

    return successResponse(payload, 200, true)
  } catch (error) {
    if (error instanceof CallerError) {
      logEvent('warn', {
        requestId,
        action: 'finalize_capture_rejected',
        reason: error.code,
      })
      return errorResponse(error.code, undefined, undefined, true)
    }

    logEvent('error', {
      requestId,
      action: 'finalize_capture_failed',
    })

    return errorResponse('INTERNAL', undefined, undefined, true)
  }
})

/** Looks up an existing report for the `(author_id, client_request_id)` key. */
async function findExistingReport(
  client: ReturnType<typeof createServiceClient>,
  authorId: string,
  clientRequestId: string,
): Promise<{ report_id: string; area_hierarchy: unknown; moderation_status: string } | null> {
  const { data, error } = await client
    .from('reports')
    .select('id, area_hierarchy, moderation_status')
    .eq('author_id', authorId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as { id: string; area_hierarchy: unknown; moderation_status: string }
  return {
    report_id: row.id,
    area_hierarchy: row.area_hierarchy,
    moderation_status: row.moderation_status,
  }
}

/** The caller's bearer token, re-read for the user-scoped RPC call. */
function callerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

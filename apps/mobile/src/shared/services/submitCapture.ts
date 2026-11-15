import { File } from 'expo-file-system'
import { sha256Hex } from './sha256'
import { AppError, type PublicVisibility, type ReportCategory } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { parseErrorBody } from '@/shared/api/errors'
import { buildStoragePath, newClientRequestId, type PreparedMedia } from './mediaPipeline'

/**
 * The capture write path — the client half.
 *
 * The order is fixed:
 *
 *   1. upload the sanitised media straight to the **private** bucket
 *      (the bytes never transit the Edge Function)
 *   2. call `finalize-capture` with the metadata only
 *
 * A failed upload must **not** block the user: the caller catches the error
 * and hands the payload to the offline queue.
 */

export interface CaptureSubmission {
  clientRequestId: string
  media: PreparedMedia
  lat: number
  lng: number
  capturedAt: string
  description: string | null
  publicVisibility: PublicVisibility
  /** The incident type the citizen picked, or null to set it later. */
  category: ReportCategory | null
  /** An area chosen from the reference list; the server files the report there. */
  areaId?: string | null
  /** A road, shop or landmark the citizen typed with the chosen area. */
  placeDetail?: string | null
}

export interface CaptureResult {
  reportId: string
  areaHierarchy: {
    division: string | null
    city: string | null
    thana: string | null
    neighborhood: string | null
  } | null
  moderationStatus: string
}

/**
 * The wire shape of the `finalize-capture` response.
 *
 * The Edge Function answers in **snake_case** — `report_id`,
 * `area_hierarchy`, `moderation_status` — because that is what the Postgres
 * row and the RPC return. The app's own type is camelCase, so the mapping
 * happens here, at the boundary, and nowhere else.
 *
 * This boundary is where a silent failure once lived: the client read
 * `data.reportId` from a body that carries `report_id`, so `data.reportId`
 * was always `undefined` and **every successful capture was misread as a
 * failure** and handed to the offline queue. The app then showed "saved on
 * device" for a report that had in fact been filed, and the queue drained it
 * again as a duplicate.
 */
interface CaptureResponseBody {
  report_id?: string
  area_hierarchy?: {
    division: string | null
    city: string | null
    thana: string | null
    neighborhood: string | null
  } | null
  moderation_status?: string
}

/** The private bucket the report media lives in. */
const MEDIA_BUCKET = 'report-media'

/**
 * Whether a failed upload failed only because the object is already there.
 *
 * Storage answers HTTP 400 with `statusCode: "409"`, `error: "Duplicate"` and
 * the message "The resource already exists".
 */
function isAlreadyUploaded(error: unknown): boolean {
  const { message, statusCode, status } = (error ?? {}) as {
    message?: string
    statusCode?: string | number
    status?: number
  }
  return (
    String(statusCode) === '409' ||
    status === 409 ||
    /already exists|duplicate/i.test(message ?? '')
  )
}

/**
 * Uploads the sanitised media and finalizes the report.
 *
 * The storage path is built from the caller's own id, so the Storage policy
 * accepts the insert and the Edge Function's ownership check passes.
 */
export async function submitCapture(submission: CaptureSubmission): Promise<CaptureResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session

  if (!session) {
    throw new AppError('AUTH_REQUIRED')
  }

  const authorId = session.user.id

  const fileName = `${submission.clientRequestId}.${submission.media.extension}`
  const storagePath = buildStoragePath({
    authorId,
    clientRequestId: submission.clientRequestId,
    fileName,
    authorToken: await authorTokenOnDevice(authorId),
  })

  // (1) The bytes go straight to the bucket.
  //
  // Never "replace" (`upsert`). A retry after a lost confirmation uploads the
  // same path again, and replacing an object is an UPDATE, which the bucket's
  // policies do not grant: the retry was refused for good and never reached the
  // idempotent `finalize-capture` call, so a report that had in fact been
  // filed stayed "saved on device" forever. A plain upload of an object that is
  // already there answers a duplicate, and that is success — the bytes are in.
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, await readFileBytes(submission.media.uri), {
      contentType: submission.media.contentType,
      upsert: false,
    })

  if (uploadError && !isAlreadyUploaded(uploadError)) {
    throw new AppError('INTERNAL', { stage: 'upload' })
  }

  // (2) The metadata goes to the Edge Function.
  const response = await fetch(`${supabaseUrl()}/functions/v1/finalize-capture`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_request_id: submission.clientRequestId,
      storage_path: storagePath,
      media_type: submission.media.mediaType,
      byte_size: submission.media.byteSize,
      duration_seconds: submission.media.durationSeconds,
      width: submission.media.width,
      height: submission.media.height,
      lat: submission.lat,
      lng: submission.lng,
      captured_at: submission.capturedAt,
      description: submission.description,
      public_visibility: submission.publicVisibility,
      category: submission.category,
      area_id: submission.areaId ?? null,
      place_detail: submission.placeDetail ?? null,
    }),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw parseErrorBody(body)
  }

  const data = (body as { data?: CaptureResponseBody } | null)?.data

  if (!data?.report_id) {
    throw new AppError('INTERNAL')
  }

  return {
    reportId: data.report_id,
    areaHierarchy: data.area_hierarchy ?? null,
    moderationStatus: data.moderation_status ?? 'visible',
  }
}

/**
 * Reads the sanitised file into an upload body.
 *
 * The bytes are read on the device and handed to the Supabase client as an
 * `ArrayBuffer`, so the upload never goes through a `file://` URL that the
 * native HTTP stack cannot read.
 *
 * The `File` import is **static**. It used to be a dynamic `await import()`,
 * which the CommonJS test transform cannot execute — so this module could not
 * be unit-tested at all, and the response-contract defect below went
 * unnoticed. Every other module that touches `expo-file-system` imports it
 * statically for the same reason.
 */
/**
 * The author token — the hex SHA-256 of the user id — computed on the phone.
 *
 * The shared `authorToken()` uses Web Crypto's `crypto.subtle`, which Hermes
 * does not have. On a phone it threw a `TypeError`, the submit read that as a
 * lost connection, and every capture went to the offline queue ("saved on
 * device") — and failed the same way on every retry.
 *
 * The digest comes from the local pure-TypeScript SHA-256 (`./sha256`).
 * `expo-crypto` had to go: its Android native module stopped being registered
 * by the Modules API 2.0 migration in 58.0.5, which crashes **every** Expo Go
 * app that imports it at startup (expo/expo#51198) — and a JS-version pin
 * cannot help, because the native side ships inside the Expo Go binary. The
 * output is the same standard lowercase hex digest, so the path still matches
 * the one the Edge Function checks.
 */
export async function authorTokenOnDevice(userId: string): Promise<string> {
  return sha256Hex(userId)
}

async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri)
  return file.arrayBuffer()
}

/** The Supabase project URL. Public by design — RLS is the boundary. */
export function supabaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_URL
  if (!value) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set')
  return value
}

/** The Supabase anon key. Public by design — RLS is the boundary. */
export function supabaseAnonKey(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!value) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set')
  return value
}

export { newClientRequestId }

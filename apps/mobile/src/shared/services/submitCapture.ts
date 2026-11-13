import { AppError, authorToken, type PublicVisibility } from '@nagar-shield/shared';
import { supabase } from '@/shared/api/supabase';
import { parseErrorBody } from '@/shared/api/errors';
import { buildStoragePath, newClientRequestId, type PreparedMedia } from './mediaPipeline';

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
  clientRequestId: string;
  media: PreparedMedia;
  lat: number;
  lng: number;
  capturedAt: string;
  description: string | null;
  publicVisibility: PublicVisibility;
  category: null;
}

export interface CaptureResult {
  reportId: string;
  areaHierarchy: {
    division: string | null;
    city: string | null;
    thana: string | null;
    neighborhood: string | null;
  } | null;
  moderationStatus: string;
}

/** The private bucket the report media lives in. */
const MEDIA_BUCKET = 'report-media';

/**
 * Uploads the sanitised media and finalizes the report.
 *
 * The storage path is built from the caller's own id, so the Storage policy
 * accepts the insert and the Edge Function's ownership check passes.
 */
export async function submitCapture(submission: CaptureSubmission): Promise<CaptureResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session) {
    throw new AppError('AUTH_REQUIRED');
  }

  const authorId = session.user.id;

  const fileName = `${submission.clientRequestId}.${submission.media.extension}`;
  const storagePath = buildStoragePath({
    authorId,
    clientRequestId: submission.clientRequestId,
    fileName,
    authorToken: await authorToken(authorId),
  });

  // (1) The bytes go straight to the bucket.
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, await readFileBytes(submission.media.uri), {
      contentType: submission.media.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new AppError('INTERNAL', { stage: 'upload' });
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
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw parseErrorBody(body);
  }

  const data = (body as { data?: CaptureResult } | null)?.data;

  if (!data?.reportId) {
    throw new AppError('INTERNAL');
  }

  return data;
}

/**
 * Reads the sanitised file into an upload body.
 *
 * The bytes are read on the device and handed to the Supabase client as an
 * `ArrayBuffer`, so the upload never goes through a `file://` URL that the
 * native HTTP stack cannot read.
 */
async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  return file.arrayBuffer();
}

/** The Supabase project URL. Public by design — RLS is the boundary. */
export function supabaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set');
  return value;
}

/** The Supabase anon key. Public by design — RLS is the boundary. */
export function supabaseAnonKey(): string {
  const value = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set');
  return value;
}

export { newClientRequestId };

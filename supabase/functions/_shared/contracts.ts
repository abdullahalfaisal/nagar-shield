/**
 * The capture payload contract.
 *
 * The Edge Function and the mobile client validate the **same** shape, so the
 * contract lives in `packages/shared` and is imported here rather than
 * re-declared. A drift between the client and the server is therefore not
 * possible.
 */

import { z } from 'zod';
import {
  CAPTURE_DESCRIPTION_MAX_LENGTH,
  CAPTURE_MAX_PER_DAY,
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_VIDEO_SECONDS,
  reportCategorySchema,
} from '@shared/schemas/index.ts';

/**
 * The password-reset request bodies.
 *
 * They live in `packages/shared` so the client and the server validate the
 * same shape — the same reasoning as the capture contract above.
 */
export {
  passwordResetRequestBodySchema,
  passwordResetVerifyBodySchema,
  type PasswordResetRequestBody,
  type PasswordResetVerifyBody,
} from '@shared/schemas/index.ts';

/** The accepted media kinds. */
export const mediaTypeSchema = z.enum(['photo', 'video', 'file']);

/** The public-visibility toggle. */
export const publicVisibilitySchema = z.enum(['anonymous', 'identified']);

/**
 * The `finalize_capture` request body.
 *
 * The field names are the snake_case wire names — the client maps its
 * camelCase model onto this shape at the boundary.
 */
export const finalizeCaptureSchema = z.object({
  client_request_id: z.string().uuid(),
  storage_path: z.string().min(1).max(512),
  media_type: mediaTypeSchema,
  byte_size: z.number().int().min(0),
  duration_seconds: z.number().min(0).nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  captured_at: z.string().datetime(),
  description: z.string().max(CAPTURE_DESCRIPTION_MAX_LENGTH).nullable().default(null),
  public_visibility: publicVisibilitySchema.default('anonymous'),
  category: reportCategorySchema.nullable().default(null),
});

export type FinalizeCaptureInput = z.infer<typeof finalizeCaptureSchema>;

/** The `flag_report` request body. */
export const flagReportSchema = z.object({
  report_id: z.string().uuid(),
  reason: z.enum(['misinformation', 'harassment', 'duplicate', 'off_topic', 'other']),
});

export type FlagReportInput = z.infer<typeof flagReportSchema>;

/** The `moderation_decide` request body. */
export const moderationDecideSchema = z.object({
  report_id: z.string().uuid(),
  decision: z.enum(['restore', 'remove']),
  note: z.string().trim().min(1).max(2000),
});

export type ModerationDecideInput = z.infer<typeof moderationDecideSchema>;

/** The `disable_user` request body. */
export const disableUserSchema = z.object({
  user_id: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
});

export type DisableUserInput = z.infer<typeof disableUserSchema>;

export interface MediaCapResult {
  ok: boolean;
  code?: 'MEDIA_TOO_LARGE' | 'UNSUPPORTED_MEDIA';
}

/**
 * Re-validates the media caps on the server.
 *
 * The client check is UX; this is the contract. The DB `CHECK` constraints are
 * the third line.
 */
export function checkMediaCaps(input: {
  mediaType: 'photo' | 'video' | 'file';
  byteSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}): MediaCapResult {
  if (input.byteSize > MEDIA_MAX_FILE_BYTES) {
    return { ok: false, code: 'MEDIA_TOO_LARGE' };
  }

  if (input.mediaType === 'video' && input.durationSeconds !== null) {
    if (input.durationSeconds > MEDIA_MAX_VIDEO_SECONDS) {
      return { ok: false, code: 'MEDIA_TOO_LARGE' };
    }
  }

  if (input.width !== null && input.width > MEDIA_MAX_DIMENSION) {
    return { ok: false, code: 'MEDIA_TOO_LARGE' };
  }
  if (input.height !== null && input.height > MEDIA_MAX_DIMENSION) {
    return { ok: false, code: 'MEDIA_TOO_LARGE' };
  }

  return { ok: true };
}

/** The per-user daily capture cap — the server-side enforcement point. */
export const DAILY_CAPTURE_CAP = CAPTURE_MAX_PER_DAY;

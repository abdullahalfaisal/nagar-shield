import { useCallback, useState } from 'react';
import { AppError, type PublicVisibility } from '@nagar-shield/shared';
import { newClientRequestId, type PreparedMedia } from './mediaPipeline';
import { prepareFile, preparePhoto, prepareVideo, type PickedAsset } from './prepareMedia';
import { enqueueUpload } from './uploadQueue';
import { submitCapture, type CaptureResult } from './submitCapture';

/**
 * The capture orchestration.
 *
 * The order is fixed and it never traps the user:
 *
 *   1. pick the asset (camera / gallery / file)
 *   2. sanitise it on the device (EXIF strip, resize, cap checks)
 *   3. upload the bytes and finalize the report
 *   4. on a **transport** failure, hand the payload to the offline queue and
 *      report `queued` — the user continues immediately
 *
 * A **server rejection** (a rate limit, an invalid payload) is not queued: it
 * would fail again on the retry, so the error is surfaced instead.
 */

export type CaptureOutcome =
  | { status: 'sent'; result: CaptureResult }
  | { status: 'queued' }
  | { status: 'cancelled' };

export interface CaptureDraft {
  description: string | null;
  publicVisibility: PublicVisibility;
  lat: number;
  lng: number;
  capturedAt: string;
}

/** The media kinds the Capture screen offers. */
export type MediaKind = 'photo' | 'video' | 'file';

/** Prepares a picked asset for upload. */
export async function preparePickedMedia(
  kind: MediaKind,
  asset: PickedAsset,
): Promise<PreparedMedia> {
  switch (kind) {
    case 'photo':
      return preparePhoto(asset);
    case 'video':
      return prepareVideo(asset);
    case 'file':
      return prepareFile(asset);
  }
}

/**
 * The submit path.
 *
 * The caller supplies the already-sanitised media and the draft. The function
 * owns the idempotency key — a retry of the same draft reuses it, so a lost
 * response never becomes a duplicate report.
 */
export async function submitDraft(input: {
  media: PreparedMedia;
  draft: CaptureDraft;
  clientRequestId?: string;
}): Promise<CaptureOutcome> {
  const clientRequestId = input.clientRequestId ?? newClientRequestId();

  try {
    const result = await submitCapture({
      clientRequestId,
      media: input.media,
      lat: input.draft.lat,
      lng: input.draft.lng,
      capturedAt: input.draft.capturedAt,
      description: input.draft.description,
      publicVisibility: input.draft.publicVisibility,
      category: null,
    });

    return { status: 'sent', result };
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    // The upload failed on the network. The payload goes to the device queue
    // and the user is released immediately.
    await enqueueUpload({
      media: input.media,
      lat: input.draft.lat,
      lng: input.draft.lng,
      capturedAt: input.draft.capturedAt,
      description: input.draft.description,
      publicVisibility: input.draft.publicVisibility,
    });

    return { status: 'queued' };
  }
}

/**
 * Whether a failure is a **transport** problem.
 *
 * A server rejection (a rate limit, a validation failure) would fail again on
 * the retry, so it is never queued.
 */
export function isTransportFailure(error: unknown): boolean {
  if (!(error instanceof AppError)) return true;
  return error.code === 'INTERNAL';
}

export interface UseCaptureSubmitResult {
  /** `true` while a submit is in flight. */
  isSubmitting: boolean;
  /** The last failure, mapped to a stable code. */
  error: AppError | null;
  /** Submits a draft. */
  submit: (input: { media: PreparedMedia; draft: CaptureDraft }) => Promise<CaptureOutcome>;
  /** Clears the last error. */
  clearError: () => void;
}

/** The Capture screen's submit state. */
export function useCaptureSubmit(): UseCaptureSubmitResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const submit = useCallback(
    async (input: { media: PreparedMedia; draft: CaptureDraft }) => {
      setIsSubmitting(true);
      setError(null);

      try {
        return await submitDraft(input);
      } catch (caught) {
        setError(caught instanceof AppError ? caught : new AppError('INTERNAL'));
        return { status: 'cancelled' } as CaptureOutcome;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isSubmitting, error, submit, clearError };
}

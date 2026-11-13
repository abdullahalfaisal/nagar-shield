import { useCallback, useState } from 'react';
import {
  AppError,
  CAPTURE_DESCRIPTION_MAX_LENGTH,
  type PublicVisibility,
} from '@nagar-shield/shared';
import { newClientRequestId, type PreparedMedia } from './mediaPipeline';
import { prepareFile, preparePhoto, prepareVideo, type PickedAsset } from './prepareMedia';
import { enqueueUploadBounded } from './uploadQueue';
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
  | { status: 'queued'; droppedOldest: boolean }
  | { status: 'cancelled' };

export interface CaptureDraft {
  description: string | null;
  publicVisibility: PublicVisibility;
  lat: number;
  lng: number;
  capturedAt: string;
  /**
   * The area the citizen typed by hand, when the location permission was
   * denied. It is a **hint**, not the report's location: the server resolves
   * `area_hierarchy` from the coordinates, and that resolution stays
   * authoritative.
   */
  areaHint?: string | null;
}

/**
 * The prefix the manual area is carried under.
 *
 * The area hint rides in the report's description — the server has no
 * separate field for it, and the story's rule is that the **server-resolved**
 * hierarchy stays authoritative. Putting the citizen's words in the
 * description keeps them visible to the moderation console and to whoever
 * reads the report, while the resolved hierarchy is untouched.
 */
const AREA_HINT_PREFIX = 'Area: ';

/**
 * Folds a manually-entered area into the description.
 *
 * The rules:
 *
 *   1. the hint is carried whenever it can be — it is the one thing the
 *      citizen cannot supply any other way, and the report's media already
 *      speaks for itself;
 *   2. the description gives way to make room, and it is cut on a **word
 *      boundary** so the report never ends in a half-written word;
 *   3. the hint is dropped entirely if it is blank, or if it is so long that
 *      it could not fit beside any description at all.
 *
 * The result is `null` when there is nothing to say, so an untouched
 * description stays `null` on the wire rather than becoming an empty string.
 */
export function composeDescription(
  description: string | null,
  areaHint: string | null | undefined,
): string | null {
  const trimmed = (description ?? '').trim();
  const hint = (areaHint ?? '').trim();

  if (hint.length === 0) {
    return trimmed.length > 0 ? trimmed : null;
  }

  const suffix = `${AREA_HINT_PREFIX}${hint}`;

  if (trimmed.length === 0) {
    return suffix.length <= CAPTURE_DESCRIPTION_MAX_LENGTH ? suffix : null;
  }

  const room = CAPTURE_DESCRIPTION_MAX_LENGTH - suffix.length - 1; // the space

  // The hint alone does not fit. There is no room for the description either.
  if (room <= 0) return null;

  // The description fits as it is — keep every word of it.
  if (trimmed.length <= room) {
    return `${trimmed} ${suffix}`;
  }

  // The description has to give way. It is cut on a **word boundary** so the
  // report does not end in a half-written word — and the cut is only taken
  // when there is a space to cut at, otherwise the partial word is kept
  // rather than losing the whole description.
  const head = trimmed.slice(0, room);
  const cut = head.lastIndexOf(' ');
  const body = cut > 0 ? head.slice(0, cut) : head;

  return `${body} ${suffix}`;
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

  // The manual area hint is folded into the description here — once — so the
  // online path and the queued path carry exactly the same text.
  const description = composeDescription(input.draft.description, input.draft.areaHint);

  try {
    const result = await submitCapture({
      clientRequestId,
      media: input.media,
      lat: input.draft.lat,
      lng: input.draft.lng,
      capturedAt: input.draft.capturedAt,
      description,
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
    //
    // The **same** `clientRequestId` goes with it. That key is the
    // idempotency guarantee: the retry sends it again, so `finalize_capture`
    // returns the original `report_id` rather than creating a second report.
    // A fresh key here would let a submit whose response was lost in transit
    // land twice.
    const { dropped } = await enqueueUploadBounded({
      clientRequestId,
      media: input.media,
      lat: input.draft.lat,
      lng: input.draft.lng,
      capturedAt: input.draft.capturedAt,
      description,
      publicVisibility: input.draft.publicVisibility,
    });

    return { status: 'queued', droppedOldest: dropped !== null };
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

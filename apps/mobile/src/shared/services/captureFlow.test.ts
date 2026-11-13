import { AppError, CAPTURE_DESCRIPTION_MAX_LENGTH } from '@nagar-shield/shared';
import {
  composeDescription,
  isTransportFailure,
  preparePickedMedia,
  submitDraft,
} from './captureFlow';

/**
 * The capture flow's contract.
 *
 * The one thing that must never go wrong here is the **idempotency key**.
 *
 * `submitDraft` generates one `client_request_id` for an attempt. If the
 * upload fails on the network, the payload goes to the offline queue — and
 * it must go with **the same key**. A fresh key would let a submit whose
 * response was lost in transit land twice: two reports, two copies of the
 * evidence, and the citizen's "did it send?" answered ambiguously.
 *
 * The other rule is that a **server rejection** is not queued. A rate limit
 * or a validation failure would fail identically on the retry, so the error
 * is surfaced instead of being buried in a queue that retries forever.
 */

jest.mock('./submitCapture', () => ({
  submitCapture: jest.fn(),
}));

jest.mock('./uploadQueue', () => {
  const actual = jest.requireActual('./uploadQueue');
  return {
    ...actual,
    enqueueUpload: jest.fn(),
    enqueueUploadBounded: jest.fn(),
  };
});

jest.mock('./prepareMedia', () => ({
  preparePhoto: jest.fn(),
  prepareVideo: jest.fn(),
  prepareFile: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    exists = false;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {}
  },
  Directory: class {
    uri: string;
    exists = false;
    constructor(uri: string) {
      this.uri = uri;
    }
    create() {}
  },
  Paths: { cache: '/cache' },
}));

import { submitCapture } from './submitCapture';
import { enqueueUploadBounded } from './uploadQueue';
import { prepareFile, preparePhoto, prepareVideo } from './prepareMedia';

const mockedSubmit = submitCapture as jest.MockedFunction<typeof submitCapture>;
const mockedEnqueue = enqueueUploadBounded as jest.MockedFunction<typeof enqueueUploadBounded>;
const mockedPhoto = preparePhoto as jest.MockedFunction<typeof preparePhoto>;
const mockedVideo = prepareVideo as jest.MockedFunction<typeof prepareVideo>;
const mockedFile = prepareFile as jest.MockedFunction<typeof prepareFile>;

/** The prepared media the flow submits. */
const media = {
  uri: '/cache/draft.jpg',
  mediaType: 'photo' as const,
  byteSize: 1024,
  durationSeconds: null,
  width: 800,
  height: 600,
  contentType: 'image/jpeg',
  extension: 'jpg',
};

/** The draft the flow submits. */
const draft = {
  description: 'a report',
  publicVisibility: 'anonymous' as const,
  lat: 23.7461,
  lng: 90.3774,
  capturedAt: '2026-11-13T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();

  mockedSubmit.mockResolvedValue({
    reportId: 'report-1',
    areaHierarchy: null,
    moderationStatus: 'visible',
  });

  mockedEnqueue.mockResolvedValue({
    item: {
      clientRequestId: 'queued-key',
      mediaUri: '/cache/draft.jpg',
      mediaType: 'photo',
      byteSize: 1024,
      durationSeconds: null,
      width: 800,
      height: 600,
      contentType: 'image/jpeg',
      extension: 'jpg',
      lat: 23.7461,
      lng: 90.3774,
      capturedAt: '2026-11-13T10:00:00.000Z',
      description: 'a report',
      publicVisibility: 'anonymous',
      attempts: 0,
      nextAttemptAt: 0,
      savedOnDevice: false,
    },
    dropped: null,
  });
});

// --- The transport-failure split ----------------------------------------------

describe('isTransportFailure', () => {
  it('treats an internal error as a transport failure — that is the network', () => {
    expect(isTransportFailure(new AppError('INTERNAL'))).toBe(true);
  });

  it('treats a rate limit as a server rejection, not a transport failure', () => {
    expect(isTransportFailure(new AppError('CAPTURE_RATE_LIMIT'))).toBe(false);
  });

  it('treats a validation failure as a server rejection', () => {
    expect(isTransportFailure(new AppError('VALIDATION_FAILED'))).toBe(false);
  });

  it('treats an unknown throw as a transport failure', () => {
    expect(isTransportFailure(new Error('socket hang up'))).toBe(true);
  });
});

// --- The submit path ----------------------------------------------------------

describe('submitDraft', () => {
  it('reports the result when the report lands', async () => {
    const outcome = await submitDraft({ media, draft });

    expect(outcome).toEqual({
      status: 'sent',
      result: {
        reportId: 'report-1',
        areaHierarchy: null,
        moderationStatus: 'visible',
      },
    });
  });

  it('does not queue a report that landed', async () => {
    await submitDraft({ media, draft });

    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it('queues the report when the upload fails on the network', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'));

    const outcome = await submitDraft({ media, draft });

    expect(outcome).toEqual({ status: 'queued', droppedOldest: false });
  });

  it('reuses the SAME client_request_id for the queued retry', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'));

    await submitDraft({ media, draft, clientRequestId: 'the-one-key' });

    // The submit used the key...
    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: 'the-one-key' }),
    );
    // ...and the queued item carries the same one, so the retry is
    // idempotent rather than a second report.
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: 'the-one-key' }),
    );
  });

  it('generates one key and uses it for both the attempt and the queue', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'));

    await submitDraft({ media, draft });

    const submitted = mockedSubmit.mock.calls[0]?.[0];
    const enqueued = mockedEnqueue.mock.calls[0]?.[0];

    expect(submitted?.clientRequestId).toBeDefined();
    expect(enqueued?.clientRequestId).toBe(submitted?.clientRequestId);
  });

  it('reports the overflow when the queue evicts its oldest item', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'));
    mockedEnqueue.mockResolvedValue({
      item: {
        clientRequestId: 'queued-key',
        mediaUri: '/cache/draft.jpg',
        mediaType: 'photo',
        byteSize: 1024,
        durationSeconds: null,
        width: 800,
        height: 600,
        contentType: 'image/jpeg',
        extension: 'jpg',
        lat: 23.7461,
        lng: 90.3774,
        capturedAt: '2026-11-13T10:00:00.000Z',
        description: 'a report',
        publicVisibility: 'anonymous',
        attempts: 0,
        nextAttemptAt: 0,
        savedOnDevice: false,
      },
      dropped: {
        clientRequestId: 'the-oldest-one',
        mediaUri: '/cache/old.jpg',
        mediaType: 'photo',
        byteSize: 1024,
        durationSeconds: null,
        width: 800,
        height: 600,
        contentType: 'image/jpeg',
        extension: 'jpg',
        lat: 23.7461,
        lng: 90.3774,
        capturedAt: '2026-11-13T09:00:00.000Z',
        description: 'an older report',
        publicVisibility: 'anonymous',
        attempts: 0,
        nextAttemptAt: 0,
        savedOnDevice: false,
      },
    });

    const outcome = await submitDraft({ media, draft });

    expect(outcome).toEqual({ status: 'queued', droppedOldest: true });
  });

  it('does NOT queue a server rejection — it would fail again on the retry', async () => {
    mockedSubmit.mockRejectedValue(new AppError('CAPTURE_RATE_LIMIT'));

    await expect(submitDraft({ media, draft })).rejects.toThrow(AppError);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it('does not queue a validation failure', async () => {
    mockedSubmit.mockRejectedValue(new AppError('VALIDATION_FAILED'));

    await expect(submitDraft({ media, draft })).rejects.toThrow(AppError);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it('carries the draft payload into the queue', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'));

    await submitDraft({ media, draft });

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        media,
        lat: draft.lat,
        lng: draft.lng,
        capturedAt: draft.capturedAt,
        description: draft.description,
        publicVisibility: draft.publicVisibility,
      }),
    );
  });
});

// --- The media preparation ----------------------------------------------------

describe('preparePickedMedia', () => {
  /** A picked asset — the shape the pickers return. */
  const asset = {
    uri: 'file:///tmp/picked.jpg',
    mimeType: 'image/jpeg',
    fileName: 'picked.jpg',
    fileSize: 2048,
    width: 1024,
    height: 768,
    duration: null,
  };

  it('prepares a photo', async () => {
    mockedPhoto.mockResolvedValue(media);

    await expect(preparePickedMedia('photo', asset)).resolves.toBe(media);
    expect(mockedPhoto).toHaveBeenCalled();
  });

  it('prepares a video', async () => {
    mockedVideo.mockResolvedValue(media);

    await expect(preparePickedMedia('video', asset)).resolves.toBe(media);
    expect(mockedVideo).toHaveBeenCalled();
  });

  it('prepares a file', async () => {
    mockedFile.mockResolvedValue(media);

    await expect(preparePickedMedia('file', asset)).resolves.toBe(media);
    expect(mockedFile).toHaveBeenCalled();
  });
});

// --- The manual area hint -----------------------------------------------------

/**
 * The manual area is a **hint**, not the report's location.
 *
 * The server has no separate field for it, and the story's rule is that the
 * server-resolved `area_hierarchy` stays authoritative. So the hint rides in
 * the description, under an `Area: ` prefix that marks it as the citizen's
 * own words rather than a resolved address.
 *
 * Two rules protect the description:
 *
 *   1. the citizen's own words come **first** — the hint is dropped rather
 *      than the description being discarded, because the description is the
 *      report's substance;
 *   2. nothing is ever silently truncated mid-word.
 */
describe('composeDescription', () => {
  it('returns the description unchanged when there is no area hint', () => {
    expect(composeDescription('a report', null)).toBe('a report');
  });

  it('returns null when there is nothing to say', () => {
    expect(composeDescription(null, null)).toBeNull();
    expect(composeDescription('', '')).toBeNull();
    expect(composeDescription('   ', '  ')).toBeNull();
  });

  it('appends the area hint under a prefix', () => {
    expect(composeDescription('a report', 'Mirpur')).toBe('a report Area: Mirpur');
  });

  it('carries the hint on its own when there is no description', () => {
    expect(composeDescription(null, 'Mirpur')).toBe('Area: Mirpur');
  });

  it('trims the description and the hint', () => {
    expect(composeDescription('  a report  ', '  Mirpur  ')).toBe('a report Area: Mirpur');
  });

  it('never exceeds the 140-character cap', () => {
    const long = 'x'.repeat(CAPTURE_DESCRIPTION_MAX_LENGTH);
    const composed = composeDescription(long, 'Mirpur');

    expect(composed).not.toBeNull();
    expect(composed!.length).toBeLessThanOrEqual(CAPTURE_DESCRIPTION_MAX_LENGTH);
  });

  it('gives way to make room for the hint when the description is too long', () => {
    const long = 'x'.repeat(CAPTURE_DESCRIPTION_MAX_LENGTH);
    const composed = composeDescription(long, 'Mirpur');

    // The hint is the thing the citizen cannot supply any other way, so it
    // is carried and the description is cut to make room for it.
    expect(composed).toBe(`${'x'.repeat(CAPTURE_DESCRIPTION_MAX_LENGTH - 'Area: Mirpur'.length - 1)} Area: Mirpur`);
  });

  it('keeps every word of a description that fits', () => {
    const composed = composeDescription('the quick brown fox jumps', 'Mirpur');

    expect(composed).toBe('the quick brown fox jumps Area: Mirpur');
  });

  it('truncates on a word boundary to make room for the hint', () => {
    // Long enough that the hint cannot fit beside it.
    const words = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet'.repeat(4).split(' ');
    const composed = composeDescription(words.join(' '), 'Mirpur');

    expect(composed!.length).toBeLessThanOrEqual(CAPTURE_DESCRIPTION_MAX_LENGTH);
    expect(composed).toContain('Area: Mirpur');
    // The cut lands on a word boundary — the description does not end in a
    // fragment.
    const body = composed!.replace(' Area: Mirpur', '');
    expect(body.split(' ').every((word) => words.includes(word))).toBe(true);
  });

  it('returns null when the hint alone does not fit', () => {
    const hugeHint = 'y'.repeat(CAPTURE_DESCRIPTION_MAX_LENGTH);

    expect(composeDescription(null, hugeHint)).toBeNull();
  });
});

// --- The area hint on the wire ------------------------------------------------

describe('submitDraft with an area hint', () => {
  it('carries the composed description into the submit', async () => {
    await submitDraft({ media, draft: { ...draft, areaHint: 'Mirpur' } });

    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'a report Area: Mirpur' }),
    );
  });

  // The online path and the queued path must carry exactly the same text.
  it('carries the same composed description into the queue', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'));

    await submitDraft({ media, draft: { ...draft, areaHint: 'Mirpur' } });

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'a report Area: Mirpur' }),
    );
  });

  it('sends no description when there is no hint and no description', async () => {
    await submitDraft({
      media,
      draft: { ...draft, description: null, areaHint: null },
    });

    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });
});

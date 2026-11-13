import { AppError } from '@nagar-shield/shared';
import { isTransportFailure, preparePickedMedia, submitDraft } from './captureFlow';

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

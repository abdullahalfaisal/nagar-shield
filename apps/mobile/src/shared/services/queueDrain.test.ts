import { AppError } from '@nagar-shield/shared'
import { drainItem, drainQueue, isRetryable } from './queueDrain'
import type { QueuedUpload } from './uploadQueue'

/**
 * The drain's contract.
 *
 * The drain is where a queued report either lands or is written off, so the
 * decisions it makes are the ones the story pins down:
 *
 *   * a **transport failure** is retried — that is the whole point of the
 *     queue;
 *   * a **rate limit** is retried — it is a server-side throttle, not a bad
 *     payload, so the item would fail the same way forever if it were
 *     dropped;
 *   * a **validation or media rejection** is *not* retried — the payload is
 *     invalid, and every attempt would fail identically;
 *   * the **attempt count moves before the attempt**, so an attempt the OS
 *     interrupted cannot be retried forever as a free attempt;
 *   * a successful drain **removes the item and deletes its draft**.
 */

jest.mock('./submitCapture', () => ({
  submitCapture: jest.fn(),
}))

jest.mock('./uploadQueue', () => {
  const actual = jest.requireActual('./uploadQueue')
  return {
    ...actual,
    readQueue: jest.fn().mockResolvedValue([]),
    removeFromQueue: jest.fn(),
    deleteDraftMedia: jest.fn(),
  }
})

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string
    exists = false
    constructor(uri: string) {
      this.uri = uri
    }
    delete() {}
  },
  Directory: class {
    uri: string
    exists = false
    constructor(uri: string) {
      this.uri = uri
    }
    create() {}
  },
  Paths: { cache: '/cache' },
}))

import { submitCapture } from './submitCapture'
import { deleteDraftMedia, readQueue, removeFromQueue } from './uploadQueue'

const mockedSubmit = submitCapture as jest.MockedFunction<typeof submitCapture>
const mockedRemove = removeFromQueue as jest.MockedFunction<typeof removeFromQueue>
const mockedDelete = deleteDraftMedia as jest.MockedFunction<typeof deleteDraftMedia>
const mockedRead = readQueue as jest.MockedFunction<typeof readQueue>

/** A queue item, for the drain tests. */
function item(overrides: Partial<QueuedUpload> = {}): QueuedUpload {
  return {
    clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  // `clearAllMocks` resets the calls but keeps the implementations, so the
  // queue's default state is set explicitly here.
  mockedRead.mockResolvedValue([])
  mockedSubmit.mockResolvedValue({
    reportId: 'report-1',
    areaHierarchy: null,
    moderationStatus: 'visible',
  })
  mockedRemove.mockResolvedValue(undefined)
  mockedDelete.mockResolvedValue(undefined)
})

// --- The retry classification -------------------------------------------------

describe('isRetryable', () => {
  it('retries a transport failure', () => {
    expect(isRetryable(new AppError('INTERNAL'))).toBe(true)
  })

  it('retries a rate limit — it is a throttle, not a bad payload', () => {
    expect(isRetryable(new AppError('CAPTURE_RATE_LIMIT'))).toBe(true)
  })

  it('retries a session problem, which resolves on the next foreground', () => {
    expect(isRetryable(new AppError('AUTH_REQUIRED'))).toBe(true)
  })

  it('does not retry a validation failure — the payload is invalid', () => {
    expect(isRetryable(new AppError('VALIDATION_FAILED'))).toBe(false)
  })

  it('does not retry a media rejection — every attempt would fail the same way', () => {
    expect(isRetryable(new AppError('MEDIA_TOO_LARGE'))).toBe(false)
    expect(isRetryable(new AppError('UNSUPPORTED_MEDIA'))).toBe(false)
  })

  it('does not retry a forbidden write', () => {
    expect(isRetryable(new AppError('FORBIDDEN'))).toBe(false)
  })

  it('treats an unknown throw as retryable — it is most likely the network', () => {
    expect(isRetryable(new Error('network down'))).toBe(true)
  })
})

// --- The single-item drain ----------------------------------------------------

describe('drainItem', () => {
  it('reports the report id when the item lands', async () => {
    const outcome = await drainItem(item())

    expect(outcome).toEqual({ status: 'sent', reportId: 'report-1' })
  })

  it('removes the item from the queue when it lands', async () => {
    await drainItem(item())

    expect(mockedRemove).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('deletes the draft media when the item lands', async () => {
    await drainItem(item())

    expect(mockedDelete).toHaveBeenCalledWith('/cache/draft.jpg')
  })

  it("reuses the queued item's client_request_id — the retry must be idempotent", async () => {
    await drainItem(item({ clientRequestId: 'fixed-key-1234' }))

    expect(mockedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ clientRequestId: 'fixed-key-1234' }),
    )
  })

  it('keeps the item in the queue after a transport failure', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'))

    const outcome = await drainItem(item())

    expect(outcome.status).toBe('retry')
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('drops a rejected item — retrying an invalid payload cannot succeed', async () => {
    mockedSubmit.mockRejectedValue(new AppError('MEDIA_TOO_LARGE'))

    const outcome = await drainItem(item())

    expect(outcome).toEqual({ status: 'rejected', code: 'MEDIA_TOO_LARGE' })
    expect(mockedRemove).toHaveBeenCalled()
    expect(mockedDelete).toHaveBeenCalled()
  })

  it('keeps a rate-limited item — it is retried later', async () => {
    mockedSubmit.mockRejectedValue(new AppError('CAPTURE_RATE_LIMIT'))

    const outcome = await drainItem(item())

    expect(outcome.status).toBe('retry')
    expect(mockedRemove).not.toHaveBeenCalled()
  })

  it('counts the attempt once, not twice', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'))

    // The item starts with one attempt already recorded; the drain adds one.
    const outcome = await drainItem(item({ attempts: 1 }))

    expect(outcome).toMatchObject({ status: 'retry', attempts: 2 })
  })

  it('marks the item as kept on the device once the budget is spent', async () => {
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'))

    const outcome = await drainItem(item({ attempts: 2 }))

    expect(outcome).toMatchObject({ status: 'retry', attempts: 3, savedOnDevice: true })
  })
})

// --- The whole drain ----------------------------------------------------------

describe('drainQueue', () => {
  it('reports nothing when the queue is empty', async () => {
    const result = await drainQueue()

    expect(result).toEqual({ sent: 0, retried: 0, rejected: 0, savedOnDevice: 0 })
    expect(mockedSubmit).not.toHaveBeenCalled()
  })

  it('does not submit an item that is not due yet', async () => {
    mockedRead.mockResolvedValue([item({ nextAttemptAt: Date.now() + 60_000 })])

    const result = await drainQueue()

    expect(mockedSubmit).not.toHaveBeenCalled()
    expect(result.sent).toBe(0)
  })

  it('counts a landed item as sent', async () => {
    mockedRead.mockResolvedValue([item()])

    const result = await drainQueue()

    expect(result.sent).toBe(1)
  })

  it('counts a rejected item separately from a retry', async () => {
    mockedRead.mockResolvedValue([item()])
    mockedSubmit.mockRejectedValue(new AppError('VALIDATION_FAILED'))

    const result = await drainQueue()

    expect(result.rejected).toBe(1)
    expect(result.retried).toBe(0)
  })

  it('counts a retained item in the saved-on-device tally', async () => {
    mockedRead.mockResolvedValue([item({ attempts: 2 })])
    mockedSubmit.mockRejectedValue(new AppError('INTERNAL'))

    const result = await drainQueue()

    expect(result.retried).toBe(1)
    expect(result.savedOnDevice).toBe(1)
  })

  it('drains the items one at a time — a burst of uploads is what the backoff exists to prevent', async () => {
    mockedRead.mockResolvedValue([
      item(),
      item({ clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
    ])

    let inFlight = 0
    let maxInFlight = 0
    mockedSubmit.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return { reportId: 'r', areaHierarchy: null, moderationStatus: 'visible' }
    })

    await drainQueue()

    expect(maxInFlight).toBe(1)
  })
})

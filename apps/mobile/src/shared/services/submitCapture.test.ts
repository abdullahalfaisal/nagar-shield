import { AppError } from '@nagar-shield/shared'
import { authorTokenOnDevice, submitCapture, type CaptureSubmission } from './submitCapture'

/**
 * The capture submit path's **response contract**.
 *
 * This test exists because of a real defect that shipped in this file.
 *
 * The `finalize-capture` Edge Function answers in snake_case — `report_id`,
 * `area_hierarchy`, `moderation_status` — because that is what the Postgres
 * row and the `finalize_capture` RPC return. The client used to read
 * `data.reportId`, a camelCase key that the function never sends.
 *
 * The consequence was severe and entirely silent:
 *
 *   1. `data.reportId` was always `undefined`;
 *   2. the client threw `AppError('INTERNAL')` on **every successful
 *      capture**;
 *   3. `captureFlow` read that as a *transport* failure and handed the
 *      payload to the offline queue;
 *   4. the queue retried it, and the idempotency key made the retry land
 *      the **same** report — so the user saw "saved on device" for a report
 *      that had actually been filed, and the queue drained a phantom item.
 *
 * The failure mode was a *false negative*: the server was right, the UI was
 * right, and only the seam between them was wrong. Nothing in the app ever
 * disagreed loudly enough to be noticed.
 *
 * So the contract is asserted here, at the seam, rather than trusted.
 */

const mockSession = { access_token: 'test-token', user: { id: 'author-uuid' } }

jest.mock('@/shared/api/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    storage: { from: jest.fn() },
  },
}))

jest.mock('./mediaPipeline', () => ({
  buildStoragePath: jest.fn(() => 'reports/token/client-request/file.png'),
  newClientRequestId: jest.fn(() => 'client-request'),
}))

// The device digest is now a pure-TypeScript SHA-256 (`./sha256`); the tests
// below compare it against Node's own SHA-256 — a real cross-implementation
// verification, no native mock needed.

jest.mock('expo-file-system', () => ({
  File: class {
    async arrayBuffer() {
      return new ArrayBuffer(8)
    }
  },
}))

import { supabase } from '@/shared/api/supabase'

const mockedSupabase = supabase as unknown as {
  auth: { getSession: jest.Mock }
  storage: { from: jest.Mock }
}

function stubSession() {
  mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: mockSession } })
}

function stubUpload(ok = true, error: Record<string, unknown> = { message: 'upload failed' }) {
  const upload = jest.fn().mockResolvedValue(ok ? { error: null } : { error })
  mockedSupabase.storage.from.mockReturnValue({ upload })
  return upload
}

/** Stubs `fetch` with one answer. */
function stubFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch
}

const submission: CaptureSubmission = {
  clientRequestId: 'client-request',
  media: {
    uri: 'file:///tmp/x.png',
    extension: 'png',
    contentType: 'image/png',
    mediaType: 'photo',
    byteSize: 1024,
    width: 1080,
    height: 1080,
    durationSeconds: null,
  },
  lat: 23.8103,
  lng: 90.4125,
  capturedAt: '2026-11-14T00:00:00.000Z',
  description: 'a report',
  publicVisibility: 'anonymous',
  category: null,
}

describe('submitCapture — the response contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    stubSession()
    stubUpload()
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('reads `report_id` — the snake_case key the function actually sends', async () => {
    stubFetch(200, {
      data: {
        report_id: 'a-real-report-id',
        area_hierarchy: { division: 'Dhaka', city: 'Dhaka', thana: null, neighborhood: null },
        moderation_status: 'visible',
      },
    })

    const result = await submitCapture(submission)

    expect(result.reportId).toBe('a-real-report-id')
  })

  it('sends a chosen area and the place detail as `area_id` / `place_detail`', async () => {
    stubFetch(200, {
      data: { report_id: 'a-real-report-id', area_hierarchy: null, moderation_status: 'visible' },
    })

    await submitCapture({ ...submission, areaId: 'area-uuid', placeDetail: 'Road 10' })

    const init = (global.fetch as jest.Mock).mock.calls[0]?.[1] as { body: string }
    expect(JSON.parse(init.body)).toMatchObject({ area_id: 'area-uuid', place_detail: 'Road 10' })
  })

  it('sends null for both when the position was detected', async () => {
    stubFetch(200, {
      data: { report_id: 'a-real-report-id', area_hierarchy: null, moderation_status: 'visible' },
    })

    await submitCapture(submission)

    const init = (global.fetch as jest.Mock).mock.calls[0]?.[1] as { body: string }
    expect(JSON.parse(init.body)).toMatchObject({ area_id: null, place_detail: null })
  })

  it('does not read a camelCase `reportId` — the function never sends one', async () => {
    // A response that carries ONLY the snake_case key must still resolve.
    // Reading `reportId` here would yield undefined and throw.
    stubFetch(200, {
      data: {
        report_id: 'a-real-report-id',
        area_hierarchy: null,
        moderation_status: 'visible',
      },
    })

    await expect(submitCapture(submission)).resolves.toBeDefined()
  })

  it('maps the area hierarchy and the moderation status across', async () => {
    stubFetch(200, {
      data: {
        report_id: 'a-real-report-id',
        area_hierarchy: {
          division: 'Dhaka',
          city: 'Dhaka',
          thana: 'Gulshan',
          neighborhood: null,
        },
        moderation_status: 'visible',
      },
    })

    const result = await submitCapture(submission)

    expect(result.areaHierarchy).toEqual({
      division: 'Dhaka',
      city: 'Dhaka',
      thana: 'Gulshan',
      neighborhood: null,
    })
    expect(result.moderationStatus).toBe('visible')
  })

  it('throws INTERNAL when the response carries no report id at all', async () => {
    stubFetch(200, { data: { area_hierarchy: null, moderation_status: 'visible' } })

    await expect(submitCapture(submission)).rejects.toThrow(AppError)
  })

  it('throws INTERNAL when the response has no data envelope', async () => {
    stubFetch(200, {})

    await expect(submitCapture(submission)).rejects.toThrow(AppError)
  })

  it('does not upload anything when there is no session', async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    await expect(submitCapture(submission)).rejects.toThrow(AppError)

    expect(mockedSupabase.storage.from).not.toHaveBeenCalled()
  })

  it('never asks the bucket to replace an object', async () => {
    // Replacing is an UPDATE and the bucket has no UPDATE policy: a retry that
    // asked for it was refused for good. See tools/probe-capture-submit.cjs.
    const upload = stubUpload()
    stubFetch(200, { data: { report_id: 'r1' } })

    await submitCapture(submission)

    expect(upload).toHaveBeenCalledWith(
      expect.stringContaining('client-request'),
      expect.anything(),
      expect.objectContaining({ upsert: false }),
    )
  })

  it('finalizes when the object is already there — a retry after a lost confirmation', async () => {
    // The first attempt's bytes landed and its answer was lost. The queue
    // retries with the same path; storage says "Duplicate", and that is success.
    stubUpload(false, {
      message: 'The resource already exists',
      statusCode: '409',
      error: 'Duplicate',
    })
    stubFetch(200, { data: { report_id: 'r1' } })

    await expect(submitCapture(submission)).resolves.toMatchObject({ reportId: 'r1' })
  })

  it('still fails on an upload error that is not a duplicate', async () => {
    stubUpload(false, { message: 'new row violates row-level security policy', statusCode: '403' })
    stubFetch(200, { data: { report_id: 'r1' } })

    await expect(submitCapture(submission)).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not call the Edge Function when the upload fails', async () => {
    stubUpload(false)

    await expect(submitCapture(submission)).rejects.toThrow(AppError)

    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('authorTokenOnDevice', () => {
  it('is the same hash as the shared authorToken, without crypto.subtle', async () => {
    // The real shared helper; Node has `crypto.subtle`, the phone does not.
    const { authorToken } = jest.requireActual('@nagar-shield/shared') as {
      authorToken: (userId: string) => Promise<string>
    }
    const userId = '4f7b010f-e9bc-4856-bbb6-03fdb6202a37'

    expect(await authorTokenOnDevice(userId)).toBe(await authorToken(userId))
  })
})

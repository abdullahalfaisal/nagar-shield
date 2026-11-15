import { act, renderHook } from '@testing-library/react'

/**
 * The Capture screen's submit hook, pinned against a double tap.
 *
 * `canSubmit` only changes after the next render, so two taps in the same
 * moment both pass it. Each submit makes its own request id, so the second
 * would file a second report. The hook therefore refuses to start a submit
 * while one is running.
 */

jest.mock('./submitCapture', () => ({ submitCapture: jest.fn() }))
jest.mock('./sessionUser', () => ({ currentUserId: jest.fn().mockResolvedValue('user-1') }))
jest.mock('./prepareMedia', () => ({ preparePhoto: jest.fn(), prepareVideo: jest.fn() }))
jest.mock('./uploadQueue', () => ({ enqueueUploadBounded: jest.fn() }))

import { submitCapture } from './submitCapture'
import { useCaptureSubmit, type CaptureDraft } from './captureFlow'
import type { PreparedMedia } from './mediaPipeline'

const mockedSubmit = submitCapture as jest.MockedFunction<typeof submitCapture>

const media: PreparedMedia = {
  uri: 'file:///cache/draft.jpg',
  mediaType: 'photo',
  byteSize: 1024,
  durationSeconds: null,
  width: 800,
  height: 600,
  contentType: 'image/jpeg',
  extension: 'jpg',
}

const draft: CaptureDraft = {
  lat: 23.7461,
  lng: 90.3774,
  capturedAt: '2026-11-13T10:00:00.000Z',
  description: 'a report',
  publicVisibility: 'anonymous',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useCaptureSubmit', () => {
  it('files one report for two taps in the same moment', async () => {
    let finish: (value: Awaited<ReturnType<typeof submitCapture>>) => void = () => {}
    mockedSubmit.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    const { result } = renderHook(() => useCaptureSubmit())

    let first: Promise<unknown> = Promise.resolve()
    let second: Promise<unknown> = Promise.resolve()
    await act(async () => {
      first = result.current.submit({ media, draft })
      second = result.current.submit({ media, draft })
      await Promise.resolve()
    })

    // The second tap was refused before it reached the network.
    await expect(second).resolves.toEqual({ status: 'cancelled' })
    expect(mockedSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish({ reportId: 'r1', areaHierarchy: null, moderationStatus: 'visible' })
      await first
    })

    await expect(first).resolves.toMatchObject({ status: 'sent' })
  })

  it('accepts a new submit once the first has finished', async () => {
    mockedSubmit.mockResolvedValue({
      reportId: 'r1',
      areaHierarchy: null,
      moderationStatus: 'visible',
    })
    const { result } = renderHook(() => useCaptureSubmit())

    await act(async () => {
      await result.current.submit({ media, draft })
    })
    await act(async () => {
      await result.current.submit({ media, draft })
    })

    expect(mockedSubmit).toHaveBeenCalledTimes(2)
  })
})

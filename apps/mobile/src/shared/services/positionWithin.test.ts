const mockGetPosition = jest.fn()
const mockGetLastKnown = jest.fn()

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: (...args: unknown[]) => mockGetPosition(...args),
  getLastKnownPositionAsync: (...args: unknown[]) => mockGetLastKnown(...args),
}))

import { currentPositionWithin, FIX_TIMEOUT_MS } from './positionWithin'

const FRESH = { coords: { latitude: 23.8, longitude: 90.4, accuracy: 9 } }
const STALE = { coords: { latitude: 23.7, longitude: 90.3, accuracy: 60 } }

beforeEach(() => {
  jest.useFakeTimers()
  mockGetPosition.mockReset()
  mockGetLastKnown.mockReset()
})

afterEach(() => jest.useRealTimers())

describe('currentPositionWithin', () => {
  it('returns the fresh reading when it arrives in time', async () => {
    mockGetPosition.mockResolvedValue(FRESH)

    await expect(currentPositionWithin({})).resolves.toBe(FRESH)
    expect(mockGetLastKnown).not.toHaveBeenCalled()
  })

  it('gives up after the limit and uses the last known position', async () => {
    mockGetPosition.mockReturnValue(new Promise(() => undefined))
    mockGetLastKnown.mockResolvedValue(STALE)

    const result = currentPositionWithin({})
    await jest.advanceTimersByTimeAsync(FIX_TIMEOUT_MS)

    await expect(result).resolves.toBe(STALE)
  })

  it('throws when it runs out of time and there is no last known position', async () => {
    mockGetPosition.mockReturnValue(new Promise(() => undefined))
    mockGetLastKnown.mockResolvedValue(null)

    const result = currentPositionWithin({})
    const assertion = expect(result).rejects.toThrow('took too long')
    await jest.advanceTimersByTimeAsync(FIX_TIMEOUT_MS)

    await assertion
  })

  it('uses the last known position when the reading fails outright', async () => {
    mockGetPosition.mockRejectedValue(new Error('provider disabled'))
    mockGetLastKnown.mockResolvedValue(STALE)

    await expect(currentPositionWithin({})).resolves.toBe(STALE)
  })

  it('keeps the original error when the last known lookup fails too', async () => {
    mockGetPosition.mockRejectedValue(new Error('provider disabled'))
    mockGetLastKnown.mockRejectedValue(new Error('no permission'))

    await expect(currentPositionWithin({})).rejects.toThrow('provider disabled')
  })
})

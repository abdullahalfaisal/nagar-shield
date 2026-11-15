/**
 * `takeSilentLocationFix` runs when the Location Sharing screen opens, so it
 * must never show a permission dialog (FR-PERMS-1). The test fixes that in
 * place: it may *read* the permission, and it must never *request* it.
 */
const mockGetPermission = jest.fn()
const mockRequestPermission = jest.fn()
const mockGetPosition = jest.fn()
const mockGetLastKnown = jest.fn()

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetPermission(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetPosition(...args),
  getLastKnownPositionAsync: (...args: unknown[]) => mockGetLastKnown(...args),
  Accuracy: { Balanced: 3 },
}))

import {
  parseManualCoordinates,
  raceFixAgainstTimeout,
  takeLastKnownFix,
  takeLocationFix,
  takeSilentLocationFix,
  type FixOutcome,
} from './locationFix'

const POSITION = { coords: { latitude: 23.81, longitude: 90.41, accuracy: 12 } }

beforeEach(() => {
  mockGetPermission.mockReset()
  mockRequestPermission.mockReset()
  mockGetPosition.mockReset()
  mockGetLastKnown.mockReset()
})

describe('takeSilentLocationFix', () => {
  it('takes the fix when the permission is already granted', async () => {
    mockGetPermission.mockResolvedValue({ status: 'granted' })
    mockGetPosition.mockResolvedValue(POSITION)

    await expect(takeSilentLocationFix()).resolves.toEqual({
      status: 'ready',
      lat: 23.81,
      lng: 90.41,
      accuracyM: 12,
    })
  })

  it('never requests the permission, whatever the state', async () => {
    for (const status of ['granted', 'denied', 'undetermined']) {
      mockGetPermission.mockResolvedValue({ status })
      mockGetPosition.mockResolvedValue(POSITION)

      await takeSilentLocationFix()
    }

    expect(mockRequestPermission).not.toHaveBeenCalled()
  })

  it('takes no fix when the permission is denied', async () => {
    mockGetPermission.mockResolvedValue({ status: 'denied' })

    await expect(takeSilentLocationFix()).resolves.toMatchObject({ status: 'denied' })
    expect(mockGetPosition).not.toHaveBeenCalled()
  })

  it('takes no fix when the permission was never asked for', async () => {
    mockGetPermission.mockResolvedValue({ status: 'undetermined' })

    await expect(takeSilentLocationFix()).resolves.toMatchObject({ status: 'undetermined' })
    expect(mockGetPosition).not.toHaveBeenCalled()
  })

  it('reports an unavailable provider instead of throwing', async () => {
    mockGetPermission.mockResolvedValue({ status: 'granted' })
    mockGetPosition.mockRejectedValue(new Error('provider off'))

    await expect(takeSilentLocationFix()).resolves.toEqual({ status: 'unavailable' })
  })

  it('treats a failed permission read as denied', async () => {
    mockGetPermission.mockRejectedValue(new Error('no module'))

    await expect(takeSilentLocationFix()).resolves.toMatchObject({ status: 'denied' })
  })
})

describe('takeLocationFix (the prompting one)', () => {
  it('still requests the permission', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' })
    mockGetPosition.mockResolvedValue(POSITION)

    await takeLocationFix()

    expect(mockRequestPermission).toHaveBeenCalledTimes(1)
  })
})

describe('takeLastKnownFix', () => {
  const KNOWN = {
    coords: { latitude: 23.8, longitude: 90.4, accuracy: 40 },
    timestamp: 1_700_000_000_000,
  }

  it('returns the last known position with the time it was measured', async () => {
    mockGetPermission.mockResolvedValue({ status: 'granted' })
    mockGetLastKnown.mockResolvedValue(KNOWN)

    await expect(takeLastKnownFix()).resolves.toEqual({
      status: 'ready',
      lat: 23.8,
      lng: 90.4,
      accuracyM: 40,
      takenAt: 1_700_000_000_000,
    })
  })

  it('never requests the permission and never waits for a fresh reading', async () => {
    for (const status of ['granted', 'denied', 'undetermined']) {
      mockGetPermission.mockResolvedValue({ status })
      mockGetLastKnown.mockResolvedValue(KNOWN)

      await takeLastKnownFix()
    }

    expect(mockRequestPermission).not.toHaveBeenCalled()
    expect(mockGetPosition).not.toHaveBeenCalled()
  })

  it('is unavailable when the phone has no recent position', async () => {
    mockGetPermission.mockResolvedValue({ status: 'granted' })
    mockGetLastKnown.mockResolvedValue(null)

    await expect(takeLastKnownFix()).resolves.toEqual({ status: 'unavailable' })
  })

  it('asks only for a recent, reasonably accurate position', async () => {
    mockGetPermission.mockResolvedValue({ status: 'granted' })
    mockGetLastKnown.mockResolvedValue(KNOWN)

    await takeLastKnownFix()

    expect(mockGetLastKnown).toHaveBeenCalledWith({ maxAge: 5 * 60_000, requiredAccuracy: 500 })
  })

  it('takes no position when the permission is not granted', async () => {
    mockGetPermission.mockResolvedValue({ status: 'denied' })

    await expect(takeLastKnownFix()).resolves.toMatchObject({ status: 'denied' })
    expect(mockGetLastKnown).not.toHaveBeenCalled()
  })
})

describe('raceFixAgainstTimeout', () => {
  const FALLBACK = { lat: 1, lng: 2, accuracyM: 30 }
  const READY: FixOutcome = { status: 'ready', lat: 23.81, lng: 90.41, accuracyM: 12 }

  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('uses the fresh fix when it lands in time, and clears the timer', async () => {
    const result = await raceFixAgainstTimeout(Promise.resolve(READY), FALLBACK, 4000)

    expect(result).toEqual({
      position: { lat: 23.81, lng: 90.41, accuracyM: 12 },
      timedOut: false,
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('falls back to the last fix when the refresh hangs', async () => {
    const pending = raceFixAgainstTimeout(new Promise<FixOutcome>(() => {}), FALLBACK, 4000)
    await jest.advanceTimersByTimeAsync(4000)

    await expect(pending).resolves.toEqual({ position: FALLBACK, timedOut: true })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('ignores a fix that lands after the timeout', async () => {
    let late!: (outcome: FixOutcome) => void
    const refresh = new Promise<FixOutcome>((resolve) => {
      late = resolve
    })
    const pending = raceFixAgainstTimeout(refresh, FALLBACK, 4000)
    await jest.advanceTimersByTimeAsync(4000)
    late(READY)

    await expect(pending).resolves.toEqual({ position: FALLBACK, timedOut: true })
  })

  it('keeps the last fix when the refresh fails or is refused', async () => {
    const result = await raceFixAgainstTimeout(
      Promise.resolve({ status: 'unavailable' }),
      FALLBACK,
      4000,
    )

    expect(result).toEqual({ position: FALLBACK, timedOut: false })
  })
})

describe('parseManualCoordinates', () => {
  it('reads plain decimals', () => {
    expect(parseManualCoordinates('23.7806', '90.4066')).toMatchObject({
      ok: true,
      lat: 23.7806,
      lng: 90.4066,
      accuracyM: null,
      outsideBangladesh: false,
    })
  })

  it('reads Bangla digits and a comma decimal', () => {
    expect(parseManualCoordinates('২৩.৭৮০৬', '৯০,৪০৬৬')).toMatchObject({
      ok: true,
      lat: 23.7806,
      lng: 90.4066,
    })
  })

  it('names the field that failed', () => {
    expect(parseManualCoordinates('abc', '90')).toEqual({ ok: false, field: 'lat' })
    expect(parseManualCoordinates('23', '')).toEqual({ ok: false, field: 'lng' })
    expect(parseManualCoordinates('91', '90')).toEqual({ ok: false, field: 'lat' })
    expect(parseManualCoordinates('23', '181')).toEqual({ ok: false, field: 'lng' })
    expect(parseManualCoordinates('0x10', '90')).toEqual({ ok: false, field: 'lat' })
  })

  it('accepts zero and flags a point outside Bangladesh', () => {
    expect(parseManualCoordinates('0', '0')).toMatchObject({ ok: true, outsideBangladesh: true })
  })
})

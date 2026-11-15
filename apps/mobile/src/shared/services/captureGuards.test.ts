import {
  createFixWait,
  hasCaptureInput,
  pickerLaunchDelayMs,
  shouldRefreshFixOnPermission,
  SEND_FIX_WAIT_MS,
} from './captureGuards'

const empty = { hasMedia: false, description: '', placeDetail: '', category: null, areaId: null }

describe('hasCaptureInput', () => {
  it('is false for an untouched form and for whitespace', () => {
    expect(hasCaptureInput(empty)).toBe(false)
    expect(hasCaptureInput({ ...empty, description: '  \n', placeDetail: ' ' })).toBe(false)
  })

  it.each([
    { hasMedia: true },
    { description: 'a man' },
    { placeDetail: 'near the shop' },
    { category: 'theft' },
    { areaId: 'area-1' },
  ])('is true once %o is entered', (patch) => {
    expect(hasCaptureInput({ ...empty, ...patch })).toBe(true)
  })
})

describe('shouldRefreshFixOnPermission', () => {
  it('refreshes only when location goes from not granted to granted', () => {
    expect(shouldRefreshFixOnPermission('denied', 'granted')).toBe(true)
    expect(shouldRefreshFixOnPermission('undetermined', 'granted')).toBe(true)
  })

  it('does not refresh on the first read, while granted, or on a revoke', () => {
    expect(shouldRefreshFixOnPermission(null, 'granted')).toBe(false)
    expect(shouldRefreshFixOnPermission('granted', 'granted')).toBe(false)
    expect(shouldRefreshFixOnPermission('granted', 'denied')).toBe(false)
    expect(shouldRefreshFixOnPermission('denied', undefined)).toBe(false)
  })
})

describe('pickerLaunchDelayMs', () => {
  it('waits for the sheet on iOS only', () => {
    expect(pickerLaunchDelayMs('ios')).toBeGreaterThanOrEqual(300)
    expect(pickerLaunchDelayMs('android')).toBe(0)
  })
})

describe('createFixWait', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('waits about five seconds for the fix', () => {
    expect(SEND_FIX_WAIT_MS).toBe(5_000)
  })

  it('resolves null when the time is up', async () => {
    const wait = createFixWait(1000)
    jest.advanceTimersByTime(1000)
    await expect(wait.promise).resolves.toBeNull()
  })

  it('resolves null at once on skip, and clear leaves no timer behind', async () => {
    const wait = createFixWait(5000)
    wait.skip()
    await expect(wait.promise).resolves.toBeNull()
    wait.clear()
    expect(jest.getTimerCount()).toBe(0)
  })
})

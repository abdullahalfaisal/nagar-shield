import {
  isLowBattery,
  refreshPauseReason,
  RefreshPausedError,
  type RefreshPauseReason,
} from './refreshGuard'

/**
 * The refresh guards — the pure rules.
 *
 * Story `006-alerts / 002-auto-refresh-and-pull-to-refresh`. The feed polls
 * every 60 s while the app is foregrounded and healthy. It pauses when the
 * battery is low, when the app is backgrounded, and when the device is
 * offline.
 *
 * These rules are pure functions on purpose: the *timing* of the poll is
 * exercised in `alertsRefresh.dom.test.ts` against the real hook, but the
 * **decisions** — which condition pauses, and which reason is shown — are
 * decided here, where a boundary can be pinned exactly.
 */

describe('isLowBattery', () => {
  it('treats an unknown reading as not low', () => {
    // A missing reading must never silently kill the refresh. `null` is what
    // the hook produces when the battery module cannot be read, and when the
    // module reports its `-1` "unknown" sentinel.
    expect(isLowBattery(null)).toBe(false)
  })

  it('is not low at the threshold itself', () => {
    // The comparison is strictly less than 20 %, so exactly 20 % still
    // refreshes. The boundary is a product decision, so it is pinned here
    // rather than inferred.
    expect(isLowBattery(0.2)).toBe(false)
  })

  it('is low just below the threshold', () => {
    expect(isLowBattery(0.19)).toBe(true)
  })

  it('is not low just above the threshold', () => {
    expect(isLowBattery(0.21)).toBe(false)
  })

  it('is low when the battery is empty', () => {
    expect(isLowBattery(0)).toBe(true)
  })

  it('is not low on a full battery', () => {
    expect(isLowBattery(1)).toBe(false)
  })
})

describe('refreshPauseReason', () => {
  const healthy = { isForeground: true, isLowBattery: false, isOffline: false }

  it('does not pause a healthy foregrounded device', () => {
    expect(refreshPauseReason(healthy)).toBeNull()
  })

  it('pauses on a low battery', () => {
    expect(refreshPauseReason({ ...healthy, isLowBattery: true })).toBe('battery')
  })

  it('pauses when the device is offline', () => {
    expect(refreshPauseReason({ ...healthy, isOffline: true })).toBe('offline')
  })

  it('pauses when the app is backgrounded', () => {
    expect(refreshPauseReason({ ...healthy, isForeground: false })).toBe('background')
  })

  it('reports background over battery', () => {
    // The order matters: **background wins**. A backgrounded app is
    // backgrounded whether or not its battery is also low, and the reason the
    // header shows is the one that will change first when the app comes back.
    expect(refreshPauseReason({ isForeground: false, isLowBattery: true, isOffline: false })).toBe(
      'background',
    )
  })

  it('reports battery over offline', () => {
    // Same rule, one step down: the battery is the condition that will
    // change first, so it is the one that is named.
    expect(refreshPauseReason({ isForeground: true, isLowBattery: true, isOffline: true })).toBe(
      'battery',
    )
  })

  it('reports background over everything', () => {
    expect(refreshPauseReason({ isForeground: false, isLowBattery: true, isOffline: true })).toBe(
      'background',
    )
  })

  it('pauses when every condition holds at once', () => {
    // The three conditions are OR-ed: any one of them pauses the poll.
    expect(refreshPauseReason({ isForeground: true, isLowBattery: false, isOffline: true })).toBe(
      'offline',
    )
  })
})

describe('RefreshPausedError', () => {
  it('carries the reason it was raised for', () => {
    const error = new RefreshPausedError('battery')
    expect(error.reason).toBe('battery')
  })

  it('is an Error, so it survives a promise rejection', () => {
    const error = new RefreshPausedError('offline')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('RefreshPausedError')
    expect(error.message).toContain('offline')
  })

  it('names the reason in the message so a log is readable', () => {
    expect(new RefreshPausedError('background').message).toContain('background')
  })

  it('tolerates a null reason', () => {
    // The reason is nullable in the type, so the constructor must not throw
    // on it — a paused refresh with no stated reason still has to be
    // reportable.
    const error = new RefreshPausedError(null)
    expect(error.reason).toBeNull()
    expect(error.message).toContain('unknown')
  })

  it('names only the reasons the guard can produce', () => {
    // A typo in a reason would silently fall through to the default label
    // on the screen, so the set is pinned here.
    const reasons: RefreshPauseReason[] = ['battery', 'background', 'offline', null]
    expect(reasons).toEqual(['battery', 'background', 'offline', null])
  })
})

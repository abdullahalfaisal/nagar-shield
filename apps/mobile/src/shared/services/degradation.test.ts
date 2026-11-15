import {
  BATTERY_SAVER_DETECTION,
  manualDialGuidance,
  needsManualDialGuidance,
  powerSaveWarningIsUseful,
  readDegradedState,
  readIsOffline,
  readPowerSaveState,
  UNKNOWN_DEGRADED_STATE,
  type DegradedState,
} from './degradation'

/**
 * The degraded-mode rules.
 *
 * Story `003-help-seek / 004-graceful-degradation`. The dial path must keep
 * working when the device cannot help it, and it must say plainly what to do
 * instead.
 *
 * The two rules that matter most here are both about **not lying**:
 *
 *   * a missing reading is not a negative reading — the app never claims
 *     power saving is off when it could not read the state;
 *   * the app never claims a call was placed, connected, or delivered. It
 *     cannot know, and constraint C-1 forbids asking.
 */

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
}))

jest.mock('expo-battery', () => ({
  isLowPowerModeEnabledAsync: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Network = require('expo-network')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Battery = require('expo-battery')

function state(overrides: Partial<DegradedState> = {}): DegradedState {
  return { ...UNKNOWN_DEGRADED_STATE, ...overrides }
}

describe('the power-save capability', () => {
  it('is available: expo-battery reads Android power-saver mode', () => {
    // FR-PERMS-3. The earlier build assumed no Expo API could read Android
    // power-save mode — and warned about battery saver after **every** dial,
    // because an always-unknown state is treated as "worth warning about".
    // `Battery.isLowPowerModeEnabledAsync()` is that first-class API, so the
    // capability is real now and the false prompt is gone.
    expect(BATTERY_SAVER_DETECTION).toBe('available')
  })
})

describe('readPowerSaveState', () => {
  beforeEach(() => {
    Battery.isLowPowerModeEnabledAsync.mockReset()
  })

  it('reads an enabled power-saver mode as on', async () => {
    Battery.isLowPowerModeEnabledAsync.mockResolvedValue(true)
    await expect(readPowerSaveState()).resolves.toBe('on')
  })

  it('reads a disabled power-saver mode as off', async () => {
    Battery.isLowPowerModeEnabledAsync.mockResolvedValue(false)
    await expect(readPowerSaveState()).resolves.toBe('off')
  })

  it('reads as unknown rather than off when the read fails', async () => {
    // "We could not read the state" is not "power saving is off". Reading it
    // as off would suppress a warning the user needs.
    Battery.isLowPowerModeEnabledAsync.mockRejectedValue(new Error('module unavailable'))
    await expect(readPowerSaveState()).resolves.toBe('unknown')
  })
})

describe('powerSaveWarningIsUseful', () => {
  it('warns when power saving is on', () => {
    expect(powerSaveWarningIsUseful(state({ powerSave: 'on' }))).toBe(true)
  })

  it('warns when the state could not be read', () => {
    // The static copy is exactly this case: the app does not know, so it
    // tells the user to dial the number themselves.
    expect(powerSaveWarningIsUseful(state({ powerSave: 'unknown' }))).toBe(true)
  })

  it('does not warn when power saving is known to be off', () => {
    expect(powerSaveWarningIsUseful(state({ powerSave: 'off' }))).toBe(false)
  })
})

describe('needsManualDialGuidance', () => {
  it('shows the guidance when the dialler did not open', () => {
    // The OS has no `tel:` handler, or the user disabled the dialler app.
    expect(needsManualDialGuidance(state({ powerSave: 'off' }), false)).toBe(true)
  })

  it('shows the guidance when the device is offline', () => {
    // The dialler still opens, but a phone with no signal cannot place a
    // call, so the number must be in front of the user.
    expect(needsManualDialGuidance(state({ powerSave: 'off', isOffline: true }), true)).toBe(true)
  })

  it('shows the guidance when power saving is on', () => {
    expect(needsManualDialGuidance(state({ powerSave: 'on' }), true)).toBe(true)
  })

  it('hides the guidance when everything is healthy', () => {
    expect(needsManualDialGuidance(state({ powerSave: 'off', isOffline: false }), true)).toBe(false)
  })
})

describe('readIsOffline', () => {
  beforeEach(() => {
    Network.getNetworkStateAsync.mockReset()
  })

  it('reads an offline device', async () => {
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    })
    await expect(readIsOffline()).resolves.toBe(true)
  })

  it('reads an online device', async () => {
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    })
    await expect(readIsOffline()).resolves.toBe(false)
  })

  it('does not claim a degraded mode it cannot substantiate', async () => {
    // A failed read is not evidence of being offline. Claiming it would show
    // the citizen a warning about a problem the app never saw.
    Network.getNetworkStateAsync.mockRejectedValue(new Error('module unavailable'))
    await expect(readIsOffline()).resolves.toBe(false)
  })
})

describe('readDegradedState', () => {
  beforeEach(() => {
    Network.getNetworkStateAsync.mockReset()
    Battery.isLowPowerModeEnabledAsync.mockReset()
  })

  it('never reports a location denial it did not observe', async () => {
    // The dial path never requests a location fix, so the app cannot know
    // whether location is denied. It must not pretend otherwise.
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    })
    Battery.isLowPowerModeEnabledAsync.mockResolvedValue(false)
    const degraded = await readDegradedState()
    expect(degraded.isLocationDenied).toBe(false)
  })

  it('carries the real power-save reading and its capability', async () => {
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    })
    Battery.isLowPowerModeEnabledAsync.mockResolvedValue(false)
    const degraded = await readDegradedState()
    expect(degraded.powerSave).toBe('off')
    expect(degraded.powerSaveCapability).toBe('available')
  })

  it('degrades the power-save reading to unknown when the read fails', async () => {
    Network.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    })
    Battery.isLowPowerModeEnabledAsync.mockRejectedValue(new Error('module unavailable'))
    const degraded = await readDegradedState()
    expect(degraded.powerSave).toBe('unknown')
    expect(degraded.powerSaveCapability).toBe('available')
  })
})

describe('manualDialGuidance', () => {
  it('names the number in Bangla numerals and ASCII digits', () => {
    // The user reads the number off the screen and dials it from the keypad
    // without the app — so both scripts have to be there.
    const guidance = manualDialGuidance('999')
    expect(guidance.bengali).toBe('৯৯৯')
    expect(guidance.ascii).toBe('999')
    expect(guidance.combined).toContain('৯৯৯')
    expect(guidance.combined).toContain('999')
  })

  it('names the Fire number correctly', () => {
    // Fire is 102, not 999 (PRD fact A-7).
    expect(manualDialGuidance('102').bengali).toBe('১০২')
  })

  it('strips the formatting a dataset number may carry', () => {
    expect(manualDialGuidance('+880 999').ascii).toBe('+880999')
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'

/**
 * The degraded-help flow — the dial path's warning state.
 *
 * `003-help-seek / 004-graceful-degradation`, via `useDegradedHelp`.
 *
 * These tests live in a `.dom.test.ts` file because `renderHook` needs a DOM.
 * The regression this pins is the **false battery-saver prompt**: the user
 * taps a call button, the dialer opens, they come back without dialling, and
 * the guidance must **not** claim battery saver unless the OS says so — and a
 * return to the foreground must re-read the state rather than serve whatever
 * the mount read happened to catch.
 */

/**
 * `AppState` is a native module; the jsdom project has no bridge. The mock
 * supplies it as **variables**, so a test can bounce the app to the dialer
 * and back — the exact flow the guidance's return-time re-read covers.
 */
let mockAppState = 'active'
const mockAppStateListeners = new Set<(state: string) => void>()

jest.mock('react-native', () => ({
  __esModule: true,
  AppState: {
    get currentState() {
      return mockAppState
    },
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      mockAppStateListeners.add(listener)
      return {
        remove: () => {
          mockAppStateListeners.delete(listener)
        },
      }
    }),
  },
}))

/** One app-state transition, delivered to the hook's listener. */
async function setAppState(state: string) {
  mockAppState = state
  await act(async () => {
    for (const listener of mockAppStateListeners) listener(state)
  })
}

jest.mock('expo-battery', () => ({
  isLowPowerModeEnabledAsync: jest.fn(),
}))

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(),
}))

jest.mock('./dialer', () => ({
  openDialer: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Battery = require('expo-battery')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Network = require('expo-network')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { openDialer } = require('./dialer')

import { useDegradedHelp } from './useDegradedHelp'

function healthyDevice() {
  Battery.isLowPowerModeEnabledAsync.mockResolvedValue(false)
  Network.getNetworkStateAsync.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  })
}

beforeEach(() => {
  Battery.isLowPowerModeEnabledAsync.mockReset()
  Network.getNetworkStateAsync.mockReset()
  openDialer.mockReset()
  healthyDevice()
})

describe('the dial flow on a healthy device', () => {
  it('shows no guidance after a dial the OS opened', async () => {
    openDialer.mockResolvedValue(true)

    const { result } = renderHook(() => useDegradedHelp())
    await waitFor(() => expect(result.current.degraded.powerSave).toBe('off'))

    await act(async () => {
      await result.current.dial('999')
    })

    expect(result.current.showGuidance).toBe(false)
    expect(result.current.showPowerSaveWarning).toBe(false)
  })
})

describe('the return from the dialer', () => {
  it('re-reads the device state instead of serving the mount read', async () => {
    // The regression: a mount read that came back `'unknown'` (a hiccup, a
    // module not yet warm) used to pin the state for the whole visit, and
    // `'unknown'` warns — so every dial return showed the battery-saver
    // prompt. The foreground return re-reads; once the read works and says
    // off, the warning goes.
    Battery.isLowPowerModeEnabledAsync
      .mockRejectedValueOnce(new Error('module not warm yet'))
      .mockResolvedValue(false)
    openDialer.mockResolvedValue(true)

    const { result } = renderHook(() => useDegradedHelp())
    await waitFor(() => expect(result.current.degraded.powerSave).toBe('unknown'))

    await act(async () => {
      await result.current.dial('999')
    })
    expect(result.current.showPowerSaveWarning).toBe(true)

    await setAppState('background')
    await setAppState('active')

    await waitFor(() => expect(result.current.degraded.powerSave).toBe('off'))
    expect(result.current.showPowerSaveWarning).toBe(false)
  })

  it('keeps the warning when the re-read says power saving is on', async () => {
    Battery.isLowPowerModeEnabledAsync.mockResolvedValue(true)
    openDialer.mockResolvedValue(true)

    const { result } = renderHook(() => useDegradedHelp())
    await waitFor(() => expect(result.current.degraded.powerSave).toBe('on'))

    await act(async () => {
      await result.current.dial('999')
    })

    await setAppState('background')
    await setAppState('active')
    await waitFor(() => expect(result.current.degraded.powerSave).toBe('on'))

    expect(result.current.showGuidance).toBe(true)
    expect(result.current.showPowerSaveWarning).toBe(true)
  })
})

describe('an unresolved dialer', () => {
  it('shows the guidance even on an otherwise healthy device', async () => {
    openDialer.mockResolvedValue(false)

    const { result } = renderHook(() => useDegradedHelp())
    await waitFor(() => expect(result.current.degraded.powerSave).toBe('off'))

    await act(async () => {
      await result.current.dial('102')
    })

    expect(result.current.showGuidance).toBe(true)
  })
})

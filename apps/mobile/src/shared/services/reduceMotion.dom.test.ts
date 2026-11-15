import { act, renderHook } from '@testing-library/react'

/**
 * The reduce-motion setting.
 *
 * Story `006-alerts / 002-auto-refresh-and-pull-to-refresh`, criterion #10:
 *
 * > **Given** the operating system's **reduce-motion** setting is **on**, **When**
 * > the feed header renders, **Then** the pulsing dot does **not** animate — the
 * > dot and its label are still shown, and the label text is unchanged
 *
 * The hook is **real React**, so it is rendered here in jsdom with
 * `renderHook` — the same split the other hook tests use. The half that
 * cannot be rendered (the dot's animation) is asserted by
 * `shared/ui/pulseDot.test.ts`.
 */

/**
 * `AccessibilityInfo` is a native module.
 *
 * The mock is a **variable** so the reading can change between tests: the
 * criterion is about a *setting that is on*, and a factory that always
 * returned `true` would make the "off" assertions vacuous.
 */
let mockReduceMotionEnabled = false
const mockListeners = new Set<(enabled: boolean) => void>()

jest.mock('react-native', () => ({
  __esModule: true,
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(async () => mockReduceMotionEnabled),
    addEventListener: jest.fn((_event: string, listener: (enabled: boolean) => void) => {
      mockListeners.add(listener)
      return {
        remove: () => {
          mockListeners.delete(listener)
        },
      }
    }),
  },
}))

import { useReducedMotion } from './reduceMotion'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AccessibilityInfo } = require('react-native')

describe('useReducedMotion', () => {
  beforeEach(() => {
    mockReduceMotionEnabled = false
    mockListeners.clear()
    AccessibilityInfo.isReduceMotionEnabled.mockClear()
  })

  /**
   * Renders the hook and settles the first reading.
   *
   * The reading is asynchronous, so it resolves after the first render. The
   * settle is wrapped in `act` — React logs an "update not wrapped in act"
   * warning when a state update lands outside one, and the warning would
   * otherwise be printed by every test in this file.
   */
  async function renderSettled() {
    const rendered = renderHook(() => useReducedMotion())

    await act(async () => {
      await Promise.resolve()
    })

    return rendered
  }

  it('reads false when the setting is off', async () => {
    const { result } = await renderSettled()

    expect(result.current).toBe(false)
  })

  it('reads true when the setting is on', async () => {
    mockReduceMotionEnabled = true

    const { result } = await renderSettled()

    expect(result.current).toBe(true)
  })

  it('follows the setting when it changes while the app is running', async () => {
    const { result } = await renderSettled()

    expect(result.current).toBe(false)

    // The user flips the switch in the OS settings while the app is open.
    // The listener sets React state, so the call is wrapped in `act` — React
    // logs an "update not wrapped in act" warning otherwise.
    act(() => {
      for (const listener of mockListeners) listener(true)
    })

    expect(result.current).toBe(true)
  })

  it('starts false before the first reading arrives', async () => {
    // The reading is asynchronous, so the very first render cannot know the
    // setting. It must not guess "on" — guessing would freeze the app for a
    // user who never asked for it.
    mockReduceMotionEnabled = true

    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(false)

    // The reading lands after the assertion; let it settle so the state
    // update happens inside `act` rather than after the test ends.
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current).toBe(true)
  })

  it('treats an unreadable setting as off', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockRejectedValueOnce(new Error('module unavailable'))

    const { result } = await renderSettled()

    expect(result.current).toBe(false)
  })

  it('subscribes to the change event', async () => {
    renderHook(() => useReducedMotion())

    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function),
    )
  })

  it('unsubscribes on unmount', async () => {
    const { unmount } = await renderSettled()

    expect(mockListeners.size).toBe(1)

    unmount()

    expect(mockListeners.size).toBe(0)
  })
})

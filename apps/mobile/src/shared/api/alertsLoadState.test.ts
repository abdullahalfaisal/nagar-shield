import { RefreshPausedError } from '@/shared/services/refreshGuard'
import { alertsLoadFailed } from './alertsLoadState'

describe('alertsLoadFailed', () => {
  it('is false when the query has not errored', () => {
    expect(alertsLoadFailed({ isError: false, data: undefined })).toBe(false)
  })

  it('is true when the query errored and there is no cached page', () => {
    expect(alertsLoadFailed({ isError: true, data: undefined })).toBe(true)
  })

  it('is true for a real failure with no cached page', () => {
    expect(alertsLoadFailed({ isError: true, data: undefined, error: new Error('down') })).toBe(
      true,
    )
  })

  it('is false when the error is only a paused refresh', () => {
    expect(
      alertsLoadFailed({
        isError: true,
        data: undefined,
        error: new RefreshPausedError('background'),
      }),
    ).toBe(false)
  })
})

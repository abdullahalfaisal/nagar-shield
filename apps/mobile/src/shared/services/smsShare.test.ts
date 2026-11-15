import * as SMS from 'expo-sms'
import { fireSmsShare } from './smsShare'

/**
 * The message composer hand-over: one composer, every number, nothing claimed.
 */

jest.mock('expo-sms', () => ({
  isAvailableAsync: jest.fn(),
  sendSMSAsync: jest.fn(),
}))

const mockedAvailable = SMS.isAvailableAsync as jest.MockedFunction<typeof SMS.isAvailableAsync>
const mockedSend = SMS.sendSMSAsync as jest.MockedFunction<typeof SMS.sendSMSAsync>

beforeEach(() => {
  jest.clearAllMocks()
  mockedAvailable.mockResolvedValue(true)
  mockedSend.mockResolvedValue({ result: 'unknown' })
})

describe('fireSmsShare', () => {
  it('opens one composer with every number and the text', async () => {
    const outcome = await fireSmsShare(['+8801711000411', '+8801711000422'], 'I am here')

    expect(mockedSend).toHaveBeenCalledTimes(1)
    expect(mockedSend).toHaveBeenCalledWith(['+8801711000411', '+8801711000422'], 'I am here')
    expect(outcome).toEqual({ status: 'shared' })
  })

  it('counts an unknown result as handed over, never as delivered', async () => {
    mockedSend.mockResolvedValue({ result: 'unknown' })
    expect(await fireSmsShare(['+8801711000411'], 'hi')).toEqual({ status: 'shared' })

    mockedSend.mockResolvedValue({ result: 'sent' })
    expect(await fireSmsShare(['+8801711000411'], 'hi')).toEqual({ status: 'shared' })
  })

  it('reports a cancelled composer as dismissed', async () => {
    mockedSend.mockResolvedValue({ result: 'cancelled' })

    expect(await fireSmsShare(['+8801711000411'], 'hi')).toEqual({ status: 'dismissed' })
  })

  it('is unavailable when the device has no message app', async () => {
    mockedAvailable.mockResolvedValue(false)

    expect(await fireSmsShare(['+8801711000411'], 'hi')).toEqual({ status: 'unavailable' })
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('is unavailable, not thrown, when the composer fails', async () => {
    mockedSend.mockRejectedValue(new Error('boom'))

    expect(await fireSmsShare(['+8801711000411'], 'hi')).toEqual({ status: 'unavailable' })
  })

  it('opens nothing for no numbers or an empty text', async () => {
    expect(await fireSmsShare([], 'hi')).toEqual({ status: 'unavailable' })
    expect(await fireSmsShare(['+8801711000411'], '  ')).toEqual({ status: 'unavailable' })
    expect(mockedSend).not.toHaveBeenCalled()
  })
})

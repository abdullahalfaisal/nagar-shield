import type { EmergencyContact } from '@nagar-shield/shared'
import { writeLocationShare } from '@/shared/api/locationShares'
import { fireOsShare } from '@/shared/services/osShare'
import { fireSmsShare } from '@/shared/services/smsShare'
import { recordShareIntent } from '@/shared/services/shareTelemetry'
import {
  selectExplicitRecipients,
  selectPrimaryRecipients,
  shareLocation,
  type ShareResult,
} from './shareLocation'

/**
 * The Location Sharing fan-out.
 *
 * The rules that matter:
 *
 *   * **One message** — the phone's composer opens once, with every recipient.
 *     The share sheet is the fallback, also opened once.
 *   * **One fix for the whole fan-out** — the same snapshot to every recipient.
 *   * **Deselection wins** — the fan-out is a default selector, not an
 *     override of the user's explicit choice.
 *   * **No duplicates** — a contact reached twice is in the message once.
 *   * **Nothing is claimed** — a closed composer is reported as "not sent",
 *     and no record is written for a share that did not happen.
 */

jest.mock('@/shared/api/locationShares', () => ({
  writeLocationShare: jest.fn(),
}))

jest.mock('@/shared/services/osShare', () => ({
  fireOsShare: jest.fn(),
}))

jest.mock('@/shared/services/smsShare', () => ({
  fireSmsShare: jest.fn(),
}))

jest.mock('@/shared/services/shareTelemetry', () => ({
  recordShareIntent: jest.fn(),
}))

const mockedWrite = writeLocationShare as jest.MockedFunction<typeof writeLocationShare>
const mockedFire = fireOsShare as jest.MockedFunction<typeof fireOsShare>
const mockedSms = fireSmsShare as jest.MockedFunction<typeof fireSmsShare>
const mockedRecord = recordShareIntent as jest.MockedFunction<typeof recordShareIntent>

/** Builds a contact. */
function contact(overrides: Partial<EmergencyContact> = {}): EmergencyContact {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Primary Friend',
    phone: '+8801711000411',
    isPrimary: true,
    groupName: 'friend',
    sortOrder: 0,
    createdAt: '2026-11-04T00:00:00Z',
    ...overrides,
  }
}

/** The position of a normal share. */
const position = { lat: 23.7806, lng: 90.4066, accuracyM: 12 }

beforeEach(() => {
  jest.clearAllMocks()

  mockedSms.mockResolvedValue({ status: 'shared' })
  mockedFire.mockResolvedValue({ status: 'shared' })
  mockedRecord.mockResolvedValue({
    elapsedMs: 100,
    channel: 'os_share_sheet',
    recipientCount: 1,
  })
  mockedWrite.mockImplementation(async (input) => ({
    id: `row-${input.recipientContactId ?? 'os'}`,
    recipientContactId: input.recipientContactId,
    lat: input.position.lat,
    lng: input.position.lng,
    accuracyM: input.position.accuracyM,
    mode: 'snapshot' as const,
    shareChannel: input.channel,
    sharedAt: '2026-11-04T10:30:00Z',
  }))
})

describe('selectPrimaryRecipients', () => {
  it('selects the primary contacts only', () => {
    const contacts = [
      contact({ id: 'c1', isPrimary: true }),
      contact({ id: 'c2', isPrimary: false }),
      contact({ id: 'c3', isPrimary: true }),
    ]

    const selected = selectPrimaryRecipients(contacts)
    expect(selected.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('orders the selection by sort_order', () => {
    const contacts = [
      contact({ id: 'c1', isPrimary: true, sortOrder: 2 }),
      contact({ id: 'c2', isPrimary: true, sortOrder: 0 }),
    ]

    const selected = selectPrimaryRecipients(contacts)
    expect(selected.map((c) => c.id)).toEqual(['c2', 'c1'])
  })

  it('drops a primary the user has deselected — deselection wins', () => {
    const contacts = [
      contact({ id: 'c1', isPrimary: true }),
      contact({ id: 'c2', isPrimary: true }),
    ]

    const selected = selectPrimaryRecipients(contacts, ['c1'])
    expect(selected.map((c) => c.id)).toEqual(['c2'])
  })

  it('returns nothing when there are no primaries', () => {
    const contacts = [contact({ id: 'c1', isPrimary: false })]
    expect(selectPrimaryRecipients(contacts)).toEqual([])
  })
})

describe('selectExplicitRecipients', () => {
  it('selects exactly the checked contacts', () => {
    const contacts = [contact({ id: 'c1' }), contact({ id: 'c2' }), contact({ id: 'c3' })]

    const selected = selectExplicitRecipients(contacts, ['c1', 'c3'])
    expect(selected.map((c) => c.id)).toEqual(['c1', 'c3'])
  })

  it('ignores an id that is not in the contact list', () => {
    const contacts = [contact({ id: 'c1' })]
    const selected = selectExplicitRecipients(contacts, ['c1', 'not-a-contact'])
    expect(selected.map((c) => c.id)).toEqual(['c1'])
  })
})

const NOTE = 'The location is unavailable.'

function input(overrides: Partial<Parameters<typeof shareLocation>[0]> = {}) {
  return {
    recipients: [contact({ id: 'c1' })],
    position,
    withoutLocationNote: NOTE,
    startedAt: Date.now(),
    ...overrides,
  }
}

describe('shareLocation', () => {
  it('opens one message to every recipient, with their phone numbers', async () => {
    const result = await shareLocation(
      input({
        recipients: [
          contact({ id: 'c1', phone: '+8801711000411' }),
          contact({ id: 'c2', phone: '+8801711000422' }),
          contact({ id: 'c3', phone: '+8801711000433' }),
        ],
      }),
    )

    expect(mockedSms).toHaveBeenCalledTimes(1)
    expect(mockedSms.mock.calls[0]?.[0]).toEqual([
      '+8801711000411',
      '+8801711000422',
      '+8801711000433',
    ])
    expect(mockedFire).not.toHaveBeenCalled()
    expect(result.shared.os_share_sheet).toBe(3)
    expect(result.outcomes).toHaveLength(3)
  })

  it('falls back to the share sheet, once, when the device has no message app', async () => {
    mockedSms.mockResolvedValue({ status: 'unavailable' })

    const result = await shareLocation(
      input({ recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })] }),
    )

    expect(mockedFire).toHaveBeenCalledTimes(1)
    expect(result.shared.os_share_sheet).toBe(2)
  })

  it('opens only the share sheet, once, when the user picks other apps', async () => {
    const result = await shareLocation(
      input({ via: 'apps', recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })] }),
    )

    expect(mockedSms).not.toHaveBeenCalled()
    expect(mockedFire).toHaveBeenCalledTimes(1)
    expect(result.shared.os_share_sheet).toBe(2)
  })

  it('opens the share sheet with no contact selected, and writes no record', async () => {
    const result = await shareLocation(input({ via: 'apps', recipients: [] }))

    expect(mockedSms).not.toHaveBeenCalled()
    expect(mockedFire).toHaveBeenCalledTimes(1)
    expect(mockedWrite).not.toHaveBeenCalled()
    expect(result.outcomes).toEqual([])
    expect(result.status).toBe('shared')
  })

  it('tells a closed sheet from a sent one when no contact was selected', async () => {
    mockedFire.mockResolvedValue({ status: 'dismissed' })

    const result = await shareLocation(input({ via: 'apps', recipients: [] }))

    expect(result.status).toBe('dismissed')
  })

  it('reports a closed share sheet as "not sent" when the user picked other apps', async () => {
    mockedFire.mockResolvedValue({ status: 'dismissed' })

    const result = await shareLocation(input({ via: 'apps' }))

    expect(result.outcomes[0]?.status).toBe('dismissed')
    expect(result.shared.os_share_sheet).toBe(0)
    expect(mockedWrite).not.toHaveBeenCalled()
  })

  it('sends the same text through the composer and the sheet', async () => {
    mockedSms.mockResolvedValue({ status: 'unavailable' })

    await shareLocation(input())

    expect(mockedFire.mock.calls[0]?.[0]).toBe(mockedSms.mock.calls[0]?.[1])
  })

  it('reports a closed composer as "not sent" and writes no record', async () => {
    mockedSms.mockResolvedValue({ status: 'dismissed' })

    const result = await shareLocation(input())

    expect(result.outcomes[0]).toEqual({
      contactId: 'c1',
      channel: 'os_share_sheet',
      status: 'dismissed',
    })
    expect(result.shared.os_share_sheet).toBe(0)
    expect(result.failed.os_share_sheet).toBe(0)
    expect(mockedFire).not.toHaveBeenCalled()
    expect(mockedWrite).not.toHaveBeenCalled()
  })

  it('reports it as failed when neither the composer nor the sheet can open', async () => {
    mockedSms.mockResolvedValue({ status: 'unavailable' })
    mockedFire.mockResolvedValue({ status: 'unavailable' })

    const result = await shareLocation(input())

    expect(result.outcomes[0]?.status).toBe('failed')
    expect(result.shared.os_share_sheet).toBe(0)
    expect(result.failed.os_share_sheet).toBe(1)
    expect(mockedWrite).not.toHaveBeenCalled()
  })

  it('writes one record per recipient, tied to the contact, with the OS channel', async () => {
    await shareLocation(input({ recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })] }))

    expect(mockedWrite).toHaveBeenCalledTimes(2)
    expect(mockedWrite).toHaveBeenCalledWith({
      recipientContactId: 'c1',
      position,
      channel: 'os_share_sheet',
    })
    expect(mockedWrite).toHaveBeenCalledWith({
      recipientContactId: 'c2',
      position,
      channel: 'os_share_sheet',
    })
  })

  it('never writes an in-app share: nothing delivers it to a recipient', async () => {
    await shareLocation(input({ recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })] }))

    for (const call of mockedWrite.mock.calls) {
      expect(call[0].channel).toBe('os_share_sheet')
    }
  })

  it('still reports the share as handed over when a record cannot be saved', async () => {
    mockedWrite.mockRejectedValue(new Error('network down'))

    const result = await shareLocation(input())

    expect(result.outcomes[0]?.status).toBe('shared')
    expect(result.shared.os_share_sheet).toBe(1)
  })

  it('de-duplicates a recipient that is reached twice', async () => {
    const result = await shareLocation(
      input({ recipients: [contact({ id: 'c1' }), contact({ id: 'c1' })] }),
    )

    expect(mockedSms.mock.calls[0]?.[0]).toHaveLength(1)
    expect(mockedWrite).toHaveBeenCalledTimes(1)
    expect(result.outcomes).toHaveLength(1)
  })

  it('opens nothing and writes nothing when there are no recipients', async () => {
    const result = await shareLocation(input({ recipients: [] }))

    expect(mockedSms).not.toHaveBeenCalled()
    expect(mockedFire).not.toHaveBeenCalled()
    expect(mockedWrite).not.toHaveBeenCalled()
    expect(result.outcomes).toEqual([])
    expect(result.shared).toEqual({ os_share_sheet: 0 })
    expect(result.status).toBe('nothing')
  })

  it('writes a null position for a share without a location', async () => {
    await shareLocation(input({ position: null }))

    expect(mockedWrite).toHaveBeenCalledWith({
      recipientContactId: 'c1',
      position: { lat: null, lng: null, accuracyM: null },
      channel: 'os_share_sheet',
    })
  })

  it('sends a message with no coordinate for a share without a location', async () => {
    await shareLocation(input({ position: null }))

    const message = mockedSms.mock.calls[0]?.[1] ?? ''
    expect(message).toContain(NOTE)
    expect(message).not.toContain('geo:')
    expect(message).not.toContain('maps.google.com')
  })

  it('records the intent once, for the whole fan-out', async () => {
    const startedAt = Date.now()
    await shareLocation(
      input({ recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })], startedAt }),
    )

    expect(mockedRecord).toHaveBeenCalledTimes(1)
    expect(mockedRecord.mock.calls[0]?.[0]).toMatchObject({
      startedAt,
      channel: 'os_share_sheet',
      recipientCount: 2,
    })
  })

  it('reports the elapsed time from the confirm tap', async () => {
    const result: ShareResult = await shareLocation(input({ startedAt: Date.now() - 250 }))

    expect(result.elapsedMs).toBeGreaterThanOrEqual(250)
  })
})

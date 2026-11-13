import type { EmergencyContact } from '@nagar-shield/shared';
import {
  resolveAppUserContactIds,
  writeLocationShare,
} from '@/shared/api/locationShares';
import { fireOsShare } from '@/shared/services/osShare';
import { recordShareIntent } from '@/shared/services/shareTelemetry';
import {
  selectExplicitRecipients,
  selectPrimaryRecipients,
  shareLocation,
  type ShareResult,
} from './shareLocation';

/**
 * The Location Sharing fan-out.
 *
 * The rules that matter:
 *
 *   * **One fix for the whole fan-out** — the same snapshot to every
 *     recipient.
 *   * **Routing is per recipient** — an app user gets a `location_shares`
 *     row; everyone else gets the OS share sheet, fired exactly once.
 *   * **Deselection wins** — the fan-out is a default selector, not an
 *     override of the user's explicit choice.
 *   * **No duplicates** — a contact reached twice receives one snapshot.
 *   * **Nothing is claimed** — a dismissed sheet is reported as "not sent",
 *     and no receipt is ever fabricated.
 */

jest.mock('@/shared/api/locationShares', () => ({
  resolveAppUserContactIds: jest.fn(),
  writeLocationShare: jest.fn(),
}));

jest.mock('@/shared/services/osShare', () => ({
  fireOsShare: jest.fn(),
}));

jest.mock('@/shared/services/shareTelemetry', () => ({
  recordShareIntent: jest.fn(),
}));

const mockedResolve = resolveAppUserContactIds as jest.MockedFunction<
  typeof resolveAppUserContactIds
>;
const mockedWrite = writeLocationShare as jest.MockedFunction<typeof writeLocationShare>;
const mockedFire = fireOsShare as jest.MockedFunction<typeof fireOsShare>;
const mockedRecord = recordShareIntent as jest.MockedFunction<typeof recordShareIntent>;

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
  };
}

/** The position of a normal share. */
const position = { lat: 23.7806, lng: 90.4066, accuracyM: 12 };

beforeEach(() => {
  jest.clearAllMocks();

  mockedResolve.mockResolvedValue([]);
  mockedFire.mockResolvedValue({ status: 'shared' });
  mockedRecord.mockResolvedValue({
    elapsedMs: 100,
    channel: 'app',
    recipientCount: 1,
  });
  mockedWrite.mockImplementation(async (input) => ({
    id: `row-${input.recipientContactId ?? 'os'}`,
    recipientContactId: input.recipientContactId,
    lat: input.position.lat,
    lng: input.position.lng,
    accuracyM: input.position.accuracyM,
    mode: 'snapshot' as const,
    shareChannel: input.channel,
    sharedAt: '2026-11-04T10:30:00Z',
  }));
});

describe('selectPrimaryRecipients', () => {
  it('selects the primary contacts only', () => {
    const contacts = [
      contact({ id: 'c1', isPrimary: true }),
      contact({ id: 'c2', isPrimary: false }),
      contact({ id: 'c3', isPrimary: true }),
    ];

    const selected = selectPrimaryRecipients(contacts);
    expect(selected.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('orders the selection by sort_order', () => {
    const contacts = [
      contact({ id: 'c1', isPrimary: true, sortOrder: 2 }),
      contact({ id: 'c2', isPrimary: true, sortOrder: 0 }),
    ];

    const selected = selectPrimaryRecipients(contacts);
    expect(selected.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('drops a primary the user has deselected — deselection wins', () => {
    const contacts = [
      contact({ id: 'c1', isPrimary: true }),
      contact({ id: 'c2', isPrimary: true }),
    ];

    const selected = selectPrimaryRecipients(contacts, ['c1']);
    expect(selected.map((c) => c.id)).toEqual(['c2']);
  });

  it('returns nothing when there are no primaries', () => {
    const contacts = [contact({ id: 'c1', isPrimary: false })];
    expect(selectPrimaryRecipients(contacts)).toEqual([]);
  });
});

describe('selectExplicitRecipients', () => {
  it('selects exactly the checked contacts', () => {
    const contacts = [
      contact({ id: 'c1' }),
      contact({ id: 'c2' }),
      contact({ id: 'c3' }),
    ];

    const selected = selectExplicitRecipients(contacts, ['c1', 'c3']);
    expect(selected.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('ignores an id that is not in the contact list', () => {
    const contacts = [contact({ id: 'c1' })];
    const selected = selectExplicitRecipients(contacts, ['c1', 'not-a-contact']);
    expect(selected.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('shareLocation', () => {
  it('writes one row per app-user recipient', async () => {
    mockedResolve.mockResolvedValue(['c1', 'c2']);

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedWrite).toHaveBeenCalledTimes(2);
    expect(mockedFire).not.toHaveBeenCalled();
    expect(result.shared.app).toBe(2);
    expect(result.outcomes).toEqual([
      { contactId: 'c1', channel: 'app', status: 'shared' },
      { contactId: 'c2', channel: 'app', status: 'shared' },
    ]);
  });

  it('fires the OS sheet once for a non-app recipient', async () => {
    mockedResolve.mockResolvedValue([]);

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedFire).toHaveBeenCalledTimes(1);
    expect(result.shared.os_share_sheet).toBe(1);
    expect(result.outcomes[0]).toEqual({
      contactId: 'c1',
      channel: 'os_share_sheet',
      status: 'shared',
    });
  });

  it('gives an app-user recipient exactly one row and no OS share', async () => {
    mockedResolve.mockResolvedValue(['c1']);

    await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedWrite).toHaveBeenCalledTimes(1);
    expect(mockedFire).not.toHaveBeenCalled();
  });

  it('writes the OS audit row with no recipient contact id', async () => {
    mockedResolve.mockResolvedValue([]);

    await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedWrite).toHaveBeenCalledWith({
      recipientContactId: null,
      position,
      channel: 'os_share_sheet',
    });
  });

  it('sends the same snapshot to every recipient — one fix for the whole fan-out', async () => {
    mockedResolve.mockResolvedValue([]);

    await shareLocation({
      recipients: [contact({ id: 'c1' }), contact({ id: 'c2' }), contact({ id: 'c3' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedFire).toHaveBeenCalledTimes(3);

    const messages = mockedFire.mock.calls.map((call) => call[0]);
    expect(new Set(messages).size).toBe(1);
  });

  it('de-duplicates a recipient that is reached twice', async () => {
    mockedResolve.mockResolvedValue(['c1']);

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' }), contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedWrite).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toHaveLength(1);
  });

  it('writes nothing and fires no sheet when there are no recipients', async () => {
    const result = await shareLocation({
      recipients: [],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedWrite).not.toHaveBeenCalled();
    expect(mockedFire).not.toHaveBeenCalled();
    expect(result.outcomes).toEqual([]);
    expect(result.shared).toEqual({ app: 0, os_share_sheet: 0 });
  });

  it('reports a dismissed sheet as "not sent" and never as shared', async () => {
    mockedResolve.mockResolvedValue([]);
    mockedFire.mockResolvedValue({ status: 'dismissed' });

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(result.outcomes[0]).toEqual({
      contactId: 'c1',
      channel: 'os_share_sheet',
      status: 'dismissed',
    });
    expect(result.shared.os_share_sheet).toBe(0);
  });

  it('keeps processing the remaining recipients after a dismissal', async () => {
    mockedResolve.mockResolvedValue([]);
    mockedFire
      .mockResolvedValueOnce({ status: 'dismissed' })
      .mockResolvedValueOnce({ status: 'shared' });

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedFire).toHaveBeenCalledTimes(2);
    expect(result.outcomes[1]?.status).toBe('shared');
  });

  it('reports an OS failure as failed, not as shared', async () => {
    mockedResolve.mockResolvedValue([]);
    mockedFire.mockResolvedValue({ status: 'unavailable' });

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(result.outcomes[0]?.status).toBe('failed');
    expect(result.failed.os_share_sheet).toBe(1);
  });

  it('reports a failed in-app write as failed and fabricates no receipt', async () => {
    mockedResolve.mockResolvedValue(['c1']);
    mockedWrite.mockRejectedValue(new Error('network down'));

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(result.outcomes[0]).toEqual({ contactId: 'c1', channel: 'app', status: 'failed' });
    expect(result.shared.app).toBe(0);
    expect(result.failed.app).toBe(1);
  });

  it('keeps the other recipients going when one write fails', async () => {
    mockedResolve.mockResolvedValue(['c1', 'c2']);
    mockedWrite
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        id: 'row-c2',
        recipientContactId: 'c2',
        lat: 23.7806,
        lng: 90.4066,
        accuracyM: 12,
        mode: 'snapshot' as const,
        shareChannel: 'app' as const,
        sharedAt: '2026-11-04T10:30:00Z',
      });

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(result.outcomes[0]?.status).toBe('failed');
    expect(result.outcomes[1]?.status).toBe('shared');
  });

  it('writes a null position for a share without a location', async () => {
    mockedResolve.mockResolvedValue(['c1']);

    await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position: null,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedWrite).toHaveBeenCalledWith({
      recipientContactId: 'c1',
      position: { lat: null, lng: null, accuracyM: null },
      channel: 'app',
    });
  });

  it('sends a payload with no coordinate for a share without a location', async () => {
    mockedResolve.mockResolvedValue([]);

    await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position: null,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    const message = mockedFire.mock.calls[0]?.[0] ?? '';
    expect(message).toContain('The location is unavailable.');
    expect(message).not.toContain('geo:');
    expect(message).not.toContain('maps.google.com');
  });

  it('falls back to the OS path when the app-user lookup fails', async () => {
    // A failed lookup answers "no confirmed app users" — the safe
    // direction, because the OS path works with no network and claims
    // nothing.
    mockedResolve.mockResolvedValue([]);

    const result = await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now(),
    });

    expect(mockedFire).toHaveBeenCalledTimes(1);
    expect(result.shared.os_share_sheet).toBe(1);
  });

  it('records the intent once, for the whole fan-out', async () => {
    mockedResolve.mockResolvedValue(['c1', 'c2']);

    const startedAt = Date.now();
    await shareLocation({
      recipients: [contact({ id: 'c1' }), contact({ id: 'c2' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt,
    });

    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord.mock.calls[0]?.[0]).toMatchObject({
      startedAt,
      recipientCount: 2,
    });
  });

  it('reports the elapsed time from the confirm tap', async () => {
    mockedResolve.mockResolvedValue(['c1']);

    const result: ShareResult = await shareLocation({
      recipients: [contact({ id: 'c1' })],
      position,
      withoutLocationNote: 'The location is unavailable.',
      startedAt: Date.now() - 250,
    });

    expect(result.elapsedMs).toBeGreaterThanOrEqual(250);
  });
});

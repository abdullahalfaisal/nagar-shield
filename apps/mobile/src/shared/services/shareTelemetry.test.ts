import * as expoFileSystem from 'expo-file-system'
import {
  TELEMETRY_MAX_EVENTS,
  bufferShareIntent,
  medianElapsedMs,
  readTelemetryBuffer,
  recordShareIntent,
  takeBufferedEvents,
  type ShareIntentEvent,
} from './shareTelemetry'

/**
 * The `location_share_intent_ms` telemetry.
 *
 * The metric measures **our** work and nothing else: the elapsed
 * milliseconds from the user's confirm tap to the share intent firing or the
 * audit row being written. Carrier delivery and recipient open time are
 * outside our control, are never measured, and are never claimed.
 *
 * The payload carries **no PII** — three fields, and a fourth would be a new
 * PII risk. No coordinate, no phone number, no contact name, no recipient id.
 */

jest.mock('expo-file-system', () => {
  // The file contents live in a store the mock owns. `mockFiles` is
  // prefixed with `mock` so Jest's hoisting guard allows the factory to
  // reach it.
  const mockFiles = new Map<string, string>()

  // Plain functions rather than classes: Jest's hoisting guard rejects
  // **any** identifier that appears in a class body inside the factory,
  // including a constructor parameter name.
  const mockDirectory = {
    files: mockFiles,
    exists: true,
    create: () => {
      // The mock directory always exists.
    },
  }

  const mockFile = (name: string) => ({
    get exists() {
      return mockFiles.has(name)
    },
    textSync: () => mockFiles.get(name) ?? '',
    write: (contents: string) => {
      mockFiles.set(name, contents)
    },
  })

  return {
    Paths: { cache: '/cache' },
    Directory: jest.fn().mockImplementation(() => mockDirectory),
    File: jest.fn().mockImplementation((_directory: unknown, name: string) => mockFile(name)),
    __mockFiles: mockFiles,
  }
})

/** The mocked file store, so a test can seed a corrupt buffer. */
function mockFiles(): Map<string, string> {
  return (expoFileSystem as unknown as { __mockFiles: Map<string, string> }).__mockFiles
}

beforeEach(() => {
  jest.clearAllMocks()
  // The mocked directory persists between calls, so its files are cleared
  // between tests — each test starts from an empty buffer.
  mockFiles().clear()
})

describe('the telemetry buffer', () => {
  it('starts empty when the file does not exist', async () => {
    const events = await readTelemetryBuffer()
    expect(events).toEqual([])
  })

  it('buffers an event', async () => {
    await bufferShareIntent({ elapsedMs: 120, channel: 'app', recipientCount: 3 })

    const events = await readTelemetryBuffer()
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ elapsedMs: 120, channel: 'app', recipientCount: 3 })
  })

  it('evicts the oldest event when the buffer is full', async () => {
    for (let index = 0; index < TELEMETRY_MAX_EVENTS + 5; index += 1) {
      await bufferShareIntent({ elapsedMs: index, channel: 'app', recipientCount: 1 })
    }

    const events = await readTelemetryBuffer()
    expect(events).toHaveLength(TELEMETRY_MAX_EVENTS)
    // The newest are kept; the oldest were evicted.
    expect(events[events.length - 1]?.elapsedMs).toBe(TELEMETRY_MAX_EVENTS + 4)
  })

  it('empties the buffer when the events are taken', async () => {
    await bufferShareIntent({ elapsedMs: 120, channel: 'app', recipientCount: 3 })

    const taken = await takeBufferedEvents()
    expect(taken).toHaveLength(1)

    // The events are removed **before** they are flushed, so a failed flush
    // loses them rather than re-sending them forever.
    const remaining = await readTelemetryBuffer()
    expect(remaining).toEqual([])
  })

  it('reads a corrupt buffer as empty rather than throwing', async () => {
    mockFiles().set('share-telemetry.json', '{not json')

    const events = await readTelemetryBuffer()
    expect(events).toEqual([])
  })
})

describe('recordShareIntent', () => {
  it('measures the elapsed milliseconds from the startedAt tap', async () => {
    const event = await recordShareIntent({
      startedAt: 1_000,
      finishedAt: 1_350,
      channel: 'app',
      recipientCount: 2,
    })

    expect(event.elapsedMs).toBe(350)
  })

  it('never reports a negative elapsed time', async () => {
    const event = await recordShareIntent({
      startedAt: 2_000,
      finishedAt: 1_000,
      channel: 'app',
      recipientCount: 1,
    })

    expect(event.elapsedMs).toBe(0)
  })

  it('carries no PII — exactly three fields', async () => {
    const event = await recordShareIntent({
      startedAt: 1_000,
      finishedAt: 1_100,
      channel: 'app',
      recipientCount: 1,
    })

    expect(Object.keys(event).sort()).toEqual(['channel', 'elapsedMs', 'recipientCount'])
    const serialised = JSON.stringify(event)
    expect(serialised).not.toContain('lat')
    expect(serialised).not.toContain('lng')
    expect(serialised).not.toContain('phone')
  })

  it('buffers the event so the share does not wait on a flush', async () => {
    await recordShareIntent({
      startedAt: 1_000,
      finishedAt: 1_100,
      channel: 'os_share_sheet',
      recipientCount: 1,
    })

    const events = await readTelemetryBuffer()
    expect(events).toHaveLength(1)
    expect(events[0]?.channel).toBe('os_share_sheet')
  })
})

describe('medianElapsedMs', () => {
  const event = (elapsedMs: number): ShareIntentEvent => ({
    elapsedMs,
    channel: 'app',
    recipientCount: 1,
  })

  it('returns null for an empty set', () => {
    expect(medianElapsedMs([])).toBeNull()
  })

  it('returns the middle value of an odd count', () => {
    expect(medianElapsedMs([event(10), event(30), event(20)])).toBe(20)
  })

  it('averages the two middle values of an even count', () => {
    expect(medianElapsedMs([event(10), event(20), event(30), event(40)])).toBe(25)
  })

  it('does not discard a slow run to flatter the number', () => {
    const median = medianElapsedMs([event(10), event(10), event(10), event(99_000)])
    expect(median).toBe(10)
  })
})

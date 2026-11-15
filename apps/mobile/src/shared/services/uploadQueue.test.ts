/**
 * The offline queue's contract.
 *
 * The story names four things that Jest must cover, and each of them is a
 * place where getting it wrong loses a citizen's evidence or duplicates a
 * report:
 *
 *   1. the **exponential-backoff schedule** — the delay grows with each
 *      failure;
 *   2. the **3-attempt cut-off** — after the third failure the item is kept
 *      on the device rather than retried forever;
 *   3. the **20-item bound** — the oldest item is evicted and the eviction is
 *      reported, never silent;
 *   4. the **`client_request_id` idempotency rule** — a queued item reuses the
 *      key it was created with, so a retry whose response was lost in transit
 *      returns the original `report_id` instead of creating a second report.
 *
 * `expo-file-system` is replaced with an in-memory implementation so the real
 * queue code — the read, the write, the truncation — is exercised rather than
 * mocked away. The filesystem is the thing under test's boundary, not the
 * thing under test.
 */

// --- The in-memory filesystem ------------------------------------------------

/**
 * The store the mocked `expo-file-system` writes into.
 *
 * `jest.mock` is hoisted above the imports, so its factory cannot close over
 * a variable declared here — the factory runs before this module body. The
 * store is therefore reached through `globalThis`, which the factory can
 * touch without capturing a binding.
 */
interface MockFs {
  files: Map<string, string>
  directories: Set<string>
}

const fsStore = (): MockFs => {
  const g = globalThis as unknown as { __mockFs?: MockFs }
  if (!g.__mockFs) {
    g.__mockFs = { files: new Map(), directories: new Set() }
  }
  return g.__mockFs
}

jest.mock('expo-file-system', () => {
  const store = (): { files: Map<string, string>; directories: Set<string> } => {
    const g = globalThis as unknown as {
      __mockFs?: { files: Map<string, string>; directories: Set<string> }
    }
    if (!g.__mockFs) {
      g.__mockFs = { files: new Map(), directories: new Set() }
    }
    return g.__mockFs
  }

  /**
   * Joins path parts the way `Paths.join` does — a `File` or `Directory`
   * argument contributes its `uri`, a string contributes itself.
   */
  const join = (parts: unknown[]): string =>
    parts
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'uri' in part) {
          return String((part as { uri: string }).uri)
        }
        return String(part)
      })
      .join('/')

  class MockFile {
    readonly uri: string
    exists: boolean

    constructor(...parts: unknown[]) {
      this.uri = join(parts)
      this.exists = store().files.has(this.uri)
    }

    async text(): Promise<string> {
      return this.textSync()
    }

    textSync(): string {
      const value = store().files.get(this.uri)
      if (value === undefined) throw new Error(`ENOENT: ${this.uri}`)
      return value
    }

    move(destination: MockFile): void {
      const value = store().files.get(this.uri)
      if (value === undefined) throw new Error(`ENOENT: ${this.uri}`)
      store().files.delete(this.uri)
      store().files.set(destination.uri, value)
      this.exists = false
    }

    write(contents: string): void {
      store().files.set(this.uri, contents)
      this.exists = true
    }

    delete(): void {
      store().files.delete(this.uri)
      this.exists = false
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const value = store().files.get(this.uri) ?? ''
      return new TextEncoder().encode(value).buffer as ArrayBuffer
    }
  }

  class MockDirectory {
    readonly uri: string
    exists: boolean

    constructor(...parts: unknown[]) {
      this.uri = join(parts)
      this.exists = store().directories.has(this.uri)
    }

    create(): void {
      store().directories.add(this.uri)
      this.exists = true
    }
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { cache: '/cache', document: '/document' },
  }
})

// --- The module under test ----------------------------------------------------

import {
  BACKOFF_CEILING_MS,
  QUEUE_MAX_ATTEMPTS,
  QUEUE_MAX_ITEMS,
  backoffDelayMs,
  SAVED_RETRY_MS,
  claimUnowned,
  clearQueue,
  dueItems,
  ownQueueCount,
  enqueueUpload,
  enqueueUploadBounded,
  markAttemptFailed,
  queueSize,
  readQueue,
  removeFromQueue,
  savedOnDeviceItems,
  writeQueue,
  type QueuedUpload,
} from './uploadQueue'

/** A minimal prepared media, for the enqueue helpers. */
const media = {
  uri: '/cache/draft.jpg',
  mediaType: 'photo' as const,
  byteSize: 1024,
  durationSeconds: null,
  width: 800,
  height: 600,
  contentType: 'image/jpeg',
  extension: 'jpg',
}

/** The enqueue input, with the fields the tests vary. */
function input(overrides: Partial<Parameters<typeof enqueueUpload>[0]> = {}) {
  return {
    clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    media,
    lat: 23.7461,
    lng: 90.3774,
    capturedAt: '2026-11-13T10:00:00.000Z',
    description: 'a report',
    publicVisibility: 'anonymous' as const,
    ...overrides,
  }
}

/** A queue item, for the `dueItems` tests. */
function item(overrides: Partial<QueuedUpload> = {}): QueuedUpload {
  return {
    clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    mediaUri: '/cache/draft.jpg',
    mediaType: 'photo',
    byteSize: 1024,
    durationSeconds: null,
    width: 800,
    height: 600,
    contentType: 'image/jpeg',
    extension: 'jpg',
    lat: 23.7461,
    lng: 90.3774,
    capturedAt: '2026-11-13T10:00:00.000Z',
    description: 'a report',
    publicVisibility: 'anonymous',
    attempts: 0,
    nextAttemptAt: 0,
    savedOnDevice: false,
    ...overrides,
  }
}

const QUEUE_PATH = '/document/nagar-shield-queue/upload-queue.json'
const LEGACY_QUEUE_PATH = '/cache/nagar-shield-media/upload-queue.json'

beforeEach(() => {
  // The maps are **cleared in place** rather than replaced — the mocked
  // module holds a reference to the store object and reads its maps live, so
  // replacing the maps here would leave the module looking at the old ones.
  const store = fsStore()
  store.files.clear()
  store.directories.clear()
})

// --- The backoff schedule -----------------------------------------------------

describe('backoffDelayMs', () => {
  it('grows with the attempt count — the delay is exponential', () => {
    const first = backoffDelayMs(1)
    const second = backoffDelayMs(2)
    const third = backoffDelayMs(3)

    expect(second).toBeGreaterThan(first)
    expect(third).toBeGreaterThan(second)
  })

  it("uses the story's exact schedule: 30 s, 2 min, 8 min", () => {
    expect(backoffDelayMs(1)).toBe(30_000)
    expect(backoffDelayMs(2)).toBe(120_000)
    expect(backoffDelayMs(3)).toBe(480_000)
  })

  it('treats a zero or negative attempt count as the first attempt', () => {
    expect(backoffDelayMs(0)).toBe(backoffDelayMs(1))
    expect(backoffDelayMs(-5)).toBe(backoffDelayMs(1))
  })
})

// --- The attempt counter ------------------------------------------------------

describe('markAttemptFailed', () => {
  it('increments the attempt count', async () => {
    await enqueueUpload(input())

    const updated = await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(updated?.attempts).toBe(1)
  })

  it('writes the next permitted attempt time from the backoff schedule', async () => {
    await enqueueUpload(input())

    const now = 1_000_000
    const updated = await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now)

    expect(updated?.nextAttemptAt).toBe(now + backoffDelayMs(1))
  })

  it('keeps the item after the third failure rather than retrying forever', async () => {
    await enqueueUpload(input())

    let updated = await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    updated = await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    updated = await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(updated?.attempts).toBe(QUEUE_MAX_ATTEMPTS)
    expect(updated?.savedOnDevice).toBe(true)
  })

  it('schedules the long retry once the item is kept on the device', async () => {
    await enqueueUpload(input())

    const now = 2_000_000
    await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now)
    await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now)

    const third = await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now)

    // Kept is not given up on: the banner says it is sent when the network
    // returns, so it is tried again — slowly, since the quick retries failed.
    expect(third?.savedOnDevice).toBe(true)
    expect(third?.nextAttemptAt).toBe(now + SAVED_RETRY_MS)
  })

  it('returns null for an item that is not in the queue', async () => {
    await expect(markAttemptFailed('nobody')).resolves.toBeNull()
  })
})

// --- The due schedule ---------------------------------------------------------

describe('dueItems', () => {
  it('offers an item whose next attempt time has arrived', () => {
    const due = dueItems([item({ nextAttemptAt: 1_000 })], 1_000)

    expect(due).toHaveLength(1)
  })

  it('holds an item whose backoff has not elapsed', () => {
    const due = dueItems([item({ nextAttemptAt: 10_000 })], 1_000)

    expect(due).toHaveLength(0)
  })

  it('offers an item kept on the device again once its long wait is over', () => {
    const kept = item({ savedOnDevice: true, nextAttemptAt: 10_000 + SAVED_RETRY_MS })

    expect(dueItems([kept], 10_000)).toHaveLength(0)
    expect(dueItems([kept], 10_000 + SAVED_RETRY_MS)).toHaveLength(1)
  })

  it('releases a kept item whose timestamp is unreachable, as it does any other', () => {
    const kept = item({
      savedOnDevice: true,
      nextAttemptAt: 1_000 + SAVED_RETRY_MS + BACKOFF_CEILING_MS + 1_000,
    })

    expect(dueItems([kept], 1_000)).toHaveLength(1)
  })

  it('releases an item whose timestamp is unreachable — a wrong clock cannot strand a report', () => {
    // The clock is days ahead, so the stored timestamp is far in the future.
    const due = dueItems([item({ nextAttemptAt: 1_000 + BACKOFF_CEILING_MS + 1_000 })], 1_000)

    expect(due).toHaveLength(1)
  })

  it('still honours a legitimate pending backoff', () => {
    // 5 minutes is inside the ceiling — the item waits.
    const due = dueItems([item({ nextAttemptAt: 1_000 + 5 * 60_000 })], 1_000)

    expect(due).toHaveLength(0)
  })
})

// --- The 20-item bound --------------------------------------------------------

describe('the queue bound', () => {
  it('never exceeds 20 items', async () => {
    for (let i = 0; i < 25; i += 1) {
      await enqueueUploadBounded(
        input({ clientRequestId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }),
      )
    }

    const queue = await readQueue()

    expect(queue).toHaveLength(QUEUE_MAX_ITEMS)
  })

  it('drops the OLDEST item when the 21st arrives', async () => {
    // Fill the queue to its bound. The oldest is the first one enqueued.
    for (let i = 1; i <= QUEUE_MAX_ITEMS; i += 1) {
      await enqueueUploadBounded(
        input({ clientRequestId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }),
      )
    }

    const { dropped } = await enqueueUploadBounded(
      input({ clientRequestId: '00000000-0000-4000-8000-999999999999' }),
    )

    expect(dropped?.clientRequestId).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('reports the drop rather than discarding the evidence silently', async () => {
    for (let i = 0; i < QUEUE_MAX_ITEMS; i += 1) {
      await enqueueUploadBounded(
        input({ clientRequestId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }),
      )
    }

    const { dropped } = await enqueueUploadBounded(
      input({ clientRequestId: '00000000-0000-4000-8000-999999999999' }),
    )

    expect(dropped).not.toBeNull()
  })

  it('reports no drop while the queue is under the bound', async () => {
    const { dropped } = await enqueueUploadBounded(input())

    expect(dropped).toBeNull()
  })
})

// --- The idempotency rule -----------------------------------------------------

describe('the client_request_id idempotency rule', () => {
  it('keeps the key the failed attempt used', async () => {
    const item = await enqueueUpload(input())

    expect(item.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('does not mint a fresh key for the queued item', async () => {
    const { item } = await enqueueUploadBounded(input())

    expect(item.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('survives the round trip through the queue file unchanged', async () => {
    await enqueueUpload(input())

    const queue = await readQueue()

    expect(queue[0]?.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('keeps the key across a failed attempt and its reschedule', async () => {
    await enqueueUpload(input())

    await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    const queue = await readQueue()

    expect(queue[0]?.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })
})

// --- The queue lifecycle ------------------------------------------------------

describe('the queue lifecycle', () => {
  it('counts only the items that are still waiting', async () => {
    await enqueueUpload(input())

    expect(await queueSize()).toBe(1)
  })

  it('does not count a retained item as waiting', async () => {
    await enqueueUpload(input())
    await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await markAttemptFailed('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(await queueSize()).toBe(0)
    expect(await savedOnDeviceItems()).toHaveLength(1)
  })

  it('removes an item that has landed', async () => {
    await enqueueUpload(input())

    await removeFromQueue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(await readQueue()).toHaveLength(0)
  })

  it('discards the whole queue on sign-out', async () => {
    await enqueueUpload(input())
    await enqueueUpload(input({ clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }))

    const discarded = await clearQueue()

    expect(discarded).toBe(2)
    expect(await readQueue()).toHaveLength(0)
  })

  it('reports nothing discarded when the queue is empty', async () => {
    await expect(clearQueue()).resolves.toBe(0)
  })
})

// --- The storage contract -----------------------------------------------------

describe('who a queued report belongs to', () => {
  const ADA = 'aaaaaaaa-0000-4000-8000-00000000000a'
  const BOB = 'bbbbbbbb-0000-4000-8000-00000000000b'

  it('records the author when the report is queued', async () => {
    const queued = await enqueueUpload(input({ authorId: ADA }))

    expect(queued.authorId).toBe(ADA)
    expect((await readQueue())[0]?.authorId).toBe(ADA)
  })

  it("counts only the signed-in user's reports as waiting or kept", async () => {
    await enqueueUpload(input({ authorId: ADA }))
    await enqueueUpload(
      input({ clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', authorId: BOB }),
    )

    expect(await queueSize(ADA)).toBe(1)
    expect(await queueSize(BOB)).toBe(1)
    expect(await ownQueueCount(ADA)).toBe(1)

    for (let i = 0; i < 3; i += 1) {
      await markAttemptFailed('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    }
    expect(await savedOnDeviceItems(ADA)).toHaveLength(0)
    expect(await savedOnDeviceItems(BOB)).toHaveLength(1)
  })

  it("discards one user's reports without touching another's", async () => {
    await enqueueUpload(input({ authorId: ADA }))
    await enqueueUpload(
      input({ clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', authorId: BOB }),
    )

    expect(await clearQueue(ADA)).toBe(1)

    const left = await readQueue()
    expect(left).toHaveLength(1)
    expect(left[0]?.authorId).toBe(BOB)
  })

  it('hands reports with no author to the user who claims them, and only those', async () => {
    fsStore().files.set(
      QUEUE_PATH,
      JSON.stringify([item({ authorId: undefined }), item({ authorId: BOB })]),
    )

    expect(await claimUnowned(ADA)).toBe(1)

    const queue = await readQueue()
    expect(queue.map((entry) => entry.authorId)).toEqual([ADA, BOB])
  })

  it('does not lose a report when two changes to the queue arrive together', async () => {
    // Each change is a read then a write. Unserialised, both read the same
    // queue and the later write dropped the other's report.
    await Promise.all([
      enqueueUpload(input({ clientRequestId: '00000000-0000-4000-8000-000000000001' })),
      enqueueUpload(input({ clientRequestId: '00000000-0000-4000-8000-000000000002' })),
      enqueueUploadBounded(input({ clientRequestId: '00000000-0000-4000-8000-000000000003' })),
    ])

    expect(await readQueue()).toHaveLength(3)
  })
})

describe('the storage contract', () => {
  it('keeps the queue in the app sandbox, not in AsyncStorage', async () => {
    await enqueueUpload(input())

    // The queue file lives under the document directory in the app sandbox.
    expect(fsStore().files.has(QUEUE_PATH)).toBe(true)
  })

  it('keeps the queue out of the cache, which the OS may empty', async () => {
    await enqueueUpload(input())

    expect(fsStore().files.has(LEGACY_QUEUE_PATH)).toBe(false)
  })

  it('moves a queued draft out of the cache, so the file survives with its entry', async () => {
    fsStore().files.set('/cache/nagar-shield-media/photo-1.jpg', 'bytes')

    const queued = await enqueueUpload(
      input({ media: { ...media, uri: '/cache/nagar-shield-media/photo-1.jpg' } }),
    )

    expect(queued.mediaUri).toBe('/document/nagar-shield-queue/photo-1.jpg')
    expect(fsStore().files.get(queued.mediaUri)).toBe('bytes')
    expect(fsStore().files.has('/cache/nagar-shield-media/photo-1.jpg')).toBe(false)
  })

  it('carries a queue an earlier build left in the cache over, once', async () => {
    fsStore().files.set(LEGACY_QUEUE_PATH, JSON.stringify([item()]))

    expect(await readQueue()).toHaveLength(1)
    expect(fsStore().files.has(QUEUE_PATH)).toBe(true)
    expect(fsStore().files.has(LEGACY_QUEUE_PATH)).toBe(false)
  })

  it('never writes the session token into the queue', async () => {
    await enqueueUpload(input())

    const raw = fsStore().files.get(QUEUE_PATH) ?? ''

    expect(raw).not.toContain('access_token')
    expect(raw).not.toContain('refresh_token')
    expect(raw).not.toContain('token')
  })

  it('reads a missing file as an empty queue', async () => {
    await expect(readQueue()).resolves.toEqual([])
  })

  it('reads a corrupt file as an empty queue rather than crashing', async () => {
    fsStore().files.set(QUEUE_PATH, '{not json')

    await expect(readQueue()).resolves.toEqual([])
  })

  it('drops an entry that does not have the required shape', async () => {
    fsStore().files.set(QUEUE_PATH, JSON.stringify([{ nonsense: true }, item()]))

    const queue = await readQueue()

    expect(queue).toHaveLength(1)
  })

  it('truncates on write, so the bound holds even if a caller writes directly', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      item({ clientRequestId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }),
    )

    await writeQueue(many)

    expect(await readQueue()).toHaveLength(QUEUE_MAX_ITEMS)
  })
})

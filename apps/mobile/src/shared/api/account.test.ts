import { AppError } from '@nagar-shield/shared'
import { restoreAccount, softDeleteAccount } from './account'

/**
 * The account lifecycle's client contract.
 *
 * Two failure modes have to reach the UI as **different** codes, because the
 * recovery screen treats them differently:
 *
 *   * `CONFLICT` — the account is not deleted, so there is nothing to
 *     restore. The user landed on the screen by mistake.
 *   * `VALIDATION_FAILED` — the account **was** deleted, but the 30-day
 *     window has closed. The account is past its grace period and the only
 *     remaining path is the purge. Telling the user "nothing to restore"
 *     here would be a lie: something was deleted, and the window they were
 *     promised has run out.
 *
 * The database now enforces the window itself (migration 035), so the
 * `VALIDATION_FAILED` case is a real server answer rather than a client
 * guess.
 */

jest.mock('@/shared/api/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}))

import { supabase } from '@/shared/api/supabase'

const mockedSupabase = supabase as unknown as { rpc: jest.Mock }

function stubRpc(data: unknown, error: unknown = null) {
  mockedSupabase.rpc.mockResolvedValue({ data, error })
}

describe('softDeleteAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns the deletion moment and the last recoverable moment', async () => {
    stubRpc({
      deleted_at: '2026-11-14T00:00:00.000Z',
      recoverable_until: '2026-12-14T00:00:00.000Z',
    })

    const result = await softDeleteAccount()

    expect(result.deletedAt).toBe('2026-11-14T00:00:00.000Z')
    expect(result.recoverableUntil).toBe('2026-12-14T00:00:00.000Z')
  })

  it('derives the recoverable moment from the deletion moment when the server omits it', async () => {
    stubRpc({ deleted_at: '2026-11-14T00:00:00.000Z' })

    const result = await softDeleteAccount()

    expect(result.recoverableUntil).toBe('2026-12-14T00:00:00.000Z')
  })

  it('throws INTERNAL when the server returns no deletion moment', async () => {
    stubRpc({})

    await expect(softDeleteAccount()).rejects.toThrow(AppError)
  })
})

describe('restoreAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  it('resolves when the restore succeeds', async () => {
    stubRpc({ deleted_at: null })

    await expect(restoreAccount()).resolves.toBeUndefined()
  })

  it('maps "there is nothing to restore" to CONFLICT', async () => {
    // The RPC raises CONFLICT (23505) when the account is not deleted.
    stubRpc(null, { code: '23505', message: 'CONFLICT' })

    await expect(restoreAccount()).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('maps "the 30-day window has closed" to VALIDATION_FAILED', async () => {
    // The RPC raises VALIDATION_FAILED (22023) when the window has closed.
    stubRpc(null, { code: '22023', message: 'VALIDATION_FAILED' })

    await expect(restoreAccount()).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('does not report a closed window as a conflict', async () => {
    // The two are different facts. A user whose window closed must not be
    // told there is nothing to restore.
    stubRpc(null, { code: '22023', message: 'VALIDATION_FAILED' })

    await expect(restoreAccount()).rejects.not.toMatchObject({ code: 'CONFLICT' })
  })
})

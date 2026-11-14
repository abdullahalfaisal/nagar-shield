import { flagReport } from '@/shared/api/flags'

/**
 * The flag write path.
 *
 * `006-alerts / 005-author-auto-hide` (FR-ALERTS-7 / FR-ALERTS-11).
 *
 * The rule this file protects: the client **never counts flags itself**. It
 * maps the server's outcome to a stable code and shows it. The two author
 * counts are kept apart because they mean different things — the number of
 * flags, and the number of **distinct flagged reports**, which is the one that
 * decides the hide.
 */

const mockRpc = jest.fn()

jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}))

const REPORT_ID = '55555555-5555-5555-5555-5555555555a1'

beforeEach(() => {
  mockRpc.mockReset()
})

describe('flagging a public alert', () => {
  it('asks for the report to be flagged, with its reason', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'ok' }, error: null })

    await flagReport(REPORT_ID, 'misinformation')

    expect(mockRpc).toHaveBeenCalledWith('flag_report', {
      p_report_id: REPORT_ID,
      p_reason: 'misinformation',
    })
  })

  it('carries the 3-flag hide state', async () => {
    mockRpc.mockResolvedValue({
      data: { status: 'ok', flag_count: 3, report_hidden: true },
      error: null,
    })

    const outcome = await flagReport(REPORT_ID, 'misinformation')

    expect(outcome.status).toBe('ok')
    expect(outcome).toMatchObject({ reportHidden: true, flagCount: 3 })
  })

  it('carries the author-hide state, so the client can invalidate the feed', async () => {
    mockRpc.mockResolvedValue({
      data: { status: 'ok', report_hidden: false, author_hidden: true },
      error: null,
    })

    const outcome = await flagReport(REPORT_ID, 'misinformation')

    expect(outcome).toMatchObject({ authorHidden: true })
  })

  it('keeps the flag count and the distinct-report count apart', async () => {
    // Five flags on ONE report is one flagged report. The two numbers must not
    // be collapsed into one — the hide is decided by the second.
    mockRpc.mockResolvedValue({
      data: {
        status: 'ok',
        author_flags_24h: 5,
        author_flagged_reports_24h: 1,
      },
      error: null,
    })

    const outcome = await flagReport(REPORT_ID, 'misinformation')

    expect(outcome).toMatchObject({ authorFlags24h: 5, authorFlaggedReports24h: 1 })
  })

  it('treats a duplicate flag as an outcome, not an error', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'duplicate' }, error: null })

    await expect(flagReport(REPORT_ID, 'misinformation')).resolves.toEqual({
      status: 'duplicate',
    })
  })

  it("treats the author's own report as an outcome, not an error", async () => {
    mockRpc.mockResolvedValue({ data: { status: 'own_report' }, error: null })

    await expect(flagReport(REPORT_ID, 'misinformation')).resolves.toEqual({
      status: 'own_report',
    })
  })

  it('carries the rate limit with its retry hint', async () => {
    mockRpc.mockResolvedValue({
      data: { status: 'rate_limited', retry_after_sec: 1800 },
      error: null,
    })

    const outcome = await flagReport(REPORT_ID, 'misinformation')

    expect(outcome).toEqual({ status: 'rate_limited', retryAfterSec: 1800 })
  })

  it('defaults the rate-limit retry hint to an hour', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'rate_limited' }, error: null })

    const outcome = await flagReport(REPORT_ID, 'misinformation')

    expect(outcome).toEqual({ status: 'rate_limited', retryAfterSec: 3600 })
  })

  it('throws on an unknown status rather than pretending it succeeded', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'something_new' }, error: null })

    await expect(flagReport(REPORT_ID, 'misinformation')).rejects.toThrow()
  })

  it('throws the mapped error when the write fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX' } })

    await expect(flagReport(REPORT_ID, 'misinformation')).rejects.toThrow()
  })
})

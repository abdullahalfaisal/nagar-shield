import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppError } from '@nagar-shield/shared'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { submitDecision, fetchReportDetail } from '@/lib/api'
// The **client** component, not the route. The route is a server component
// that gates on the session's role before the console mounts — that gate is
// its own concern, and this file is about the decision.
import { ReportDetailClient } from '@/app/queue/[reportId]/report-detail-client'

/**
 * The Approve / Decline buttons.
 *
 *   * Approve restores the report straight away;
 *   * Decline asks once more, then removes it;
 *   * a blank note is replaced by a default note, because the audit log needs
 *     one, and a typed note is trimmed;
 *   * the error branches are distinct, and the raw driver message never shows.
 *
 * The panel is tested through the page, because the panel is not exported and
 * the page is what a moderator actually loads. The page's own reads are
 * mocked out — this file is about the decision, not about the fetch.
 */

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useParams: () => ({ reportId: 'report-1' }),
}))

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  submitDecision: jest.fn(),
  getBrowserClient: jest.fn(() => ({ auth: { getSession: jest.fn() } })),
  fetchReportDetail: jest.fn(),
}))

const mockedSubmitDecision = submitDecision as jest.MockedFunction<typeof submitDecision>
const mockedFetchReportDetail = fetchReportDetail as jest.MockedFunction<typeof fetchReportDetail>

const copy = getCopy(DEFAULT_ADMIN_LOCALE)

/**
 * A report detail with the minimum the page renders.
 *
 * The panel needs the report's id — the page passes `detail.id` into it — so
 * the fixture must carry one.
 */
const DETAIL = {
  id: 'report-1',
  category: null,
  description: null,
  areaHierarchy: null,
  capturedAt: '2026-01-01T00:00:00.000Z',
  publicVisibility: 'anonymous' as const,
  moderationStatus: 'hidden_pending_review' as const,
  hideReason: 'flag_threshold' as const,
  flagCount: 0,
  flags: [],
  media: [],
  uploader: null,
  priorActions: [],
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ReportDetailClient />
    </QueryClientProvider>,
  )
}

const approveButton = () => screen.getByRole('button', { name: copy.decisionApprove })
const declineButton = () => screen.getByRole('button', { name: copy.decisionDecline })

async function ready() {
  renderPanel()
  await waitFor(() => expect(screen.getByLabelText(copy.decisionNoteOptional)).toBeInTheDocument())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedSubmitDecision.mockResolvedValue(undefined)
  mockedFetchReportDetail.mockResolvedValue(DETAIL)
})

describe('Approve', () => {
  it('restores the report with the default note when no note is typed', async () => {
    await ready()

    fireEvent.click(approveButton())

    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1))
    expect(mockedSubmitDecision).toHaveBeenCalledWith(expect.anything(), {
      reportId: 'report-1',
      decision: 'restore',
      note: copy.decisionDefaultApprove,
    })
  })

  it('sends a typed note, trimmed', async () => {
    await ready()

    fireEvent.change(screen.getByLabelText(copy.decisionNoteOptional), {
      target: { value: '  Spaced note.  ' },
    })
    fireEvent.click(approveButton())

    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1))
    expect(mockedSubmitDecision).toHaveBeenCalledWith(expect.anything(), {
      reportId: 'report-1',
      decision: 'restore',
      note: 'Spaced note.',
    })
  })

  it('treats a note of spaces as no note', async () => {
    await ready()

    fireEvent.change(screen.getByLabelText(copy.decisionNoteOptional), { target: { value: '   ' } })
    fireEvent.click(approveButton())

    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1))
    const [, input] = mockedSubmitDecision.mock.calls[0] as [unknown, { note: string }]
    expect(input.note).toBe(copy.decisionDefaultApprove)
  })
})

describe('Decline', () => {
  it('asks before it removes anything', async () => {
    await ready()

    fireEvent.click(declineButton())

    expect(screen.getByText(copy.decisionDeclineConfirm)).toBeInTheDocument()
    expect(mockedSubmitDecision).not.toHaveBeenCalled()
  })

  it('removes the report after the second click', async () => {
    await ready()

    fireEvent.click(declineButton())
    fireEvent.click(screen.getByRole('button', { name: copy.decisionDeclineYes }))

    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1))
    const [, input] = mockedSubmitDecision.mock.calls[0] as [
      unknown,
      { reportId: string; decision: string; note: string },
    ]
    expect(input.reportId).toBe('report-1')
    expect(input.decision).toBe('remove')
    expect(input.note).toBe(copy.decisionDefaultDecline)
    // One report, one row. There is no list of ids anywhere.
    expect(Object.keys(input).sort()).toEqual(['decision', 'note', 'reportId'])
  })

  it('does nothing when the moderator cancels', async () => {
    await ready()

    fireEvent.click(declineButton())
    fireEvent.click(screen.getByRole('button', { name: copy.decisionCancel }))

    expect(mockedSubmitDecision).not.toHaveBeenCalled()
    expect(approveButton()).toBeInTheDocument()
  })
})

describe('the error branches', () => {
  async function approveWith(error: unknown) {
    mockedSubmitDecision.mockRejectedValue(error)
    await ready()
    fireEvent.click(approveButton())
  }

  it('shows the conflict copy for a CONFLICT', async () => {
    await approveWith(new AppError('CONFLICT'))

    expect(await screen.findByText(copy.errorConflict)).toBeInTheDocument()
  })

  it('shows the generic permission copy for a FORBIDDEN', async () => {
    await approveWith(new AppError('FORBIDDEN'))

    expect(await screen.findByText(copy.errorForbidden)).toBeInTheDocument()
  })

  it('shows the sign-in copy for an expired session', async () => {
    await approveWith(new AppError('AUTH_REQUIRED'))

    expect(await screen.findByText(copy.errorAuthRequired)).toBeInTheDocument()
  })

  it('collapses an unknown code to the generic copy', async () => {
    await approveWith({ code: 'SOMETHING_NEW', message: 'a newer server', httpStatus: 500 })

    expect(await screen.findByText(copy.errorGeneric)).toBeInTheDocument()
  })

  it('never shows the raw driver message', async () => {
    await approveWith(
      new AppError('INTERNAL', { message: 'postgres: relation "reports" does not exist' }),
    )

    expect(await screen.findByText(copy.errorGeneric)).toBeInTheDocument()
    expect(screen.queryByText(/postgres/)).not.toBeInTheDocument()
  })
})

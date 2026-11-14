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
 * The decision panel.
 *
 * The panel is the last gate before an audit row is written, and the rules it
 * enforces are the ones the story cares about:
 *
 *   * a decision requires a **note** — the submit is blocked with a blank one,
 *     and the note field is where the error goes;
 *   * the note is **trimmed** before it is sent, so a note of spaces is a
 *     blank note, not a note;
 *   * the error branches are distinct — a `CONFLICT` is a conflict, and a
 *     `VALIDATION_FAILED` is the note field, not the banner.
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

/** The decision form's submit button. */
function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: copy.decisionSubmit }) as HTMLButtonElement
}

/** The note textarea. */
function noteField(): HTMLTextAreaElement {
  return screen.getByLabelText(copy.decisionNote) as HTMLTextAreaElement
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedSubmitDecision.mockResolvedValue(undefined)
  // The page renders the panel only once the detail has loaded, so the read
  // has to resolve for the decision to be reachable at all.
  mockedFetchReportDetail.mockResolvedValue(DETAIL)
})

describe('the decision panel blocks a decision with no note', () => {
  it('keeps the submit disabled while the note is empty', async () => {
    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    expect(submitButton()).toBeDisabled()
  })

  it('keeps the submit disabled when the note is only whitespace', async () => {
    // A note of spaces is a blank note. The panel trims before it decides,
    // so the whitespace never reaches the server.
    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: '   \n  ' } })

    expect(submitButton()).toBeDisabled()
  })

  it('enables the submit once the note has content', async () => {
    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'Restored after verification.' } })

    expect(submitButton()).toBeEnabled()
  })

  it('shows the note error in the note field, not the banner', async () => {
    // A blank note is a field problem, and the field is where the moderator
    // is looking. The banner is for the server's refusals.
    //
    // The refusal is reached through the **server**: the panel sends the
    // note, the server enforces the same rule the panel did, and the code
    // comes back as `VALIDATION_FAILED`. The panel puts it in the note
    // field, where the local refusal would have put it.
    mockedSubmitDecision.mockRejectedValue(new AppError('VALIDATION_FAILED'))

    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    const fieldError = await screen.findByText(copy.decisionNoteRequired)
    expect(fieldError).toBeInTheDocument()
    // The note field is marked invalid for assistive tech.
    expect(noteField()).toHaveAttribute('aria-invalid', 'true')
    // The error is in the field, not the banner. The field error is the
    // **only** alert on screen — a banner would be a second one.
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toBe(fieldError)
  })
})

describe('the decision panel sends a trimmed note', () => {
  it('trims the note before it reaches the server', async () => {
    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: '  Spaced note.  ' } })
    fireEvent.click(submitButton())

    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1))

    expect(mockedSubmitDecision).toHaveBeenCalledWith(expect.anything(), {
      reportId: 'report-1',
      decision: 'restore',
      note: 'Spaced note.',
    })
  })

  it('sends the report id of the report on screen, and one report only', async () => {
    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1))

    const [, input] = mockedSubmitDecision.mock.calls[0] as [
      unknown,
      { reportId: string; decision: string; note: string },
    ]
    expect(input.reportId).toBe('report-1')
    // One report, one row. There is no list of ids anywhere.
    expect(Object.keys(input).sort()).toEqual(['decision', 'note', 'reportId'])
  })
})

describe('the decision panel error branches', () => {
  it('shows the conflict copy for a CONFLICT', async () => {
    mockedSubmitDecision.mockRejectedValue(new AppError('CONFLICT'))

    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    expect(await screen.findByText(copy.errorConflict)).toBeInTheDocument()
  })

  it('shows the generic permission copy for a FORBIDDEN', async () => {
    mockedSubmitDecision.mockRejectedValue(new AppError('FORBIDDEN'))

    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    expect(await screen.findByText(copy.errorForbidden)).toBeInTheDocument()
  })

  it('shows the sign-in copy for an expired session', async () => {
    mockedSubmitDecision.mockRejectedValue(new AppError('AUTH_REQUIRED'))

    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    expect(await screen.findByText(copy.errorAuthRequired)).toBeInTheDocument()
  })

  it('collapses an unknown code to the generic copy', async () => {
    // A code the console does not know can still arrive from the wire:
    // `parseErrorBody` casts the server's string to `ApiErrorCode` without
    // checking it, so a server that grows a new code reaches the screen as
    // an unknown one. The mapper's default branch is what absorbs that.
    mockedSubmitDecision.mockRejectedValue({
      code: 'SOMETHING_NEW',
      message: 'a code from a newer server',
      httpStatus: 500,
    })

    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    expect(await screen.findByText(copy.errorGeneric)).toBeInTheDocument()
  })

  it('never shows the raw driver message', async () => {
    // The panel switches on the stable code and renders localized copy. The
    // driver's own text must not reach the screen.
    mockedSubmitDecision.mockRejectedValue(
      new AppError('INTERNAL', { message: 'postgres: relation "reports" does not exist' }),
    )

    renderPanel()

    await waitFor(() => expect(screen.getByLabelText(copy.decisionNote)).toBeInTheDocument())

    fireEvent.change(noteField(), { target: { value: 'A note.' } })
    fireEvent.click(submitButton())

    expect(await screen.findByText(copy.errorGeneric)).toBeInTheDocument()
    expect(screen.queryByText(/postgres/)).not.toBeInTheDocument()
  })
})

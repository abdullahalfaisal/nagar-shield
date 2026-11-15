/**
 * The moderator gate.
 *
 * The gate reads the caller's role from the cookie-backed session **before**
 * the console's client bundle mounts, and refuses a non-moderator.
 *
 * This test pins the thing that went wrong once already: `readModeratorRole()`
 * was written and never called, every console page passed a literal
 * `role="moderator"`, and the shell's own role guard was dead code. A citizen
 * who reached `/queue` saw the server's generic `FORBIDDEN` banner instead of
 * the access-only state. The server was right the whole time — the console
 * simply never asked.
 *
 * So the test asserts the gate **asks**, and asserts what it does with the
 * answer.
 */

jest.mock('@/lib/supabase/server', () => ({
  readModeratorRole: jest.fn(),
}))

// `redirect` throws in Next, so nothing after it runs. The mock does the same.
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
  useRouter: () => ({ replace: jest.fn() }),
}))
jest.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({ auth: { signOut: jest.fn() } }),
}))

import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'
import { readModeratorRole } from '@/lib/supabase/server'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { ModeratorGate } from '@/app/moderator-gate'

const mockedReadModeratorRole = readModeratorRole as jest.MockedFunction<typeof readModeratorRole>

const copy = getCopy(DEFAULT_ADMIN_LOCALE)

/**
 * Renders the gate and waits for it to settle.
 *
 * `ModeratorGate` is an **async** server component — it awaits the role
 * before it decides what to render. A plain `render` would leave the tree
 * empty until the promise resolves, and the assertion would run against a
 * blank body.
 */
async function renderGate() {
  const tree = await ModeratorGate({ children: <p>the console</p> })
  render(tree)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('the gate asks who the caller is', () => {
  it('reads the role before rendering the console', async () => {
    mockedReadModeratorRole.mockResolvedValue('moderator')

    await renderGate()

    expect(mockedReadModeratorRole).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('the console')).toBeInTheDocument()
  })
})

describe('the gate refuses a non-moderator', () => {
  it('shows the access-only state to a citizen', async () => {
    mockedReadModeratorRole.mockResolvedValue('citizen')

    await renderGate()

    expect(await screen.findByText(copy.accessOnlyTitle)).toBeInTheDocument()
    // The console is **not** rendered. The point of the gate is that the
    // console's queries are never fired for a citizen.
    expect(screen.queryByText('the console')).not.toBeInTheDocument()
  })

  it('gives a citizen a way out: a sign-out button', async () => {
    mockedReadModeratorRole.mockResolvedValue('citizen')

    await renderGate()

    expect(await screen.findByRole('button', { name: copy.signOut })).toBeInTheDocument()
  })

  it('sends a signed-out visitor to the sign-in page, not to a dead end', async () => {
    // An expired cookie used to land here and read "this account has no
    // permission", with nothing to click.
    mockedReadModeratorRole.mockResolvedValue(null)

    await expect(renderGate()).rejects.toThrow('NEXT_REDIRECT:/login')

    expect(redirect).toHaveBeenCalledWith('/login')
    expect(screen.queryByText('the console')).not.toBeInTheDocument()
    expect(screen.queryByText(copy.accessOnlyTitle)).not.toBeInTheDocument()
  })
})

describe('the gate admits a moderator', () => {
  it('renders the console', async () => {
    mockedReadModeratorRole.mockResolvedValue('moderator')

    await renderGate()

    expect(await screen.findByText('the console')).toBeInTheDocument()
    expect(screen.queryByText(copy.accessOnlyTitle)).not.toBeInTheDocument()
  })
})

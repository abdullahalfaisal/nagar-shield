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
}));

import { render, screen } from '@testing-library/react';
import { readModeratorRole } from '@/lib/supabase/server';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import { ModeratorGate } from '@/app/moderator-gate';

const mockedReadModeratorRole = readModeratorRole as jest.MockedFunction<
  typeof readModeratorRole
>;

const copy = getCopy(DEFAULT_ADMIN_LOCALE);

/**
 * Renders the gate and waits for it to settle.
 *
 * `ModeratorGate` is an **async** server component — it awaits the role
 * before it decides what to render. A plain `render` would leave the tree
 * empty until the promise resolves, and the assertion would run against a
 * blank body.
 */
async function renderGate() {
  const tree = await ModeratorGate({ children: <p>the console</p> });
  render(tree);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the gate asks who the caller is', () => {
  it('reads the role before rendering the console', async () => {
    mockedReadModeratorRole.mockResolvedValue('moderator');

    await renderGate();

    expect(mockedReadModeratorRole).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('the console')).toBeInTheDocument();
  });
});

describe('the gate refuses a non-moderator', () => {
  it('shows the access-only state to a citizen', async () => {
    mockedReadModeratorRole.mockResolvedValue('citizen');

    await renderGate();

    expect(await screen.findByText(copy.accessOnlyTitle)).toBeInTheDocument();
    // The console is **not** rendered. The point of the gate is that the
    // console's queries are never fired for a citizen.
    expect(screen.queryByText('the console')).not.toBeInTheDocument();
  });

  it('shows the access-only state when there is no session', async () => {
    // A signed-out visitor gets the same surface. The console would fire
    // requests nobody is authorized to make.
    mockedReadModeratorRole.mockResolvedValue(null);

    await renderGate();

    expect(await screen.findByText(copy.accessOnlyTitle)).toBeInTheDocument();
    expect(screen.queryByText('the console')).not.toBeInTheDocument();
  });
});

describe('the gate admits a moderator', () => {
  it('renders the console', async () => {
    mockedReadModeratorRole.mockResolvedValue('moderator');

    await renderGate();

    expect(await screen.findByText('the console')).toBeInTheDocument();
    expect(screen.queryByText(copy.accessOnlyTitle)).not.toBeInTheDocument();
  });
});

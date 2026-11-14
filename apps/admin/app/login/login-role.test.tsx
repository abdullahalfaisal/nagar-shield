/**
 * The moderator sign-in, and the role check that follows it.
 *
 * The sign-in itself is not the interesting part — email and password against
 * the same Supabase Auth project the citizen app uses. The interesting part
 * is what happens **after** a successful sign-in.
 *
 * A citizen who signs in successfully is **refused the console**, and the
 * refusal has to say why. There are two ways to get that wrong, and this file
 * exists to prevent both:
 *
 *   * routing the citizen to `/queue`, where every call fails with
 *     `FORBIDDEN` and the screen shows a generic permission banner — which
 *     says nothing about what actually happened;
 *   * showing the access-only state as an **error**, which claims the
 *     sign-in failed when it succeeded.
 *
 * The access-only state says what is true: the account is signed in, it just
 * has no moderation permission.
 */

// The `jest.mock` calls come **before** the imports on purpose. An ES import
// is hoisted above a `jest.mock` that appears later in the file, so the
// module under test would be bound to the real implementation and the mock
// would never be applied — silently, with no error.
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

jest.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => currentClient,
}));

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import LoginPage from '@/app/login/page';

/**
 * The Supabase client's surface the login page uses.
 *
 * `auth.signInWithPassword` answers the credentials, `auth.getSession`
 * answers who is signed in, and the `profiles` table answers the role.
 */
interface FakeClient {
  auth: {
    signInWithPassword: jest.Mock;
    getSession: jest.Mock;
    signOut: jest.Mock;
  };
  from: jest.Mock;
}

function fakeClient(options: {
  role: 'citizen' | 'moderator' | null;
  signInError?: { message: string } | null;
}): FakeClient {
  const client: FakeClient = {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: options.signInError ? null : { user: { id: 'user-1' } },
        error: options.signInError ?? null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
      }),
      signOut: jest.fn().mockResolvedValue(undefined),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          // Supabase's shape: the row is under `data`, not at the top level.
          // The page destructures `{ data: profile }`, so a bare row would
          // read as "no profile" and every account would be refused.
          maybeSingle: jest.fn().mockResolvedValue({
            data: options.role ? { role: options.role } : null,
            error: null,
          }),
        }),
      }),
    }),
  };

  return client;
}

let currentClient: FakeClient = fakeClient({ role: 'citizen' });

const copy = getCopy(DEFAULT_ADMIN_LOCALE);

/** Fills in the sign-in form and submits it. */
async function signIn(email = 'citizen@example.com', password = 'a-password') {
  fireEvent.change(screen.getByLabelText(copy.loginEmail), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(copy.loginPassword), { target: { value: password } });

  // The submit handler is async — it awaits the sign-in, the session and the
  // profile before it settles. `act` lets React flush the state updates that
  // follow, so the assertions below see the settled screen rather than a
  // half-rendered one.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: copy.loginSubmit }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  currentClient = fakeClient({ role: 'citizen' });
});

describe('the sign-in refuses a citizen the console', () => {
  it('shows the access-only state to a signed-in citizen', async () => {
    render(<LoginPage />);

    await signIn();

    expect(await screen.findByText(copy.accessOnlyTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.accessOnlyBody)).toBeInTheDocument();
  });

  it('does not route the citizen to the console', async () => {
    // The route is the trap: a citizen landed on `/queue` sees a generic
    // `FORBIDDEN` banner, which describes a permission failure rather than
    // the truth — the account signed in fine and simply has no moderation
    // role.
    render(<LoginPage />);

    await signIn();

    await screen.findByText(copy.accessOnlyTitle);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not claim the sign-in failed', async () => {
    // The sign-in **succeeded**. The access-only state is not an error, so
    // the danger banner must not be on screen.
    render(<LoginPage />);

    await signIn();

    await screen.findByText(copy.accessOnlyTitle);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats a profile with no role as no access', async () => {
    // A `profiles` row that is missing entirely is the same case: signed in,
    // no moderation role.
    currentClient = fakeClient({ role: null });

    render(<LoginPage />);

    await signIn();

    expect(await screen.findByText(copy.accessOnlyTitle)).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('the sign-in lets a moderator through', () => {
  it('routes a moderator to the queue', async () => {
    currentClient = fakeClient({ role: 'moderator' });

    render(<LoginPage />);

    await signIn();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/queue'));
    expect(screen.queryByText(copy.accessOnlyTitle)).not.toBeInTheDocument();
  });
});

describe('the sign-in refuses bad credentials', () => {
  it('shows the sign-in error when the password is wrong', async () => {
    currentClient = fakeClient({ role: 'citizen', signInError: { message: 'Invalid login' } });

    render(<LoginPage />);

    await signIn();

    expect(await screen.findByText(copy.errorAuthRequired)).toBeInTheDocument();
    // A failed sign-in is not the access-only state — the account never got
    // in.
    expect(screen.queryByText(copy.accessOnlyTitle)).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('never shows the raw driver message', async () => {
    currentClient = fakeClient({
      role: 'citizen',
      signInError: { message: 'Invalid login credentials for user x@y.com' },
    });

    render(<LoginPage />);

    await signIn();

    expect(await screen.findByText(copy.errorAuthRequired)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid login credentials/)).not.toBeInTheDocument();
  });
});

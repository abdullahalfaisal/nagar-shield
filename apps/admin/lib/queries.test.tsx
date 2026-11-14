/**
 * The query keys and the error branches.
 *
 * Two things are protected here, and the first is the important one.
 *
 * The keys are **prefixes**
 * -----------------------
 * `invalidateQueries` matches by prefix: the filter key must be a prefix of
 * the query's own key (`partialMatchKey` in `@tanstack/query-core`). So
 * invalidating `['admin', 'audit']` reaches `['admin', 'audit', 'restore']` —
 * the filtered variant of the trail — but would NOT reach a key that did not
 * begin with `['admin', 'audit']`.
 *
 * A key that does not prefix-match **fails silently**. There is no error, no
 * warning, and no failed test — the query simply stays fresh while the
 * screen shows stale data. That is the bug this file exists to prevent.
 *
 * The error branches
 * ------------------
 * The two panels map the same set of codes to **different** copy, and the
 * split is deliberate. `FORBIDDEN` in the disable panel means *a moderator
 * cannot be disabled* — a specific, actionable message — not the generic
 * permission message. Collapsing the two would tell a moderator they lack
 * permission when what actually happened is that they tried to disable a
 * moderator.
 */

// The `jest.mock` call comes **before** the imports on purpose: an ES import
// is hoisted above a `jest.mock` that appears later in the file, so the
// module would be bound to the real implementation and the mock would never
// be applied — silently, with no error.
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  submitDecision: jest.fn().mockResolvedValue(undefined),
  getBrowserClient: jest.fn(() => ({ auth: { getSession: jest.fn() } })),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppError } from '@nagar-shield/shared';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import { submitDecision } from '@/lib/api';
import {
  ADMIN_QUERY_ROOT,
  AUDIT_QUERY_KEY,
  QUEUE_QUERY_KEY,
  REPORT_DETAIL_QUERY_KEY,
  USERS_QUERY_KEY,
  decisionErrorMessage,
  disableErrorMessage,
  useSubmitDecision,
} from '@/lib/queries';

const mockedSubmitDecision = submitDecision as jest.MockedFunction<typeof submitDecision>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedSubmitDecision.mockResolvedValue(undefined);
});

describe('the console query keys', () => {
  it('shares one root segment, so a single invalidation can reach every console query', () => {
    // The root is the first segment of every key. If it ever drifts, one
    // catch-all invalidation silently stops reaching anything.
    for (const key of [QUEUE_QUERY_KEY, REPORT_DETAIL_QUERY_KEY, AUDIT_QUERY_KEY, USERS_QUERY_KEY]) {
      expect(key[0]).toBe('admin');
    }
  });

  it('gives every key a distinct second segment', () => {
    // Two keys sharing a prefix would make one invalidation reach the
    // other's queries — the queue would refetch when the trail is
    // invalidated, and the audit trail would refetch on every decision.
    const second = [QUEUE_QUERY_KEY, REPORT_DETAIL_QUERY_KEY, AUDIT_QUERY_KEY, USERS_QUERY_KEY].map(
      (key) => key[1],
    );

    expect(new Set(second).size).toBe(second.length);
  });

  it('pins the exact shape of every key', () => {
    // The **literal** shapes, written out.
    //
    // This is the assertion that catches a key-shape drift. Every other
    // test in this file compares a constant against itself — the seed and
    // the invalidation both use `AUDIT_QUERY_KEY`, so a constant that
    // changed shape would still match. Written out here, the shape is
    // pinned: if `AUDIT_QUERY_KEY` ever stops being `['admin', 'audit']`,
    // this fails, and the invalidation can no longer reach the trail.
    expect(QUEUE_QUERY_KEY).toEqual(['admin', 'queue']);
    expect(REPORT_DETAIL_QUERY_KEY).toEqual(['admin', 'report-detail']);
    expect(AUDIT_QUERY_KEY).toEqual(['admin', 'audit']);
    expect(USERS_QUERY_KEY).toEqual(['admin', 'users']);
    expect(ADMIN_QUERY_ROOT).toEqual(['admin']);
  });

  it('carries no group in the queue key — the group is a client-side slice', () => {
    // The author-auto-hide group narrows the rows already on screen and
    // never reaches the server. If the group entered the query key, the
    // server would be asked to filter by it, and the queue would issue a
    // second read for the same data.
    expect(QUEUE_QUERY_KEY).toEqual(['admin', 'queue']);
    expect(QUEUE_QUERY_KEY).not.toContain('author_auto_hide');
  });
});

describe('the decision panel error branches', () => {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);

  it('shows a blank note in the note field, not the banner', () => {
    // A blank note is a field problem, and the field is where the moderator
    // is looking. The panel renders this one in the note field.
    expect(decisionErrorMessage('VALIDATION_FAILED')).toBe(copy.decisionNoteRequired);
  });

  it('maps a conflict to the conflict copy', () => {
    expect(decisionErrorMessage('CONFLICT')).toBe(copy.errorConflict);
  });

  it('maps a permission refusal to the generic permission copy', () => {
    expect(decisionErrorMessage('FORBIDDEN')).toBe(copy.errorForbidden);
    expect(decisionErrorMessage('AUTH_DISABLED')).toBe(copy.errorForbidden);
  });

  it('maps an expired session to the sign-in copy', () => {
    expect(decisionErrorMessage('AUTH_REQUIRED')).toBe(copy.errorAuthRequired);
  });

  it('collapses anything unknown to the generic copy', () => {
    expect(decisionErrorMessage('INTERNAL')).toBe(copy.errorGeneric);
    expect(decisionErrorMessage('SOMETHING_NEW')).toBe(copy.errorGeneric);
  });
});

describe('the disable panel error branches', () => {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);

  it('says a moderator cannot be disabled, not "you lack permission"', () => {
    // This is the split that matters: the disable panel's `FORBIDDEN` is a
    // specific refusal about the *target*, and the generic permission
    // message would misdescribe it.
    expect(disableErrorMessage('FORBIDDEN')).toBe(copy.usersDisableForbidden);
    expect(disableErrorMessage('FORBIDDEN')).not.toBe(copy.errorForbidden);
  });

  it('maps a conflict to the conflict copy', () => {
    expect(disableErrorMessage('CONFLICT')).toBe(copy.errorConflict);
  });

  it('maps a disabled account to the generic permission copy', () => {
    expect(disableErrorMessage('AUTH_DISABLED')).toBe(copy.errorForbidden);
  });

  it('maps an expired session to the sign-in copy', () => {
    expect(disableErrorMessage('AUTH_REQUIRED')).toBe(copy.errorAuthRequired);
  });

  it('collapses anything unknown to the generic copy', () => {
    expect(disableErrorMessage('INTERNAL')).toBe(copy.errorGeneric);
    expect(disableErrorMessage('SOMETHING_NEW')).toBe(copy.errorGeneric);
  });
});

describe('the invalidation reaches the queries it names', () => {
  /**
   * The load-bearing check.
   *
   * The decision mutation invalidates the queue, the report detail and the
   * audit trail. If any of those keys did not prefix-match, the invalidation
   * would be a **silent no-op** — the moderator would keep looking at a queue
   * that still held the report they just decided, and an audit trail that
   * had been fetched before the decision.
   *
   * The test drives a real `QueryClient`: it seeds the cache with the three
   * queries, runs the invalidation the mutation performs, and asserts each
   * query was marked invalidated. A key typo makes this fail.
   */
  it('marks the queue, the detail and the audit trail invalidated', () => {
    const queryClient = new QueryClient();

    const reportId = 'report-1';

    // Seed the cache with the three queries the mutation must invalidate.
    //
    // The seeded keys are written out **literally**, not taken from the
    // constants. That is the point of the test: a constant that drifts out
    // of prefix-match would still match itself, so seeding with the
    // constant would prove nothing. Seeded literally, the invalidation has
    // to reach the real key shape or the assertion fails.
    queryClient.setQueryData(['admin', 'queue'], { items: [], nextCursor: null });
    queryClient.setQueryData(['admin', 'report-detail', reportId], { id: reportId });
    queryClient.setQueryData(['admin', 'audit', 'all'], { items: [], nextCursor: null });

    // The invalidation the decision mutation performs.
    queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: [...REPORT_DETAIL_QUERY_KEY, reportId] });
    queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY });

    expect(queryClient.getQueryState(['admin', 'queue'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['admin', 'report-detail', reportId])?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(['admin', 'audit', 'all'])?.isInvalidated).toBe(true);
  });

  it('reaches the audit trail through its filter variant', () => {
    // The audit query key ends with the decision filter, so the filter key
    // must be a **prefix** of it — `['admin','audit']` reaches
    // `['admin','audit','restore']`. A key that only matched the exact
    // variant would leave the filtered trail stale.
    const queryClient = new QueryClient();

    queryClient.setQueryData([...AUDIT_QUERY_KEY, 'restore'], { items: [] });
    queryClient.setQueryData([...AUDIT_QUERY_KEY, 'remove'], { items: [] });

    queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY });

    expect(queryClient.getQueryState([...AUDIT_QUERY_KEY, 'restore'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState([...AUDIT_QUERY_KEY, 'remove'])?.isInvalidated).toBe(true);
  });

  it('does not reach a query it does not name', () => {
    // The inverse check, and the reason the keys need distinct second
    // segments: invalidating the queue must not invalidate the audit trail.
    const queryClient = new QueryClient();

    queryClient.setQueryData([...QUEUE_QUERY_KEY], { items: [] });
    queryClient.setQueryData([...AUDIT_QUERY_KEY, 'all'], { items: [] });

    queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });

    expect(queryClient.getQueryState([...QUEUE_QUERY_KEY])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState([...AUDIT_QUERY_KEY, 'all'])?.isInvalidated).not.toBe(true);
  });

  it('leaves the other reports’ detail queries alone', () => {
    // The detail key ends with the report id, so a decision on one report
    // does not refetch every other report's detail.
    const queryClient = new QueryClient();

    queryClient.setQueryData([...REPORT_DETAIL_QUERY_KEY, 'report-1'], { id: 'report-1' });
    queryClient.setQueryData([...REPORT_DETAIL_QUERY_KEY, 'report-2'], { id: 'report-2' });

    queryClient.invalidateQueries({ queryKey: [...REPORT_DETAIL_QUERY_KEY, 'report-1'] });

    expect(queryClient.getQueryState([...REPORT_DETAIL_QUERY_KEY, 'report-1'])?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState([...REPORT_DETAIL_QUERY_KEY, 'report-2'])?.isInvalidated).not.toBe(
      true,
    );
  });
});

describe('the decision mutation invalidates every surface the decision touches', () => {
  /**
   * The mutation's own `onSuccess`, driven for real.
   *
   * The tests above prove that the *library* reaches a query when the key
   * prefix-matches. This one proves that the **mutation** names all three
   * keys — which is a different failure, and the more likely one: someone
   * drops a line from `onSuccess` and nothing complains, because the
   * library is behaving exactly as documented.
   *
   * The mutation is rendered in a real component with a real `QueryClient`,
   * the write is dispatched, and the cache is inspected afterwards.
   */
  it('marks the queue, the detail and the audit trail invalidated', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // The three surfaces a decision touches, seeded with the literal key
    // shapes so the assertion is about the real shape and not about the
    // constant matching itself.
    queryClient.setQueryData(['admin', 'queue'], { items: [], nextCursor: null });
    queryClient.setQueryData(['admin', 'report-detail', 'report-1'], { id: 'report-1' });
    queryClient.setQueryData(['admin', 'audit', 'all'], { items: [], nextCursor: null });

    function Decision() {
      const submit = useSubmitDecision();
      return (
        <button
          type="button"
          onClick={() => submit.mutate({ reportId: 'report-1', decision: 'restore', note: 'A note.' })}
        >
          decide
        </button>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Decision />
      </QueryClientProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'decide' }));
    });

    // The write happened.
    await waitFor(() => expect(mockedSubmitDecision).toHaveBeenCalledTimes(1));

    // And all three surfaces were invalidated.
    await waitFor(() => {
      expect(queryClient.getQueryState(['admin', 'queue'])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(['admin', 'report-detail', 'report-1'])?.isInvalidated).toBe(
        true,
      );
      expect(queryClient.getQueryState(['admin', 'audit', 'all'])?.isInvalidated).toBe(true);
    });
  });
});

describe('the error normalisation', () => {
  it('keeps a stable code, so the screen can switch on it', () => {
    // `getBrowserClient` throws a plain Error when the env vars are missing.
    // Every throw inside a query function is normalised to an AppError, so
    // the page can branch on `code` rather than on a message.
    const error = new AppError('AUTH_REQUIRED');
    expect(error.code).toBe('AUTH_REQUIRED');
  });
});

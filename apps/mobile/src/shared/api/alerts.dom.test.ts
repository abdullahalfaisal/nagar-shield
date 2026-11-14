import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { alertsItems, fetchAlerts, useAlerts } from './alerts';
import { supabase } from '@/shared/api/supabase';

/**
 * The Alerts feed is **cursor-paginated**.
 *
 * The `alerts_feed` RPC orders by `(captured_at DESC, id DESC)` and hands back
 * a `next_cursor` whenever another page exists. The feed query used to be a
 * plain `useQuery`: it received the `next_cursor` and **discarded it**, so a
 * feed longer than one page silently truncated at the limit and the second
 * page was unreachable. The user saw a short feed with no indication that
 * more existed.
 *
 * These tests drive the **real hook** — `useAlerts` — so the guard cannot
 * drift from the code it guards:
 *
 *   1. **The cursor is followed.** `fetchNextPage` asks the RPC for the next
 *      page using the cursor the previous page returned, and the rows of
 *      page two reach the feed.
 *   2. **The cursor is not part of the query key.** The key carries the area
 *      filter alone. A cursor in the key would make every page its own query
 *      and the feed would reset to page one on every request.
 */

jest.mock('@/shared/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

/** One page of the RPC's envelope. */
function envelope(items: Array<Record<string, unknown>>, nextCursor: string | null) {
  return { data: { items, next_cursor: nextCursor }, error: null };
}

/** A minimal feed row, shaped like the RPC's output. */
function row(id: string) {
  return {
    id,
    category: 'theft',
    description: null,
    area_hierarchy: { division: 'Dhaka', city: 'Dhaka', thana: null, neighborhood: null },
    captured_at: '2026-11-05T10:00:00.000Z',
    author_display_name: null,
    has_media: false,
    media_count: 0,
  };
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('fetchAlerts', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('asks the RPC for the first page with no cursor', async () => {
    rpc.mockResolvedValue(envelope([row('a')], null) as never);

    await fetchAlerts({ division: 'Dhaka' });

    expect(rpc).toHaveBeenCalledWith('alerts_feed', expect.objectContaining({
      p_cursor: null,
      p_division: 'Dhaka',
    }));
  });

  it('passes the cursor it was given, so the second page is reachable', async () => {
    rpc.mockResolvedValue(envelope([row('b')], null) as never);

    await fetchAlerts({}, 'cursor-1');

    expect(rpc).toHaveBeenCalledWith('alerts_feed', expect.objectContaining({
      p_cursor: 'cursor-1',
    }));
  });

  it('keeps the area filter and the cursor apart', async () => {
    rpc.mockResolvedValue(envelope([], null) as never);

    await fetchAlerts({ division: 'Dhaka' }, 'cursor-1');

    expect(rpc).toHaveBeenCalledWith('alerts_feed', expect.objectContaining({
      p_division: 'Dhaka',
      p_city: null,
      p_thana: null,
      p_neighborhood: null,
    }));
  });

  it('reports the cursor it was given back as the next cursor', async () => {
    rpc.mockResolvedValue(envelope([row('a')], 'cursor-2') as never);

    const page = await fetchAlerts({}, null);

    expect(page.nextCursor).toBe('cursor-2');
  });
});

describe('useAlerts', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('follows the cursor and puts the second page into the feed', async () => {
    // Page one carries a cursor; page two is what the cursor unlocks.
    rpc.mockResolvedValueOnce(envelope([row('a'), row('b')], 'cursor-1') as never);
    rpc.mockResolvedValueOnce(envelope([row('c')], null) as never);

    const { result } = renderHook(() => useAlerts({}), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data?.pages.length).toBe(1));

    expect(alertsItems(result.current.data).map((report) => report.id)).toEqual(['a', 'b']);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages.length).toBe(2));

    // The second request carried the cursor the first page returned.
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_cursor: 'cursor-1' });

    // And the second page's rows reached the feed.
    expect(alertsItems(result.current.data).map((report) => report.id)).toEqual(['a', 'b', 'c']);
  });

  it('reports that there is no next page when the RPC returns no cursor', async () => {
    rpc.mockResolvedValue(envelope([row('a')], null) as never);

    const { result } = renderHook(() => useAlerts({}), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
  });

  it('reports that there is a next page when the RPC returns a cursor', async () => {
    rpc.mockResolvedValue(envelope([row('a')], 'cursor-1') as never);

    const { result } = renderHook(() => useAlerts({}), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(true);
  });

  it('keeps the cursor out of the query key, so scrolling does not start a new query', async () => {
    rpc.mockResolvedValueOnce(envelope([row('a')], 'cursor-1') as never);
    rpc.mockResolvedValueOnce(envelope([row('b')], null) as never);

    const { result } = renderHook(() => useAlerts({}), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data?.pages.length).toBe(1));

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages.length).toBe(2));

    // One query, two pages. If the cursor had been in the key, the second
    // page would have replaced the first rather than appended to it.
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(alertsItems(result.current.data).map((report) => report.id)).toEqual(['a', 'b']);
  });

  it('starts a new feed when the area filter changes', async () => {
    rpc.mockResolvedValue(envelope([row('a')], null) as never);

    const { result, rerender } = renderHook(
      ({ filter }: { filter: { division?: string } }) => useAlerts(filter),
      { wrapper: wrapper(), initialProps: { filter: {} as { division?: string } } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ filter: { division: 'Dhaka' } });

    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('alerts_feed', expect.objectContaining({
        p_division: 'Dhaka',
      })),
    );
  });
});

describe('alertsItems', () => {
  it('returns nothing for no data', () => {
    expect(alertsItems(undefined)).toEqual([]);
  });

  it('flattens every page in order', () => {
    const items = alertsItems({
      pages: [
        { items: [{ id: 'a' } as never], nextCursor: 'c1' },
        { items: [{ id: 'b' } as never], nextCursor: null },
      ],
      pageParams: [null, 'c1'],
    });

    expect(items.map((report) => report.id)).toEqual(['a', 'b']);
  });

  it('carries the rows of a single page too', () => {
    const items = alertsItems({
      pages: [{ items: [{ id: 'a' } as never], nextCursor: null }],
      pageParams: [null],
    });

    expect(items.map((report) => report.id)).toEqual(['a']);
  });
});

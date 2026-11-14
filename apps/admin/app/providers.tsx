'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The console's providers.
 *
 * The admin declares `@tanstack/react-query` as a dependency, and this is
 * where it is actually used. Without this provider there is no query client,
 * so no query can be invalidated by key — and every screen had to hand-roll
 * its own reload callback, which is exactly the shape that gets forgotten at
 * a call site.
 *
 * The client is created at **module scope**, not per render. A client
 * recreated on every render would throw away the cache on every keystroke,
 * which defeats the purpose of having one.
 *
 * The defaults match the mobile app's (`apps/mobile/app/_layout.tsx`), so the
 * two consoles behave the same way:
 *
 *   * `staleTime: 30_000` — a moderator who navigates between the queue, a
 *     report and the audit trail within half a minute sees the same data
 *     rather than three round-trips. A **mutation** invalidates by key, so
 *     this window is about navigation, not about staleness after a write.
 *   * `retry: 1` — one retry for a transient network failure, and no more.
 *     A `FORBIDDEN` or `NOT_FOUND` is a stable answer, not a transient one,
 *     and retrying it would only delay the message the moderator needs.
 *   * `refetchOnWindowFocus: false` — the console is a work surface, not a
 *     live feed; a moderator alt-tabbing back to it does not need a refetch.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

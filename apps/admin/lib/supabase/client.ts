import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The browser-side Supabase client.
 *
 * It carries the **anon key** and the moderator's own session — never the
 * service-role key. Authorization is enforced by Row Level Security plus the
 * role check inside each RPC / Edge Function, so a client-side guard is only
 * a convenience.
 *
 * The anon key is public by design: it ships in the browser bundle and every
 * table it can reach is RLS-protected.
 */

/**
 * The Supabase configuration, read lazily.
 *
 * The env vars are read on **first use**, not at module load: a module-level
 * read plus a module-level `throw` breaks `next build`, because the build
 * prerenders every route and the env vars are absent on the build machine.
 */
function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  return { url, anonKey }
}

let browserClient: SupabaseClient | undefined

/**
 * The browser client is created once per page load.
 *
 * Next.js re-renders server components on the server, so a module-level
 * singleton would leak a session between requests there; the browser client
 * only ever runs in the browser, where one singleton is correct.
 */
export function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = getSupabaseConfig()
    browserClient = createBrowserClient(url, anonKey)
  }
  return browserClient
}

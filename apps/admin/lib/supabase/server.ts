import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The server-side Supabase client.
 *
 * The session is held in a cookie so the App Router's Server Components can
 * read `profiles.role` before rendering the shell. The client still uses the
 * **anon key** — a server-side session does **not** license a service-role
 * client, and this package never holds the service-role key at all.
 */

/**
 * The Supabase configuration, read lazily.
 *
 * A module-level read plus a module-level `throw` breaks `next build`, because
 * the build prerenders every route and the env vars are absent on the build
 * machine. The check belongs on the call that actually needs the client.
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

/**
 * Creates a request-scoped server client.
 *
 * Next.js must be able to write cookies when the session refreshes, so both
 * the `set` and the `remove` callbacks are implemented. Without them the
 * refreshed token would be dropped and the moderator would be signed out on
 * the next navigation.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  const { url, anonKey } = getSupabaseConfig()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch {
          // A Server Component cannot write cookies. The middleware refreshes
          // the session, so the failure here is not fatal — the request still
          // proceeds with the cookie that was already set.
        }
      },
    },
  })
}

/**
 * The signed-in moderator's role, read from the caller's own profile row.
 *
 * Returns `null` when there is no session or no profile. The value is a UX
 * affordance only — the server re-checks the role inside every RPC and Edge
 * Function, so a forged value here grants nothing.
 */
export async function readModeratorRole(): Promise<'citizen' | 'moderator' | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return (profile?.role as 'citizen' | 'moderator' | undefined) ?? null
}

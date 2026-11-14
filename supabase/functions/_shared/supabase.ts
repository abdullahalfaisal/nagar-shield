/**
 * The shared Supabase client factory for the Edge Functions.
 *
 * Two clients exist and they are NOT interchangeable:
 *
 *   * `createUserClient()` — carries the **caller's** JWT. It is subject to
 *     RLS. This is what a client-facing function (Capture, Flag) uses.
 *   * `createServiceClient()` — carries the **service-role** key. It bypasses
 *     RLS by design and is reserved for the privileged workflows (the jobs,
 *     the moderation writes). The key never leaves this process.
 *
 * The service-role key is read from the function environment only. It is
 * never bundled, never returned, and never written to a log line.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/** The project URL — public by design; the anon key is scoped by RLS. */
export function projectUrl(): string {
  return requireEnv('SUPABASE_URL')
}

/** A client bound to the caller's JWT. RLS applies to every statement. */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(projectUrl(), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A client bound to the service-role key. RLS is bypassed by design. */
export function createServiceClient(): SupabaseClient {
  return createClient(projectUrl(), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Extracts the bearer token from the request.
 *
 * Returns `null` when the header is absent or malformed — the caller maps that
 * to `AUTH_REQUIRED`.
 */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/**
 * Caller identity for the Edge Functions.
 *
 * Two gates exist and they are different:
 *
 *   * `authenticateCaller` — a **client** function. The caller's JWT is
 *     verified against the Auth server, the profile is read, and a disabled or
 *     soft-deleted account is rejected with `AUTH_DISABLED`.
 *   * `requireServiceRole` — a **job / privileged** function. The bearer must
 *     be the service-role key itself. There is no user session and no
 *     moderator role: these endpoints are not client-callable.
 *
 * The service-role key never leaves the function environment and never
 * appears in a response or a log line.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { readBearerToken } from './supabase.ts'

export interface CallerIdentity {
  id: string
  role: 'citizen' | 'moderator'
  disabled: boolean
  deleted: boolean
}

export type CallerRejection = 'AUTH_REQUIRED' | 'AUTH_DISABLED' | 'FORBIDDEN' | 'INTERNAL'

export class CallerError extends Error {
  readonly code: CallerRejection

  constructor(code: CallerRejection, message?: string) {
    super(message ?? code)
    this.name = 'CallerError'
    this.code = code
  }
}

/**
 * Verifies the caller's session and resolves their profile state.
 *
 * `client` must be the **service** client: the Auth server is consulted to
 * validate the token, and the profile is read with service privileges so a
 * disabled account is caught even if its JWT is still cryptographically
 * valid.
 */
export async function authenticateCaller(
  client: SupabaseClient,
  request: Request,
): Promise<CallerIdentity> {
  const token = readBearerToken(request)
  if (!token) throw new CallerError('AUTH_REQUIRED')

  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new CallerError('AUTH_REQUIRED')

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, role, disabled_at, deleted_at')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) throw new CallerError('INTERNAL')
  if (!profile) throw new CallerError('AUTH_REQUIRED')

  const identity: CallerIdentity = {
    id: profile.id as string,
    role: (profile.role as 'citizen' | 'moderator') ?? 'citizen',
    disabled: Boolean(profile.disabled_at),
    deleted: Boolean(profile.deleted_at),
  }

  if (identity.disabled || identity.deleted) throw new CallerError('AUTH_DISABLED')

  return identity
}

/** Asserts the caller is a moderator. The check is server-side, always. */
export function assertModerator(caller: CallerIdentity): void {
  if (caller.role !== 'moderator') throw new CallerError('FORBIDDEN')
}

/**
 * Requires the service-role key on a privileged endpoint.
 *
 * The scheduled jobs are not client-callable: they have no anon path and no
 * authenticated path. The bearer must be the service-role key itself.
 *
 * The key is read from `NAGAR_SERVICE_KEY`, seeded by the operator with
 * `supabase secrets set`. It cannot use the platform's `SUPABASE_SERVICE_ROLE_KEY`:
 * hosted projects inject that name themselves and forbid overriding it, and the
 * injected value does not necessarily equal the legacy JWT the scheduler sends —
 * proved live: the platform's value rejected the Vault's legacy JWT with 403.
 * `SUPABASE_SERVICE_ROLE_KEY` stays as the local-stack fallback, where the
 * platform injects exactly the legacy JWT.
 */
export function requireServiceRole(request: Request): void {
  const token = readBearerToken(request)
  const serviceKey = Deno.env.get('NAGAR_SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!serviceKey) throw new CallerError('INTERNAL', 'service key env is not set')
  if (!token || token !== serviceKey) throw new CallerError('FORBIDDEN')
}

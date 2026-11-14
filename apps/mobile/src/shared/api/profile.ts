import { AppError, alternatePhoneSchema } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'
import type { Database } from '@/shared/api/database.types'

/**
 * The profile — the signed-in user's own row in `profiles`.
 *
 * The row is RLS-scoped to the owner (`id = auth.uid()`), so the client can
 * read exactly one row: its own. The `profiles` table is where the account
 * lifecycle lives:
 *
 *   disabled_at     the account was disabled by a moderator
 *   deleted_at      the account was soft-deleted by its owner
 *   pii_purged_at   the PII has been scrubbed and the row is a tombstone
 *
 * `disabled_at` is the one that matters at runtime. The database refuses a
 * disabled account's writes (migration 019), so the app must not pretend
 * otherwise: the session has to notice the disable and stop.
 */

export type ProfileRow = Database['public']['Tables']['profiles']['Row']

/**
 * Loads the signed-in user's profile row.
 *
 * A missing row means the signup trigger did not run — treated as a
 * validation failure rather than an internal error so the user can retry.
 */
export async function loadProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error) throw fromSupabaseError(error)
  if (!data) throw new AppError('NOT_FOUND')
  return data
}

/**
 * Reads only the lifecycle columns.
 *
 * The session gate needs to know **whether the account is disabled** and
 * nothing else, and it needs to know it cheaply and often — on every session
 * resume, every app foreground. Selecting three columns instead of the whole
 * row keeps that cheap, and keeps the PII columns out of the memory of a
 * screen that does not need them.
 */
export async function loadAccountStatus(userId: string): Promise<{
  disabled: boolean
  deleted: boolean
  disabledAt: string | null
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('disabled_at, deleted_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw fromSupabaseError(error)

  // No profile row: the account has no lifecycle state to report. The signup
  // trigger creates the row, so this is either a fresh account or a purged
  // tombstone whose `deleted_at` was already cleared. Either way, the account
  // is not disabled.
  if (!data) {
    return { disabled: false, deleted: false, disabledAt: null }
  }

  return {
    disabled: Boolean(data.disabled_at),
    deleted: Boolean(data.deleted_at),
    disabledAt: data.disabled_at,
  }
}

/**
 * Writes the user's own display and preference columns.
 *
 * Only the client-owned columns are writable: `full_name`, `alternate_phone`,
 * `locale`, `theme`, `biometric_opt_in`. The lifecycle columns are
 * server-managed, and the database refuses a client that tries — with
 * `PROFILE_LIFECYCLE_IS_SERVER_MANAGED`.
 */
export async function updateProfile(
  userId: string,
  changes: Partial<
    Pick<ProfileRow, 'full_name' | 'alternate_phone' | 'locale' | 'theme' | 'biometric_opt_in'>
  >,
): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', userId)
    .select('*')
    .maybeSingle()

  if (error) throw fromSupabaseError(error)
  if (!data) throw new AppError('NOT_FOUND')
  return data
}

/**
 * Sets the alternate phone.
 *
 * The value is normalised to E.164 **before** it is written, because the
 * database now enforces that shape with a CHECK constraint (migration 020).
 * Normalising on the client means the app never triggers a constraint
 * violation it could have avoided, and the value that lands is the value
 * every reader expects.
 *
 * An empty value clears the column — the alternate phone is optional, and
 * the user must be able to remove one they no longer want shared.
 *
 * The number is **not** unique. Two accounts may hold the same alternate
 * number: a shared family number is a legitimate thing for two people to
 * list, and the story's edge-case table says so explicitly. Nothing here
 * checks for a duplicate, and nothing in the database should.
 */
export async function setAlternatePhone(userId: string, value: string | null): Promise<void> {
  const trimmed = value?.trim() ?? ''

  if (!trimmed) {
    await updateProfile(userId, { alternate_phone: null })
    return
  }

  const parsed = alternatePhoneSchema.safeParse(trimmed)
  if (!parsed.success) {
    // A number that is not a valid Bangladesh number never reaches the
    // server — the CHECK constraint would refuse it, and a typed failure
    // tells the user which field is wrong.
    throw new AppError('VALIDATION_FAILED')
  }

  await updateProfile(userId, { alternate_phone: parsed.data })
}

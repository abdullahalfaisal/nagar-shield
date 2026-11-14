import { AppError } from '@nagar-shield/shared'
import { supabase } from '@/shared/api/supabase'
import { fromSupabaseError } from '@/shared/api/errors'

/**
 * The account lifecycle — soft delete and restore.
 *
 * The `profiles` lifecycle columns are server-managed: a client cannot write
 * `deleted_at` or `pii_purged_at` itself (the database refuses it with
 * `PROFILE_LIFECYCLE_IS_SERVER_MANAGED`). The lifecycle is therefore driven
 * by the two RPCs, which are the only sanctioned path.
 *
 * **A disabled account can still delete itself.** The database guard added in
 * migration 019 deliberately leaves `soft_delete_account` and
 * `restore_account` reachable for a disabled account: a disable is a
 * moderation action, and the user must still be able to ask for their own
 * data to be removed. Guarding these would make the disable a permanent
 * imprisonment with no exit.
 */

export interface AccountDeletionResult {
  /** The moment the account was soft-deleted. */
  deletedAt: string
  /** The last moment the account can be recovered. */
  recoverableUntil: string
}

/**
 * Soft-deletes the signed-in account.
 *
 * The data is kept for the recovery window and then permanently removed by
 * the PII purge job. The RPC is idempotent: deleting an already-deleted
 * account returns the original timestamp rather than moving the window.
 */
export async function softDeleteAccount(): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc('soft_delete_account')

  if (error) throw fromSupabaseError(error)

  const result = (data ?? {}) as { deleted_at?: string; recoverable_until?: string }

  if (!result.deleted_at) {
    throw new AppError('INTERNAL')
  }

  return {
    deletedAt: result.deleted_at,
    recoverableUntil:
      result.recoverable_until ??
      new Date(new Date(result.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

/**
 * Restores a soft-deleted account.
 *
 * The RPC raises `CONFLICT` when there is nothing to restore — the account
 * is not deleted.
 */
export async function restoreAccount(): Promise<void> {
  const { error } = await supabase.rpc('restore_account')

  if (error) {
    // The RPC raises `CONFLICT` (23505) when the account is not deleted.
    if (error.code === '23505') {
      throw new AppError('CONFLICT')
    }
    throw fromSupabaseError(error)
  }
}

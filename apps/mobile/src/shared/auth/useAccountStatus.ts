import { useCallback, useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { supabase } from '@/shared/api/supabase'
import { loadAccountStatus } from '@/shared/api/profile'

/**
 * The account's lifecycle status, as the app sees it.
 *
 * `disabled` is the important one. A moderator can disable an account at any
 * time, and the session may already be open on the user's device. The
 * database refuses a disabled account's writes (migration 019), so the app
 * has to learn about the disable and stop pretending the account works.
 *
 * The check runs on three triggers:
 *
 *   1. the session first appears — a fresh sign-in, or a cold start with a
 *      persisted session;
 *   2. the app returns to the foreground — a disable that landed while the
 *      phone was in a pocket must take effect;
 *   3. an explicit refresh — after the user changes something.
 *
 * A network failure is **not** a disable. The status stays `unknown` and the
 * app carries on: refusing a user because the network is down would be
 * worse than letting them try and see the database's refusal.
 */

export type AccountStatus = 'unknown' | 'active' | 'disabled' | 'deleted'

export interface AccountStatusState {
  status: AccountStatus
  /** The moment the account was disabled, when it is known. */
  disabledAt: string | null
  /**
   * The last moment a soft-deleted account can be restored, when it is known.
   *
   * The recovery screen needs this: the 30-day window is the promise the user
   * was given, and a screen that cannot say when it ends cannot tell the user
   * whether they still have a choice. It is `null` for every account that is
   * not deleted.
   */
  recoverableUntil: string | null
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * Watches the account's lifecycle for the signed-in user.
 *
 * The hook does nothing while there is no session — there is no account to
 * check yet.
 */
export function useAccountStatus(userId: string | undefined): AccountStatusState {
  const [status, setStatus] = useState<AccountStatus>('unknown')
  const [disabledAt, setDisabledAt] = useState<string | null>(null)
  const [recoverableUntil, setRecoverableUntil] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus('unknown')
      setDisabledAt(null)
      setRecoverableUntil(null)
      return
    }

    setLoading(true)
    try {
      const account = await loadAccountStatus(userId)
      setDisabledAt(account.disabledAt)
      setRecoverableUntil(account.recoverableUntil)
      if (account.disabled) {
        setStatus('disabled')
      } else if (account.deleted) {
        setStatus('deleted')
      } else {
        setStatus('active')
      }
    } catch {
      // The check failed. The status stays as it was — an unknown status is
      // not a disable, and the database is the authority that refuses a
      // disabled account's writes anyway.
    } finally {
      setLoading(false)
    }
  }, [userId])

  // (1) The session appears, or the user id changes.
  useEffect(() => {
    if (!userId) {
      setStatus('unknown')
      setDisabledAt(null)
      setRecoverableUntil(null)
      return
    }
    void refresh()
  }, [userId, refresh])

  // (2) The app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void refresh()
      }
    })

    return () => {
      subscription.remove()
    }
  }, [refresh])

  return { status, disabledAt, recoverableUntil, loading, refresh }
}

/**
 * Signs a disabled account out of the local session.
 *
 * The **server-side** session is not revoked — the account is disabled, not
 * deleted, and a moderator may re-enable it. Revoking the refresh token
 * would sign the user out on every device permanently, which is a stronger
 * action than the disable calls for.
 *
 * The local session is cleared so the app stops offering writes the database
 * will refuse.
 */
export async function endDisabledSession(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
}

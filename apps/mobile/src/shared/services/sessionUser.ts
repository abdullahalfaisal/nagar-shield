import { supabase } from '@/shared/api/supabase'

/**
 * The id of the signed-in user, or `null` when there is no session.
 *
 * The offline queue is scoped to this id: a queued report records who made it,
 * and only that person's session may send it.
 */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}

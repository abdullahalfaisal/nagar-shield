import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/shared/api/supabase'

interface AuthSessionState {
  session: Session | null
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * Tracks the Supabase auth session.
 *
 * The session is the single source of truth for "is this person signed in".
 * The profile row is loaded separately by `useProfile` once a session exists.
 */
export function useAuthSession(): AuthSessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  return { session, loading, refresh }
}

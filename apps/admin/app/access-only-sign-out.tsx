'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * The way out of the "moderator access only" state.
 *
 * A signed-in account without moderation permission had nowhere to go: the
 * card said so and stopped, and the only route back was typing `/login` into
 * the address bar. This button ends the session and opens the sign-in page, so
 * a moderator who signed in with the wrong account can use the right one.
 *
 * It is the only client code the access-only state carries, and it is a
 * separate module so the card itself stays a server-rendered surface.
 */
export function AccessOnlySignOut() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await getBrowserClient().auth.signOut()
    } finally {
      router.replace('/login')
    }
  }, [router])

  return (
    <button
      type="button"
      className="button buttonSecondary"
      onClick={() => void signOut()}
      disabled={signingOut}
    >
      {copy.signOut}
    </button>
  )
}

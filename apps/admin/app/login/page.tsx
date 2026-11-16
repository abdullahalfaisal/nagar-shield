'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppError } from '@nagar-shield/shared'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { getBrowserClient } from '@/lib/supabase/client'
import { AccessOnlyState } from '@/app/access-only-state'

/**
 * The moderator sign-in.
 *
 * Email + password only — no phone resolution, no biometric, no OTP reset
 * flow, no "Remember me". It is a browser session against the **same** Supabase
 * Auth project the citizen app uses, so a moderator is an ordinary
 * `auth.users` row with `profiles.role = 'moderator'`.
 *
 * The role is read **after** the sign-in; a citizen who signs in successfully
 * is told they have no moderation access and every subsequent call still
 * returns `FORBIDDEN` from the server.
 */

export default function LoginPage() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accessOnly, setAccessOnly] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const client = getBrowserClient()
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError(copy.errorAuthRequired)
        return
      }

      const { data: sessionData } = await client.auth.getSession()
      const userId = sessionData.session?.user.id

      if (!userId) {
        setError(copy.errorAuthRequired)
        return
      }

      const { data: profile } = await client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (!profile || profile.role !== 'moderator') {
        // The citizen is signed in but has no moderation access. The console
        // shows the access-only state rather than pretending the sign-in
        // failed — and the server refuses every call regardless.
        //
        // The state is **rendered here**, not routed to: routing to the queue
        // would land the citizen on a screen that fails with FORBIDDEN and
        // shows a generic error, which says nothing about why.
        setAccessOnly(true)
        return
      }

      router.replace('/queue')
    } catch (caught) {
      const code = caught instanceof AppError ? caught.code : 'INTERNAL'
      setError(
        code === 'AUTH_REQUIRED'
          ? copy.errorAuthRequired
          : code === 'VALIDATION_FAILED'
            ? copy.errorValidation
            : copy.errorGeneric,
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (accessOnly) {
    return <AccessOnlyState />
  }

  return (
    <main className="main">
      <div className="page narrow">
        <form className="card stack" onSubmit={handleSubmit}>
          <img src="/brand/app-icon-128.png" alt="" width={56} height={56} className="loginMark" />
          <h1 className="pageTitle">{copy.loginTitle}</h1>
          <p className="pageSubtitle">{copy.loginSubtitle}</p>

          {error ? (
            <div className="banner bannerDanger" role="alert">
              {error}
            </div>
          ) : null}

          <div>
            <label className="fieldLabel" htmlFor="moderator-email">
              {copy.loginEmail}
            </label>
            <input
              id="moderator-email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="fieldLabel" htmlFor="moderator-password">
              {copy.loginPassword}
            </label>
            <input
              id="moderator-password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button type="submit" className="button buttonPrimary buttonFull" disabled={submitting}>
            {submitting ? copy.loginSubmitting : copy.loginSubmit}
          </button>
        </form>
      </div>
    </main>
  )
}

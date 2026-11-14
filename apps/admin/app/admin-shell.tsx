'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { getBrowserClient } from '@/lib/supabase/client'

/**
 * The admin shell — the rail plus the page.
 *
 * The shell renders **only** for a moderator. The role check happens in
 * `ModeratorGate` — a server component that reads the cookie-backed session
 * before the console's client bundle mounts — so a non-moderator never
 * reaches this component at all. The real enforcement is still server-side:
 * every RPC and Edge Function re-checks the role.
 */

interface AdminShellProps {
  children: React.ReactNode
  active: 'queue' | 'users' | 'audit'
}

export function AdminShell({ children, active }: AdminShellProps) {
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
    <div className="shell">
      <nav className="rail" aria-label={copy.appTagline}>
        <div className="railBrand">{copy.appName}</div>
        <div className="railTagline">{copy.appTagline}</div>

        <Link
          href="/queue"
          className={`railLink${active === 'queue' ? ' railLinkActive' : ''}`}
          aria-current={active === 'queue' ? 'page' : undefined}
        >
          {copy.navQueue}
        </Link>
        <Link
          href="/users"
          className={`railLink${active === 'users' ? ' railLinkActive' : ''}`}
          aria-current={active === 'users' ? 'page' : undefined}
        >
          {copy.navUsers}
        </Link>
        <Link
          href="/audit"
          className={`railLink${active === 'audit' ? ' railLinkActive' : ''}`}
          aria-current={active === 'audit' ? 'page' : undefined}
        >
          {copy.navAudit}
        </Link>

        <div className="railSpacer" />

        <button
          type="button"
          className="railSignOut"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          {copy.signOut}
        </button>
      </nav>

      <main className="main">{children}</main>
    </div>
  )
}

/**
 * The page header.
 *
 * Every route uses the same header shape so the console reads as one tool.
 */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="pageHeader">
      <h1 className="pageTitle">{title}</h1>
      <p className="pageSubtitle">{subtitle}</p>
    </header>
  )
}

/**
 * The error banner.
 *
 * The console switches on the stable error code and renders a localized
 * string. The raw driver message never reaches the screen.
 */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="banner bannerDanger" role="alert">
      {message}
    </div>
  )
}

/**
 * The empty state.
 *
 * An explicit render — never a blank container, never a spinner that never
 * resolves.
 */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card emptyState">
      <h2 className="emptyTitle">{title}</h2>
      <p className="emptyBody">{body}</p>
    </div>
  )
}

/**
 * The loading skeleton.
 *
 * The queue's first page targets under 2 s on a warm session, so the
 * placeholder has to look like the row it replaces.
 */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" />
      ))}
    </div>
  )
}

/**
 * Applies the stored theme to the document.
 *
 * The console follows the same default as the mobile app — dark — and the
 * choice is kept in `localStorage` so a moderator's preference survives a
 * reload.
 */
export function useConsoleTheme(): void {
  useEffect(() => {
    const stored = window.localStorage.getItem('nagar-shield.admin.theme')
    const theme = stored === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])
}

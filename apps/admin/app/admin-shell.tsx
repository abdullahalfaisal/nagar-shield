'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { useModerationQueue } from '@/lib/queries'
import { getBrowserClient } from '@/lib/supabase/client'

interface AdminShellProps {
  children: React.ReactNode
  active: 'queue' | 'feed' | 'declined' | 'numbers' | 'users' | 'audit'
}

const ICONS = {
  queue: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  feed: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  audit: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  declined: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </>
  ),
  numbers: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  signOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </>
  ),
}

function NavIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      className="railIcon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

export function AdminShell({ children, active }: AdminShellProps) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  // The pending count on the review queue reads the queue's own cache, so it
  // costs no extra request once the queue has loaded.
  const queue = useModerationQueue()
  const pending = (queue.data?.pages ?? []).reduce((total, page) => total + page.items.length, 0)
  const pendingLabel = queue.hasNextPage ? `${pending}+` : String(pending)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const result = await getBrowserClient().auth.getSession()
        if (mounted) setEmail(result?.data?.session?.user?.email ?? null)
      } catch {
        // The email is a nicety; the shell works without it.
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const signOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await getBrowserClient().auth.signOut()
    } finally {
      router.replace('/login')
    }
  }, [router])

  const groups: {
    label: string
    items: { key: AdminShellProps['active']; href: string; label: string; badge?: string }[]
  }[] = [
    {
      label: copy.navGroupModeration,
      items: [
        {
          key: 'queue',
          href: '/queue',
          label: copy.navQueue,
          badge: pending > 0 ? pendingLabel : undefined,
        },
        { key: 'feed', href: '/feed', label: copy.navFeed },
        { key: 'declined', href: '/declined', label: copy.navDeclined },
      ],
    },
    {
      label: copy.navGroupHelp,
      items: [{ key: 'numbers', href: '/numbers', label: copy.navNumbers }],
    },
    { label: copy.navGroupPeople, items: [{ key: 'users', href: '/users', label: copy.navUsers }] },
    {
      label: copy.navGroupRecords,
      items: [{ key: 'audit', href: '/audit', label: copy.navAudit }],
    },
  ]

  return (
    <div className="shell">
      <nav className="rail" aria-label={copy.appTagline}>
        <div className="railHead">
          <img src="/brand/app-icon-128.png" alt="" width={36} height={36} className="railMark" />
          <div>
            <div className="railBrand">{copy.appName}</div>
            <div className="railTagline">{copy.appTagline}</div>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.label} className="railGroup">
            <div className="railGroupLabel">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`railLink${active === item.key ? ' railLinkActive' : ''}`}
                aria-current={active === item.key ? 'page' : undefined}
              >
                <NavIcon name={item.key} />
                <span className="grow">{item.label}</span>
                {item.badge ? <span className="railBadge">{item.badge}</span> : null}
              </Link>
            ))}
          </div>
        ))}

        <div className="railSpacer" />

        <div className="railFoot">
          {email ? <div className="railUser">{email}</div> : null}
          <button
            type="button"
            className="railSignOut"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            <NavIcon name="signOut" />
            {copy.signOut}
          </button>
        </div>
      </nav>

      <main className="main">{children}</main>
    </div>
  )
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="pageHeader">
      <h1 className="pageTitle">{title}</h1>
      <p className="pageSubtitle">{subtitle}</p>
    </header>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="banner bannerDanger" role="alert">
      {message}
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card emptyState">
      <h2 className="emptyTitle">{title}</h2>
      <p className="emptyBody">{body}</p>
    </div>
  )
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" />
      ))}
    </div>
  )
}

export function useConsoleTheme(): void {
  useEffect(() => {
    const stored = window.localStorage.getItem('nagar-shield.admin.theme')
    const theme = stored === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])
}

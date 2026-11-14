import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

/**
 * The console's root layout.
 *
 * Dark is the default — the prototype's `restoreTheme()` sets
 * `data-theme="dark"` on load, and the token layer mirrors that.
 *
 * `Providers` is the client boundary: it owns the query client, so the
 * layout itself stays a server component.
 */

export const metadata: Metadata = {
  title: 'Nagar Shield — Moderation console',
  description: 'Internal moderation console for Nagar Shield. Moderator access only.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" data-theme="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

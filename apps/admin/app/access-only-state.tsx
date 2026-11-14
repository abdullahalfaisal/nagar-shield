import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'

/**
 * The "moderator access only" state.
 *
 * It is rendered in **three** places, and they share this one component so
 * the three cannot drift:
 *
 *   * the login page, when a citizen signs in successfully but is not a
 *     moderator — the sign-in worked, and the account simply has no
 *     moderation access;
 *   * the moderator gate, when a signed-in non-moderator reaches a console
 *     route — the gate reads the role before the console mounts;
 *   * the shell, for a role that changes mid-session.
 *
 * The server refuses every read and every write regardless of what this
 * shows. It is a courtesy surface, and the copy says exactly that: the
 * account is signed in, it just has no moderation permission.
 *
 * It lives in its own module — not in `admin-shell.tsx` — so that the
 * access-only path does not pull the rail and its sign-out handler into the
 * bundle. The gate renders this on the server, before any console code runs.
 */
export function AccessOnlyState() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)

  return (
    <main className="main">
      <div className="page">
        <div className="card emptyState">
          <h1 className="emptyTitle">{copy.accessOnlyTitle}</h1>
          <p className="emptyBody">{copy.accessOnlyBody}</p>
        </div>
      </div>
    </main>
  )
}

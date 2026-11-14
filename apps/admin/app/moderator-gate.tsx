import { readModeratorRole } from '@/lib/supabase/server'
import { AccessOnlyState } from '@/app/access-only-state'

/**
 * The moderator gate.
 *
 * A server component that reads the caller's role **before** the console's
 * client bundle ever runs, and refuses a non-moderator.
 *
 * Why this exists
 * ---------------
 * `readModeratorRole()` was written and never called. Every console page
 * passed a **literal** `role="moderator"` to `<AdminShell>`, so the shell's
 * own role guard was dead code — a citizen who reached `/queue` saw the
 * generic `FORBIDDEN` banner from the server instead of the "moderator access
 * only" state. The server was right the whole time; the console simply never
 * asked.
 *
 * Why it is a server component
 * ----------------------------
 * The role lives in the **cookie-backed session**, and only a Server
 * Component can read it through `@supabase/ssr` before the page renders. A
 * client component would read the role after the first paint, which means the
 * console's shell — and every query it fires — would already be on screen.
 *
 * This is still only a **courtesy surface**. The server re-checks the role
 * inside every RPC and every Edge Function, so a forged or stale role grants
 * nothing: the reads and the writes are refused regardless. What this
 * component prevents is the console *rendering* as though a citizen had
 * business here.
 *
 * The three outcomes
 * ------------------
 *
 *   * **moderator** — the console renders.
 *   * **citizen** or **no session** — the access-only state renders, and the
 *     client bundle is never mounted, so no query is fired at all.
 *
 * A signed-out visitor gets the access-only state too, rather than a console
 * that fires requests nobody is authorized to make.
 */

interface ModeratorGateProps {
  children: React.ReactNode
}

export async function ModeratorGate({ children }: ModeratorGateProps) {
  const role = await readModeratorRole()

  if (role !== 'moderator') {
    return <AccessOnlyState />
  }

  return <>{children}</>
}

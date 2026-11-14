import { ModeratorGate } from '@/app/moderator-gate'
import { AuditClient } from '@/app/audit/audit-client'

/**
 * The audit trail route.
 *
 * A server component that gates the console: the caller's role is read from
 * the cookie-backed session **before** the client bundle mounts, so a
 * non-moderator gets the access-only state and no trail row is ever fetched.
 *
 * The screen itself lives in `audit-client.tsx`.
 */
export default function AuditPage() {
  return (
    <ModeratorGate>
      <AuditClient />
    </ModeratorGate>
  )
}

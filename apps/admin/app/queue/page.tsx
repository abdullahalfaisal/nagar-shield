import { ModeratorGate } from '@/app/moderator-gate'
import { QueueClient } from '@/app/queue/queue-client'

/**
 * The moderation queue route.
 *
 * A server component that gates the console: the caller's role is read from
 * the cookie-backed session **before** the client bundle mounts, so a
 * non-moderator gets the access-only state and the queue's query is never
 * fired.
 *
 * The list itself lives in `queue-client.tsx`.
 */
export default function QueuePage() {
  return (
    <ModeratorGate>
      <QueueClient />
    </ModeratorGate>
  )
}

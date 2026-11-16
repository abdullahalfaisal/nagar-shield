import { ModeratorGate } from '@/app/moderator-gate'
import { DeclinedClient } from '@/app/declined/declined-client'

/** The declined reports route: reports declined in the last 7 days, with Undo. */
export default function DeclinedPage() {
  return (
    <ModeratorGate>
      <DeclinedClient />
    </ModeratorGate>
  )
}

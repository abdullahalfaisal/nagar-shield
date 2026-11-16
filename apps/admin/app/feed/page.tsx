import { ModeratorGate } from '@/app/moderator-gate'
import { FeedClient } from '@/app/feed/feed-client'

/** The public feed route: the reports people can see right now. */
export default function FeedPage() {
  return (
    <ModeratorGate>
      <FeedClient />
    </ModeratorGate>
  )
}

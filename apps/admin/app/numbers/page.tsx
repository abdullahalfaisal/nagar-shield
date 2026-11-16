import { ModeratorGate } from '@/app/moderator-gate'
import { NumbersClient } from '@/app/numbers/numbers-client'

/** The wrong-number reports route. */
export default function NumbersPage() {
  return (
    <ModeratorGate>
      <NumbersClient />
    </ModeratorGate>
  )
}

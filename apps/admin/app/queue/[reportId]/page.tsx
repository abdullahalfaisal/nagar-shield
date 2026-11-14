import { ModeratorGate } from '@/app/moderator-gate'
import { ReportDetailClient } from '@/app/queue/[reportId]/report-detail-client'

/**
 * The report review detail route.
 *
 * A server component that gates the console: the caller's role is read from
 * the cookie-backed session **before** the client bundle mounts, so a
 * non-moderator gets the access-only state and the report's detail is never
 * fetched.
 *
 * The screen itself lives in `report-detail-client.tsx`.
 */
export default function ReportDetailPage() {
  return (
    <ModeratorGate>
      <ReportDetailClient />
    </ModeratorGate>
  )
}

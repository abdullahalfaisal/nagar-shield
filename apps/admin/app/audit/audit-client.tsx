'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError, type AuditAction } from '@/lib/api'
import { useAuditTrail } from '@/lib/queries'
import { formatDecisionLabel, formatTimestampShort } from '@/lib/format'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'

/**
 * The append-only action log.
 *
 * The trail is **read-only**: there is no edit affordance, no delete
 * affordance, and no undo. A correction is a **new row** — the earlier row
 * stays visible forever, because `moderation_actions` is append-only in the
 * database and a rewrite trigger rejects any mutation.
 *
 * The payload carries ids, the decision, the note, and the timestamp. It never
 * carries a report's coordinates, description, or media.
 */

type DecisionFilter =
  | 'all'
  | 'restore'
  | 'remove'
  | 'disable_user'
  | 'hide'
  | 'enable_user'
  | 'restore_account'
  | 'undo_remove'

export function AuditClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()

  const [filter, setFilter] = useState<DecisionFilter>('all')

  const trail = useAuditTrail(filter)
  const { data, error: queryError, isLoading, isFetchingNextPage, hasNextPage } = trail

  // An expired session is a redirect, not a message.
  useEffect(() => {
    if (!queryError) return
    if (toAppError(queryError).code === 'AUTH_REQUIRED') {
      router.replace('/login')
    }
  }, [queryError, router])

  const error = queryError
    ? (() => {
        const appError = toAppError(queryError)
        return appError.code === 'FORBIDDEN' ? copy.errorForbidden : copy.errorGeneric
      })()
    : null

  // Every page loaded so far, flattened. The rows are appended, never
  // replaced — the cursor guarantees no duplicate and no skipped row.
  const items: AuditAction[] = (data?.pages ?? []).flatMap((page) => page.items)

  return (
    <AdminShell active="audit">
      <div className="page">
        <PageHeader title={copy.auditTitle} subtitle={copy.auditSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          <div className="row">
            <label className="fieldLabel noMargin" htmlFor="audit-filter">
              {copy.auditFilterDecision}
            </label>
            <select
              id="audit-filter"
              className="select selectAuto"
              value={filter}
              onChange={(event) => setFilter(event.target.value as DecisionFilter)}
            >
              <option value="all">{copy.auditFilterAll}</option>
              <option value="restore">{copy.auditDecisionRestore}</option>
              <option value="remove">{copy.auditDecisionRemove}</option>
              <option value="disable_user">{copy.auditDecisionDisableUser}</option>
              <option value="enable_user">{copy.auditDecisionEnableUser}</option>
              <option value="hide">{copy.auditDecisionHide}</option>
              <option value="undo_remove">{copy.auditDecisionUndoRemove}</option>
              <option value="restore_account">{copy.auditDecisionRestoreAccount}</option>
            </select>
          </div>

          {isLoading ? <SkeletonList /> : null}

          {!isLoading && items.length === 0 ? (
            <EmptyState title={copy.auditEmptyTitle} body={copy.auditEmptyBody} />
          ) : null}

          {!isLoading && items.length > 0 ? (
            <div className="card cardFlush">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{copy.auditColumnTarget}</th>
                    <th scope="col">{copy.auditColumnModerator}</th>
                    <th scope="col">{copy.auditColumnDecision}</th>
                    <th scope="col">{copy.auditColumnNote}</th>
                    <th scope="col">{copy.auditColumnTimestamp}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((action) => (
                    <tr key={action.id}>
                      <td>{renderTarget(action, copy)}</td>
                      <td>
                        {action.moderatorId ? (
                          <span title={action.moderatorId}>
                            {action.moderatorDisplayName ?? action.moderatorId.slice(0, 8)}
                          </span>
                        ) : (
                          <span className="muted">{copy.auditModeratorDeleted}</span>
                        )}
                      </td>
                      <td>
                        <span className="chip">{formatDecisionLabel(action.decision)}</span>
                      </td>
                      <td className="tableNote">{action.note}</td>
                      <td>{formatTimestampShort(action.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!isLoading && items.length > 0 ? (
            hasNextPage ? (
              <button
                type="button"
                className="button buttonSecondary buttonStart"
                onClick={() => void trail.fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {copy.auditLoadMore}
              </button>
            ) : (
              <p className="muted">{copy.auditEnd}</p>
            )
          ) : null}
        </div>
      </div>
    </AdminShell>
  )
}

/**
 * The target cell.
 *
 * A `disable_user` row names the **target user id** (its `report_id` is
 * null); every other row names the report. A link resolves to the target's
 * **current** state — the trail itself carries no snapshot.
 */
function renderTarget(action: AuditAction, copy: ReturnType<typeof getCopy>) {
  if (action.reportId) {
    return (
      <Link href={`/queue/${action.reportId}`} className="link">
        {action.reportId.slice(0, 8)}
      </Link>
    )
  }

  if (action.targetUserId) {
    return <span title={action.targetUserId}>{action.targetUserId.slice(0, 8)}</span>
  }

  return <span className="muted">{copy.auditReportUnavailable}</span>
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReportCategory } from '@nagar-shield/shared'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError, type DeclinedReport } from '@/lib/api'
import { useDeclinedReports, useUndoDecline } from '@/lib/queries'
import { formatAreaLine, formatCategoryLabel, formatRelativeTime } from '@/lib/format'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'
import { ConfirmAction } from '@/app/confirm-action'

/** Reports declined in the last 7 days. Undo puts one back in the review queue. */
export function DeclinedClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()

  const { data, error: queryError, isLoading } = useDeclinedReports()

  useEffect(() => {
    if (queryError && toAppError(queryError).code === 'AUTH_REQUIRED') {
      router.replace('/login')
    }
  }, [queryError, router])

  const error = queryError
    ? toAppError(queryError).code === 'FORBIDDEN'
      ? copy.errorForbidden
      : copy.errorGeneric
    : null

  const items = data ?? []

  return (
    <AdminShell active="declined">
      <div className="page">
        <PageHeader title={copy.declinedTitle} subtitle={copy.declinedSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          {isLoading ? <SkeletonList /> : null}

          {!isLoading && !error && items.length === 0 ? (
            <EmptyState title={copy.declinedEmptyTitle} body={copy.declinedEmptyBody} />
          ) : null}

          {items.length > 0 ? (
            <div className="card cardFlush">
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.declinedColumnTime}</th>
                    <th>{copy.queueColumnCategory}</th>
                    <th>{copy.queueColumnArea}</th>
                    <th>{copy.queueColumnDescription}</th>
                    <th>{copy.queueColumnActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <DeclinedRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </AdminShell>
  )
}

function DeclinedRow({ item }: { item: DeclinedReport }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const undo = useUndoDecline()
  const [failed, setFailed] = useState(false)

  async function onUndo() {
    setFailed(false)
    try {
      await undo.mutateAsync({ reportId: item.id, note: copy.declinedDefaultNote })
    } catch {
      setFailed(true)
    }
  }

  return (
    <tr>
      <td className="nowrap">{formatRelativeTime(item.declinedAt)}</td>
      <td className="itemTitle">
        {formatCategoryLabel(item.category as ReportCategory | null) ?? copy.detailUncategorised}
      </td>
      <td>{formatAreaLine(item.areaHierarchy)}</td>
      <td className="tableNote">{item.description ?? '\u2014'}</td>
      <td>
        <ConfirmAction
          label={copy.declinedUndo}
          question={copy.declinedUndoConfirm}
          yesLabel={copy.declinedUndoYes}
          busy={undo.isPending}
          error={failed ? copy.errorGeneric : null}
          onConfirm={onUndo}
        />
      </td>
    </tr>
  )
}

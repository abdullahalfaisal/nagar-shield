'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { findHotline, findStation } from '@nagar-shield/shared'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError, type WrongNumberReport, type WrongNumberStatus } from '@/lib/api'
import { useResolveWrongNumber, useWrongNumbers } from '@/lib/queries'
import { formatRelativeTime } from '@/lib/format'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'

type Filter = WrongNumberStatus | 'all'

/** Wrong-number reports from the app. Mark one fixed once the number is corrected. */
export function NumbersClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('pending')

  const { data, error: queryError, isLoading } = useWrongNumbers(filter === 'all' ? null : filter)

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

  const filters: { key: Filter; label: string }[] = [
    { key: 'pending', label: copy.numbersFilterPending },
    { key: 'reviewed', label: copy.numbersFilterReviewed },
    { key: 'rejected', label: copy.numbersFilterRejected },
    { key: 'all', label: copy.numbersFilterAll },
  ]

  const items = data ?? []

  return (
    <AdminShell active="numbers">
      <div className="page">
        <PageHeader title={copy.numbersTitle} subtitle={copy.numbersSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          <div className="row rowWrap" role="group" aria-label={copy.numbersTitle}>
            {filters.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={filter === entry.key ? 'button buttonPrimary' : 'button buttonSecondary'}
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {isLoading ? <SkeletonList /> : null}

          {!isLoading && !error && items.length === 0 ? (
            <EmptyState title={copy.numbersEmptyTitle} body={copy.numbersEmptyBody} />
          ) : null}

          {items.length > 0 ? (
            <div className="card cardFlush">
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.queueColumnTime}</th>
                    <th>{copy.numbersColumnEntry}</th>
                    <th>{copy.numbersColumnReason}</th>
                    <th>{copy.numbersColumnStatus}</th>
                    <th>{copy.queueColumnActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <NumberRow key={item.id} item={item} />
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

function NumberRow({ item }: { item: WrongNumberReport }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const resolve = useResolveWrongNumber()
  const [failed, setFailed] = useState(false)

  // The names and numbers come from the same list the app ships.
  const entry = item.entryType === 'station' ? findStation(item.entryId) : findHotline(item.entryId)
  const typeLabel = item.entryType === 'station' ? copy.numbersStation : copy.numbersHotline

  async function set(status: WrongNumberStatus) {
    setFailed(false)
    try {
      await resolve.mutateAsync({ id: item.id, status })
    } catch {
      setFailed(true)
    }
  }

  const statusChip =
    item.status === 'pending' ? (
      <span className="chip chipWarning">{copy.numbersStatusPending}</span>
    ) : item.status === 'reviewed' ? (
      <span className="chip">{copy.numbersStatusReviewed}</span>
    ) : (
      <span className="chip chipMuted">{copy.numbersStatusRejected}</span>
    )

  return (
    <tr>
      <td className="nowrap">{formatRelativeTime(item.createdAt)}</td>
      <td>
        <div className="itemTitle">{entry?.name ?? copy.numbersUnknownEntry}</div>
        <div className="muted">
          {typeLabel}
          {entry ? ` \u00b7 ${entry.phone}` : ` \u00b7 ${item.entryId}`}
        </div>
      </td>
      <td className="tableNote">
        <div>{item.reason.replace(/_/g, ' ')}</div>
        {item.details ? <div className="muted">{item.details}</div> : null}
        {item.anonymous ? <div className="muted">{copy.numbersAnonymous}</div> : null}
      </td>
      <td>{statusChip}</td>
      <td>
        <div className="stackGapSm">
          {item.status === 'pending' ? (
            <div className="row rowWrap">
              <button
                type="button"
                className="button buttonPrimary"
                disabled={resolve.isPending}
                onClick={() => void set('reviewed')}
              >
                {copy.numbersMarkFixed}
              </button>
              <button
                type="button"
                className="button buttonSecondary"
                disabled={resolve.isPending}
                onClick={() => void set('rejected')}
              >
                {copy.numbersDismiss}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button buttonSecondary buttonStart"
              disabled={resolve.isPending}
              onClick={() => void set('pending')}
            >
              {copy.numbersReopen}
            </button>
          )}
          {failed ? <p className="error">{copy.errorGeneric}</p> : null}
        </div>
      </td>
    </tr>
  )
}

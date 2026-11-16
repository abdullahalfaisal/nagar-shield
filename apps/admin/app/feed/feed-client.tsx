'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReportCategory } from '@nagar-shield/shared'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError, type VisibleReport } from '@/lib/api'
import { useHideReport, useSubmitDecision, useVisibleReports } from '@/lib/queries'
import { formatAreaLine, formatCategoryLabel, formatRelativeTime } from '@/lib/format'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'
import { ConfirmAction } from '@/app/confirm-action'

/**
 * The public feed, as a moderator sees it. Any shown report can be hidden, and a
 * report hidden by hand can be shown again, all on this page.
 */
export function FeedClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()

  const feed = useVisibleReports()
  const { data, error: queryError, isLoading, isFetchingNextPage, hasNextPage } = feed

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

  const items: VisibleReport[] = (data?.pages ?? []).flatMap((page) => page.items)

  return (
    <AdminShell active="feed">
      <div className="page">
        <PageHeader title={copy.feedTitle} subtitle={copy.feedSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          {isLoading ? <SkeletonList /> : null}

          {!isLoading && items.length === 0 ? (
            <EmptyState title={copy.feedEmptyTitle} body={copy.feedEmptyBody} />
          ) : null}

          {items.length > 0 ? (
            <div className="card cardFlush">
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.queueColumnTime}</th>
                    <th>{copy.queueColumnCategory}</th>
                    <th>{copy.queueColumnArea}</th>
                    <th>{copy.queueColumnDescription}</th>
                    <th>{copy.feedColumnStatus}</th>
                    <th>{copy.queueColumnActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <FeedRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {items.length > 0 ? (
            hasNextPage ? (
              <button
                type="button"
                className="button buttonSecondary buttonStart"
                onClick={() => void feed.fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? copy.queueLoading : copy.queueLoadMore}
              </button>
            ) : (
              <p className="muted">{copy.queueEnd}</p>
            )
          ) : null}
        </div>
      </div>
    </AdminShell>
  )
}

function FeedRow({ item }: { item: VisibleReport }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const hide = useHideReport()
  const show = useSubmitDecision()
  const [failed, setFailed] = useState(false)

  async function onShow() {
    setFailed(false)
    try {
      await show.mutateAsync({
        reportId: item.id,
        decision: 'restore',
        note: copy.feedDefaultShowNote,
      })
    } catch {
      setFailed(true)
    }
  }

  async function onHide() {
    setFailed(false)
    try {
      await hide.mutateAsync({ reportId: item.id, note: copy.feedDefaultNote })
    } catch {
      setFailed(true)
    }
  }

  return (
    <tr>
      <td className="nowrap">{formatRelativeTime(item.capturedAt)}</td>
      <td className="itemTitle">
        {formatCategoryLabel(item.category as ReportCategory | null) ?? copy.detailUncategorised}
      </td>
      <td>{formatAreaLine(item.areaHierarchy)}</td>
      <td className="tableNote">{item.description ?? '—'}</td>
      <td>
        {item.hidden ? (
          <span className="chip chipWarning">{copy.feedStatusHidden}</span>
        ) : (
          <span className="chip">{copy.feedStatusShown}</span>
        )}
      </td>
      <td>
        {item.hidden ? (
          <div className="stackGapSm">
            <button
              type="button"
              className="button buttonPrimary buttonStart"
              disabled={show.isPending}
              onClick={() => void onShow()}
            >
              {copy.feedShow}
            </button>
            {failed ? <p className="error">{copy.errorGeneric}</p> : null}
          </div>
        ) : (
          <ConfirmAction
            label={copy.feedHide}
            question={copy.feedHideConfirm}
            yesLabel={copy.feedHideYes}
            busy={hide.isPending}
            error={failed ? copy.errorGeneric : null}
            onConfirm={onHide}
          />
        )}
      </td>
    </tr>
  )
}

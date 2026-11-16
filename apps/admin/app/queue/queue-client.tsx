'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError, type QueueItem } from '@/lib/api'
import { useModerationQueue } from '@/lib/queries'
import {
  authorAutoHideBadge,
  formatAreaLine,
  formatCategoryLabel,
  formatHideReason,
  formatRelativeTime,
  isInAuthorAutoHideGroup,
  type QueueGroup,
} from '@/lib/format'
import type { ReportCategory } from '@nagar-shield/shared'
import { DecisionButtons } from '@/app/decision-buttons'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'

/**
 * The moderation queue.
 *
 * The list shows the `hidden_pending_review` reports only — the server filters
 * on `moderation_status`, so a `visible` / `restored` / `removed` report can
 * never appear here even if the filter were removed from the client.
 *
 * The uploader is shown as a **masked** handle. The full identity lives on the
 * review detail, which the moderator opens deliberately.
 *
 * The author-auto-hide group
 * --------------------------
 * The queue has two groups: **all pending**, and **author auto-hidden** — the
 * slice where the report's *author* was auto-hidden (5 distinct flagged
 * reports in 24 h) rather than the report itself reaching 3 flags.
 *
 * The group is a **client-side slice over the same page** — the same rows, the
 * same cursor, the same pagination. It adds no rows to the schema and it
 * invents no second read model. A moderator's own read writes nothing.
 *
 * There is **no bulk action** in either group: no "restore all", no "remove
 * all", no multi-select, and no shared note. Every report is restored or
 * removed on its own, through `moderation_decide`, with its own required note.
 * A shared note across N reports would make the required note meaningless, and
 * one click writing N audit rows is exactly the shape the append-only trail
 * cannot describe.
 */

export function QueueClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()

  const [group, setGroup] = useState<QueueGroup>('all')

  const queue = useModerationQueue()
  const { data, error: queryError, isLoading, isFetchingNextPage, hasNextPage } = queue

  // An expired session is a redirect, not a message. The code is preserved
  // because the query function normalises every throw to an AppError.
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
  // Reports a moderator hid by hand are managed on the Public feed page.
  const items: QueueItem[] = (data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => item.hideReason !== 'manual')

  // The group is a slice over the rows already loaded. It never issues a
  // second request — the server returned one page and the group narrows it.
  const visibleItems =
    group === 'author_auto_hide'
      ? items.filter((item) => isInAuthorAutoHideGroup(item.hideReason))
      : items

  return (
    <AdminShell active="queue">
      <div className="page">
        <PageHeader title={copy.queueTitle} subtitle={copy.queueSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          {/*
            The group filter. It is a **label**, not an action: it narrows the
            rows already on screen and never writes anything.
          */}
          <div className="row rowWrap" role="group" aria-label={copy.queueGroupAll}>
            <button
              type="button"
              className={group === 'all' ? 'button buttonPrimary' : 'button buttonSecondary'}
              aria-pressed={group === 'all'}
              onClick={() => setGroup('all')}
            >
              {copy.queueGroupAll}
            </button>
            <button
              type="button"
              className={
                group === 'author_auto_hide' ? 'button buttonPrimary' : 'button buttonSecondary'
              }
              aria-pressed={group === 'author_auto_hide'}
              onClick={() => setGroup('author_auto_hide')}
            >
              {copy.queueGroupAuthorAutoHide}
            </button>
          </div>

          {isLoading ? <SkeletonList /> : null}

          {!isLoading && items.length === 0 ? (
            <EmptyState title={copy.queueEmptyTitle} body={copy.queueEmptyBody} />
          ) : null}

          {!isLoading && items.length > 0 && visibleItems.length === 0 ? (
            <EmptyState title={copy.queueGroupEmptyTitle} body={copy.queueGroupEmptyBody} />
          ) : null}

          {visibleItems.length > 0 ? (
            <div className="card cardFlush">
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.queueColumnTime}</th>
                    <th>{copy.queueColumnCategory}</th>
                    <th>{copy.queueColumnArea}</th>
                    <th>{copy.queueColumnDescription}</th>
                    <th>{copy.queueColumnFlags}</th>
                    <th>{copy.queueColumnReason}</th>
                    <th>{copy.queueColumnActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <QueueRow key={item.id} item={item} />
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
                onClick={() => void queue.fetchNextPage()}
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

/** One queue row. The whole row opens the report; the category is the real link. */
function QueueRow({ item }: { item: QueueItem }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()
  const badge = authorAutoHideBadge(item.hideReason)
  const href = `/queue/${item.id}`

  return (
    <tr className="rowLink" onClick={() => router.push(href)}>
      <td className="nowrap">{formatRelativeTime(item.capturedAt)}</td>
      <td>
        <Link href={href} className="itemTitle" onClick={(event) => event.stopPropagation()}>
          {formatCategoryLabel(item.category as ReportCategory | null) ?? copy.detailUncategorised}
        </Link>
      </td>
      <td>{formatAreaLine(item.areaHierarchy)}</td>
      <td className="tableNote">{item.description ?? '—'}</td>
      <td>{item.flagCount}</td>
      <td>
        {badge
          ? badge === 'both'
            ? copy.queueBadgeBoth
            : copy.queueBadgeAuthorAutoHide
          : formatHideReason(item.hideReason)}
      </td>
      <td onClick={(event) => event.stopPropagation()}>
        <DecisionButtons reportId={item.id} />
      </td>
    </tr>
  )
}

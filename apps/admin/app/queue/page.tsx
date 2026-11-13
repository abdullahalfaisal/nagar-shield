'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import {
  fetchModerationQueue,
  getBrowserClient,
  toAppError,
  type QueueItem,
} from '@/lib/api';
import {
  authorAutoHideBadge,
  formatAreaLine,
  formatCategoryLabel,
  formatHideReason,
  formatRelativeTime,
  isInAuthorAutoHideGroup,
  maskUploaderIdentity,
  type QueueGroup,
} from '@/lib/format';
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell';

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

const PAGE_SIZE = 20;

export default function QueuePage() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);
  const router = useRouter();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<QueueGroup>('all');

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const page = await fetchModerationQueue(getBrowserClient(), { limit: PAGE_SIZE });
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === 'AUTH_REQUIRED') {
        router.replace('/login');
        return;
      }
      setError(appError.code === 'FORBIDDEN' ? copy.errorForbidden : copy.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [copy.errorForbidden, copy.errorGeneric, router]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const page = await fetchModerationQueue(getBrowserClient(), {
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      // The rows are appended, never replaced — the cursor guarantees no
      // duplicate and no skipped row.
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      const appError = toAppError(caught);
      setError(appError.code === 'AUTH_REQUIRED' ? copy.errorAuthRequired : copy.errorGeneric);
    } finally {
      setLoadingMore(false);
    }
  }, [copy.errorAuthRequired, copy.errorGeneric, loadingMore, nextCursor]);

  // The group is a slice over the rows already loaded. It never issues a
  // second request — the server returned one page and the group narrows it.
  const visibleItems =
    group === 'author_auto_hide'
      ? items.filter((item) => isInAuthorAutoHideGroup(item.hideReason))
      : items;

  return (
    <AdminShell active="queue" role="moderator">
      <div className="page">
        <PageHeader title={copy.queueTitle} subtitle={copy.queueSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          {/*
            The group filter. It is a **label**, not an action: it narrows the
            rows already on screen and never writes anything.
          */}
          <div
            className="row"
            role="group"
            aria-label={copy.queueGroupAll}
            style={{ flexWrap: 'wrap', gap: 8 }}
          >
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

          {loading ? <SkeletonList /> : null}

          {!loading && items.length === 0 ? (
            <EmptyState title={copy.queueEmptyTitle} body={copy.queueEmptyBody} />
          ) : null}

          {!loading && items.length > 0 && visibleItems.length === 0 ? (
            <EmptyState title={copy.queueGroupEmptyTitle} body={copy.queueGroupEmptyBody} />
          ) : null}

          {visibleItems.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}

          {!loading && items.length > 0 ? (
            nextCursor ? (
              <button
                type="button"
                className="button buttonSecondary"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{ alignSelf: 'flex-start' }}
              >
                {loadingMore ? copy.queueLoading : copy.queueLoadMore}
              </button>
            ) : (
              <p className="muted">{copy.queueEnd}</p>
            )
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}

/**
 * One queue row.
 *
 * It reuses the mobile alert card's visual pattern: a category accent tile,
 * the area / category / description / time lines, the 14 px radius, and the
 * card shadow. It is a **derived** layout, not a port of a prototype screen.
 */
function QueueRow({ item }: { item: QueueItem }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);

  const categoryLabel = formatCategoryLabel(item.category as never);
  const areaLine = formatAreaLine(item.areaHierarchy);
  const uploader = item.uploader
    ? maskUploaderIdentity({
        fullName: item.uploader.fullName,
        phone: item.uploader.phone,
      })
    : '—';

  const flagReasons = Array.from(new Set(item.flags.map((flag) => flag.reason)));

  // The badge the server's `hide_reason` earned. `null` for a report that
  // reached its own 3-flag threshold on its own.
  const badge = authorAutoHideBadge(item.hideReason);

  return (
    <Link
      href={`/queue/${item.id}`}
      className="card cardAccent stackGapSm"
      style={{ padding: '14px 16px', textDecoration: 'none', display: 'block' }}
      aria-label={`${categoryLabel ?? copy.queueTitle} — ${areaLine}`}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="muted" style={{ marginBottom: 2 }}>
            {areaLine}
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-950)' }}>
            {categoryLabel ?? copy.detailUncategorised}
          </p>
          {item.description ? (
            <p className="muted" style={{ marginTop: 4, color: 'var(--ink-600)' }}>
              {item.description}
            </p>
          ) : null}
          <p className="muted" style={{ marginTop: 6 }}>
            {formatRelativeTime(item.capturedAt)}
          </p>
        </div>

        <div className="stackGapSm" style={{ alignItems: 'flex-end' }}>
          {/*
            The two counts are shown **separately** and separately labelled:
            the report's own flag count and the author's 24 h count come from
            different joins, and a report can show 0 on one and 5 on the
            other. Collapsing them into one number would make the two
            indistinguishable.
          */}
          <span className="chip">
            {copy.queueOwnFlagCount.replace('{{count}}', String(item.flagCount))}
          </span>
          {badge ? (
            <span className="chip chipWarning">
              {badge === 'both' ? copy.queueBadgeBoth : copy.queueBadgeAuthorAutoHide}
            </span>
          ) : (
            <span className="chip chipWarning">{formatHideReason(item.hideReason)}</span>
          )}
        </div>
      </div>

      {badge ? (
        <div className="stackGapSm" style={{ marginTop: 10 }}>
          <span className="chip chipMuted">
            {copy.queueAuthorFlagCount.replace('{{count}}', String(item.authorFlags24h))}
          </span>
          {/* The badge explains the cause in words — it is never colour alone. */}
          <p className="muted" style={{ color: 'var(--ink-600)' }}>
            {copy.queueAuthorAutoHideExplanation}
          </p>
        </div>
      ) : null}

      {flagReasons.length > 0 ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {flagReasons.map((reason) => (
            <span key={reason} className="chip chipMuted">
              {reason}
            </span>
          ))}
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 10 }}>
        {copy.queueUploader}: {uploader}
      </p>
    </Link>
  );
}

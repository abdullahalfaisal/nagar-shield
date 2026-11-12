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
  formatAreaLine,
  formatCategoryLabel,
  formatHideReason,
  formatRelativeTime,
  maskUploaderIdentity,
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

  return (
    <AdminShell active="queue" role="moderator">
      <div className="page">
        <PageHeader title={copy.queueTitle} subtitle={copy.queueSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          {loading ? <SkeletonList /> : null}

          {!loading && items.length === 0 ? (
            <EmptyState title={copy.queueEmptyTitle} body={copy.queueEmptyBody} />
          ) : null}

          {items.map((item) => (
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
          <span className="chip">{copy.queueFlagCount.replace('{{count}}', String(item.flagCount))}</span>
          <span className="chip chipWarning">{formatHideReason(item.hideReason)}</span>
        </div>
      </div>

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

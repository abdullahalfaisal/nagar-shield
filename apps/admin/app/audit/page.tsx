'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import { fetchAuditTrail, getBrowserClient, toAppError, type AuditAction } from '@/lib/api';
import { formatDecisionLabel, formatTimestampShort } from '@/lib/format';
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell';

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

const PAGE_SIZE = 20;

type DecisionFilter = 'all' | 'restore' | 'remove' | 'disable_user';

export default function AuditPage() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);
  const router = useRouter();

  const [items, setItems] = useState<AuditAction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const page = await fetchAuditTrail(getBrowserClient(), {
        limit: PAGE_SIZE,
        decision: filter === 'all' ? null : filter,
      });
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
  }, [copy.errorForbidden, copy.errorGeneric, filter, router]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);

    try {
      const page = await fetchAuditTrail(getBrowserClient(), {
        cursor: nextCursor,
        limit: PAGE_SIZE,
        decision: filter === 'all' ? null : filter,
      });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      const appError = toAppError(caught);
      setError(appError.code === 'AUTH_REQUIRED' ? copy.errorAuthRequired : copy.errorGeneric);
    } finally {
      setLoadingMore(false);
    }
  }, [copy.errorAuthRequired, copy.errorGeneric, filter, loadingMore, nextCursor]);

  return (
    <AdminShell active="audit" role="moderator">
      <div className="page">
        <PageHeader title={copy.auditTitle} subtitle={copy.auditSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          <div className="row">
            <label className="fieldLabel" htmlFor="audit-filter" style={{ marginBottom: 0 }}>
              {copy.auditFilterDecision}
            </label>
            <select
              id="audit-filter"
              className="select"
              style={{ width: 220 }}
              value={filter}
              onChange={(event) => setFilter(event.target.value as DecisionFilter)}
            >
              <option value="all">{copy.auditFilterAll}</option>
              <option value="restore">{copy.auditDecisionRestore}</option>
              <option value="remove">{copy.auditDecisionRemove}</option>
              <option value="disable_user">{copy.auditDecisionDisableUser}</option>
            </select>
          </div>

          {loading ? <SkeletonList /> : null}

          {!loading && items.length === 0 ? (
            <EmptyState title={copy.auditEmptyTitle} body={copy.auditEmptyBody} />
          ) : null}

          {!loading && items.length > 0 ? (
            <div className="card" style={{ overflow: 'hidden' }}>
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

          {!loading && items.length > 0 ? (
            nextCursor ? (
              <button
                type="button"
                className="button buttonSecondary"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{ alignSelf: 'flex-start' }}
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
  );
}

/**
 * The target cell.
 *
 * A `disable_user` row names the **target user id** (its `report_id` is
 * null); every other row names the report. A link resolves to the target's
 * **current** state — the trail itself carries no snapshot.
 */
function renderTarget(action: AuditAction, copy: ReturnType<typeof getCopy>) {
  if (action.targetUserId) {
    return (
      <Link href={`/users?target=${encodeURIComponent(action.targetUserId)}`} className="link">
        {action.targetUserId.slice(0, 8)}
      </Link>
    );
  }

  if (action.reportId) {
    return (
      <Link href={`/queue/${action.reportId}`} className="link">
        {action.reportId.slice(0, 8)}
      </Link>
    );
  }

  return <span className="muted">{copy.auditReportUnavailable}</span>;
}

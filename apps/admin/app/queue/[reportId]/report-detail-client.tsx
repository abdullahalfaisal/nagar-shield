'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ReportCategory } from '@nagar-shield/shared';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import { toAppError } from '@/lib/api';
import { decisionErrorMessage, useReportDetail, useSubmitDecision } from '@/lib/queries';
import {
  formatAreaLine,
  formatCategoryAccent,
  formatCategoryLabel,
  formatDecisionLabel,
  formatFlagReason,
  formatTimestamp,
  isAuthorAutoHide,
} from '@/lib/format';
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell';
import { MediaPreview } from './media-preview';

/**
 * The report review detail — the wide two-column desktop view.
 *
 * Left: the media, the report meta (area, category, description, capture
 * time). Right: every flag reason, the uploader's identity, and the decision
 * panel.
 *
 * The decision requires a **note**. The submit is blocked when the note is
 * blank after trimming, and the server enforces the same rule again.
 */

export function ReportDetailClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);
  const router = useRouter();
  const params = useParams<{ reportId: string }>();
  const reportId = params.reportId;

  const detailQuery = useReportDetail(reportId);
  const { data: detail, error: queryError, isLoading } = detailQuery;

  // An expired session is a redirect, not a message.
  useEffect(() => {
    if (!queryError) return;
    if (toAppError(queryError).code === 'AUTH_REQUIRED') {
      router.replace('/login');
    }
  }, [queryError, router]);

  const error = queryError
    ? (() => {
        const appError = toAppError(queryError);
        return appError.code === 'FORBIDDEN'
          ? copy.errorForbidden
          : appError.code === 'NOT_FOUND'
            ? copy.errorNotFound
            : copy.errorGeneric;
      })()
    : null;

  return (
    <AdminShell active="queue">
      <div className="page">
        <PageHeader title={copy.detailTitle} subtitle={detail?.id ?? ''} />

        <div className="stack">
          <ErrorBanner message={error} />

          {isLoading ? <SkeletonList count={3} /> : null}

          {!isLoading && !detail && !error ? (
            <EmptyState title={copy.errorNotFound} body={copy.queueEmptyBody} />
          ) : null}

          {detail ? (
            <>
              {isAuthorAutoHide(detail.hideReason ?? 'flag_threshold') ? (
                <div className="banner" role="note">
                  {copy.detailAutoHideBanner}
                </div>
              ) : null}

              <div className="gridTwo">
                <div className="stack">
                  <section className="card" style={{ padding: 20 }}>
                    <h2 className="fieldLabel">{copy.detailMedia}</h2>
                    {detail.media.length === 0 ? (
                      <p className="muted">{copy.detailNoMedia}</p>
                    ) : (
                      <ul className="stackGapSm" style={{ listStyle: 'none' }}>
                        {detail.media.map((media) => (
                          <li key={media.id}>
                            {/*
                              The preview. The bucket is private, so the URL
                              is signed on demand and the placeholder rule
                              applies — an unavailable preview never breaks
                              the screen.
                            */}
                            <MediaPreview media={media} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="card" style={{ padding: 20 }}>
                    <h2 className="fieldLabel">{copy.detailArea}</h2>
                    <p className="fieldValue">{formatAreaLine(detail.areaHierarchy)}</p>

                    <h2 className="fieldLabel">{copy.detailCategory}</h2>
                    {/*
                      The category's accent tile, beside its name.
                      The tile is a second signal, not the only one — the
                      category's name is right there.
                    */}
                    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                      <span
                        className={`categoryTile categoryTile${formatCategoryAccent(
                          (detail.category ?? null) as ReportCategory | null,
                        )}`}
                        aria-hidden="true"
                      />
                      <p className="fieldValue" style={{ margin: 0 }}>
                        {formatCategoryLabel((detail.category ?? null) as ReportCategory | null) ??
                          copy.detailUncategorised}
                      </p>
                    </div>

                    <h2 className="fieldLabel">{copy.detailDescription}</h2>
                    {detail.description ? (
                      <p className="fieldValue" style={{ whiteSpace: 'pre-wrap' }}>
                        {detail.description}
                      </p>
                    ) : (
                      <p className="muted" style={{ marginBottom: 16 }}>
                        —
                      </p>
                    )}

                    <h2 className="fieldLabel">{copy.detailCapturedAt}</h2>
                    <p className="fieldValue">{formatTimestamp(detail.capturedAt)}</p>
                  </section>
                </div>

                <div className="stack">
                  <section className="card" style={{ padding: 20 }}>
                    <h2 className="fieldLabel">
                      {copy.detailFlags} ({detail.flags.length})
                    </h2>
                    {detail.flags.length === 0 ? (
                      <p className="muted">—</p>
                    ) : (
                      <ul className="stackGapSm" style={{ listStyle: 'none' }}>
                        {detail.flags.map((flag) => (
                          <li key={flag.id}>
                            <span className="chip chipMuted">
                              {formatFlagReason(flag.reason)}
                            </span>
                            <p className="muted" style={{ marginTop: 4 }}>
                              {copy.detailFlagReporter}: {flag.flaggerId}
                            </p>
                            <p className="muted">{formatTimestamp(flag.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="card" style={{ padding: 20 }}>
                    <h2 className="fieldLabel">{copy.detailUploader}</h2>
                    {detail.uploader ? (
                      <>
                        <h3 className="fieldLabel">{copy.detailUploaderId}</h3>
                        <p className="fieldValue">{detail.uploader.id}</p>

                        <h3 className="fieldLabel">{copy.detailUploaderPhone}</h3>
                        <p className="fieldValue">{detail.uploader.phone ?? '—'}</p>

                        <h3 className="fieldLabel">{copy.detailUploaderEmail}</h3>
                        <p className="fieldValue">{detail.uploader.email ?? '—'}</p>

                        <h3 className="fieldLabel">{copy.detailUploaderRole}</h3>
                        <p className="fieldValue">{detail.uploader.role}</p>

                        <h3 className="fieldLabel">{copy.detailUploaderState}</h3>
                        <p className="fieldValue">
                          {detail.uploader.disabledAt ? copy.detailStateDisabled : copy.detailStateActive}
                        </p>
                      </>
                    ) : (
                      <p className="muted">—</p>
                    )}
                  </section>

                  <DecisionPanel reportId={detail.id} />
                </div>
              </div>

              <section className="card" style={{ padding: 20 }}>
                <h2 className="fieldLabel">{copy.detailPriorActions}</h2>
                {detail.priorActions.length === 0 ? (
                  <p className="muted">{copy.detailNoPriorActions}</p>
                ) : (
                  <ul className="stackGapSm" style={{ listStyle: 'none' }}>
                    {detail.priorActions.map((action) => (
                      <li key={action.id} className="stackGapSm">
                        <span className="chip">{formatDecisionLabel(action.decision)}</span>
                        <p style={{ fontSize: 13, color: 'var(--ink-800)', whiteSpace: 'pre-wrap' }}>
                          {action.note}
                        </p>
                        <p className="muted">{formatTimestamp(action.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}

/**
 * The decision panel.
 *
 * The note is required. The submit is blocked when it is blank after
 * trimming, and the server rejects the same case with `VALIDATION_FAILED`
 * without writing a row.
 *
 * The mutation invalidates the queue, the detail and the audit trail by key,
 * so the decided report leaves the queue on the next fetch. The row is **not**
 * optimistically removed from the cache — the client is never the authority
 * on what was stored.
 */
function DecisionPanel({ reportId }: { reportId: string }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);

  const [decision, setDecision] = useState<'restore' | 'remove'>('restore');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const submit = useSubmitDecision();
  const submitting = submit.isPending;

  const trimmedNote = note.trim();
  const canSubmit = trimmedNote.length > 0 && !submitting;

  // A `VALIDATION_FAILED` belongs to the **note field**, not the banner: a
  // blank note is a field problem, and the field is where the moderator is
  // looking. Every other code goes to the banner.
  const bannerError =
    submit.error && toAppError(submit.error).code !== 'VALIDATION_FAILED'
      ? decisionErrorMessage(toAppError(submit.error).code)
      : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit.reset();
    setNoteError(null);

    if (trimmedNote.length === 0) {
      setNoteError(copy.decisionNoteRequired);
      return;
    }

    try {
      await submit.mutateAsync({ reportId, decision, note: trimmedNote });
      setNote('');
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === 'VALIDATION_FAILED') {
        setNoteError(copy.decisionNoteRequired);
      }
    }
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      <h2 className="fieldLabel">{copy.decisionHeading}</h2>

      <form className="stackGapSm" onSubmit={handleSubmit}>
        <ErrorBanner message={bannerError} />

        <div className="row" role="radiogroup" aria-label={copy.decisionHeading}>
          <label className="row" style={{ gap: 8, minHeight: 48 }}>
            <input
              type="radio"
              name="decision"
              value="restore"
              checked={decision === 'restore'}
              onChange={() => setDecision('restore')}
            />
            <span>{copy.decisionRestore}</span>
          </label>
          <label className="row" style={{ gap: 8, minHeight: 48 }}>
            <input
              type="radio"
              name="decision"
              value="remove"
              checked={decision === 'remove'}
              onChange={() => setDecision('remove')}
            />
            <span>{copy.decisionRemove}</span>
          </label>
        </div>

        {decision === 'remove' ? (
          <div className="banner bannerDanger" role="note">
            {copy.decisionRemoveWarning}
          </div>
        ) : null}

        <div>
          <label className="fieldLabel" htmlFor="decision-note">
            {copy.decisionNote}
          </label>
          <textarea
            id="decision-note"
            className="textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.decisionNotePlaceholder}
            maxLength={2000}
            aria-invalid={noteError !== null}
          />
          {noteError ? (
            <p className="muted" style={{ color: 'var(--red-600)', marginTop: 6 }} role="alert">
              {noteError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className={`button ${decision === 'remove' ? 'buttonDanger' : 'buttonPrimary'}`}
          disabled={!canSubmit}
        >
          {submitting
            ? copy.decisionSubmitting
            : decision === 'remove'
              ? copy.decisionConfirmRemove
              : copy.decisionSubmit}
        </button>
      </form>
    </section>
  );
}

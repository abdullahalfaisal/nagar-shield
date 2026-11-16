'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { ReportCategory } from '@nagar-shield/shared'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError } from '@/lib/api'
import { useReportDetail } from '@/lib/queries'
import {
  formatAreaLine,
  formatCategoryLabel,
  formatDecisionLabel,
  formatFlagReason,
  formatTimestamp,
  isAuthorAutoHide,
} from '@/lib/format'
import { DecisionButtons } from '@/app/decision-buttons'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'
import { MediaPreview } from './media-preview'

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
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()
  const params = useParams<{ reportId: string }>()
  const reportId = params.reportId

  const detailQuery = useReportDetail(reportId)
  const { data: detail, error: queryError, isLoading } = detailQuery

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
        return appError.code === 'FORBIDDEN'
          ? copy.errorForbidden
          : appError.code === 'NOT_FOUND'
            ? copy.errorNotFound
            : copy.errorGeneric
      })()
    : null

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
                  <section className="card">
                    <h2 className="fieldLabel">{copy.detailMedia}</h2>
                    {detail.media.length === 0 ? (
                      <p className="muted">{copy.detailNoMedia}</p>
                    ) : (
                      <ul className="stackGapSm listPlain">
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

                  <section className="card">
                    <h2 className="fieldLabel">{copy.detailArea}</h2>
                    <p className="fieldValue">{formatAreaLine(detail.areaHierarchy)}</p>

                    <h2 className="fieldLabel">{copy.detailCategory}</h2>
                    <p className="fieldValue">
                      {formatCategoryLabel((detail.category ?? null) as ReportCategory | null) ??
                        copy.detailUncategorised}
                    </p>

                    <h2 className="fieldLabel">{copy.detailDescription}</h2>
                    {detail.description ? (
                      <p className="fieldValue preWrap">{detail.description}</p>
                    ) : (
                      <p className="fieldValue muted">—</p>
                    )}

                    <h2 className="fieldLabel">{copy.detailCapturedAt}</h2>
                    <p className="fieldValue">{formatTimestamp(detail.capturedAt)}</p>
                  </section>
                </div>

                <div className="stack">
                  <section className="card">
                    <h2 className="fieldLabel">
                      {copy.detailFlags} ({detail.flags.length})
                    </h2>
                    {detail.flags.length === 0 ? (
                      <p className="muted">—</p>
                    ) : (
                      <ul className="stackGapSm listPlain">
                        {detail.flags.map((flag) => (
                          <li key={flag.id}>
                            <span className="chip chipMuted">{formatFlagReason(flag.reason)}</span>
                            <p className="muted">
                              {copy.detailFlagReporter}: {flag.flaggerId}
                            </p>
                            <p className="muted">{formatTimestamp(flag.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="card">
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
                          {detail.uploader.disabledAt
                            ? copy.detailStateDisabled
                            : copy.detailStateActive}
                        </p>
                      </>
                    ) : (
                      <p className="muted">—</p>
                    )}
                  </section>

                  <section className="card stackGapSm">
                    <h2 className="fieldLabel">{copy.decisionHeading}</h2>
                    <DecisionButtons reportId={detail.id} withNote />
                  </section>
                </div>
              </div>

              <section className="card">
                <h2 className="fieldLabel">{copy.detailPriorActions}</h2>
                {detail.priorActions.length === 0 ? (
                  <p className="muted">{copy.detailNoPriorActions}</p>
                ) : (
                  <ul className="stackGapSm listPlain">
                    {detail.priorActions.map((action) => (
                      <li key={action.id} className="stackGapSm">
                        <span className="chip">{formatDecisionLabel(action.decision)}</span>
                        <p className="itemBody preWrap">{action.note}</p>
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
  )
}

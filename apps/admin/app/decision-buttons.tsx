'use client'

import { useState } from 'react'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError } from '@/lib/api'
import { decisionErrorMessage, useSubmitDecision } from '@/lib/queries'

/**
 * Approve or decline a flagged report.
 *
 * Approve puts the report back in the public feed. Decline removes it for
 * good, so it asks once more first. A note is optional; when it is blank the
 * decision is saved with a default note, because the audit log always needs one.
 */
export function DecisionButtons({
  reportId,
  withNote = false,
}: {
  reportId: string
  withNote?: boolean
}) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const submit = useSubmitDecision()
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')

  const busy = submit.isPending
  const errorMessage = submit.error ? decisionErrorMessage(toAppError(submit.error).code) : null

  async function decide(decision: 'restore' | 'remove') {
    const fallback =
      decision === 'restore' ? copy.decisionDefaultApprove : copy.decisionDefaultDecline
    try {
      await submit.mutateAsync({ reportId, decision, note: note.trim() || fallback })
      setConfirming(false)
      setNote('')
    } catch {
      // The error is shown from `submit.error`.
    }
  }

  return (
    <div className="stackGapSm">
      {withNote ? (
        <div>
          <label className="fieldLabel" htmlFor={`note-${reportId}`}>
            {copy.decisionNoteOptional}
          </label>
          <textarea
            id={`note-${reportId}`}
            className="textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
          />
        </div>
      ) : null}

      {errorMessage ? (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {confirming ? (
        <div className="row rowWrap">
          <span className="itemTitle">{copy.decisionDeclineConfirm}</span>
          <button
            type="button"
            className="button buttonDanger"
            disabled={busy}
            onClick={() => void decide('remove')}
          >
            {copy.decisionDeclineYes}
          </button>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {copy.decisionCancel}
          </button>
        </div>
      ) : (
        <div className="row rowWrap">
          <button
            type="button"
            className="button buttonPrimary"
            disabled={busy}
            onClick={() => void decide('restore')}
          >
            {copy.decisionApprove}
          </button>
          <button
            type="button"
            className="button buttonSecondary"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {copy.decisionDecline}
          </button>
        </div>
      )}

      {withNote ? (
        <p className="muted">
          {copy.decisionApproveHint} {copy.decisionDeclineHint}
        </p>
      ) : null}
    </div>
  )
}

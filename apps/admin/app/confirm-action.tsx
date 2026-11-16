'use client'

import { useState } from 'react'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'

/**
 * A button that asks once before it acts: "Hide" becomes "Hide this report?
 * Yes, hide / Cancel". The action runs only on the second click.
 */
export function ConfirmAction({
  label,
  question,
  yesLabel,
  busy = false,
  error,
  onConfirm,
}: {
  label: string
  question: string
  yesLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => Promise<void>
}) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <div className="stackGapSm">
        <button type="button" className="button buttonSecondary" onClick={() => setAsking(true)}>
          {label}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="stackGapSm">
      <span className="muted">{question}</span>
      <div className="row">
        <button
          type="button"
          className="button buttonDanger"
          disabled={busy}
          onClick={() => void onConfirm().then(() => setAsking(false))}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          className="button buttonSecondary"
          disabled={busy}
          onClick={() => setAsking(false)}
        >
          {copy.decisionCancel}
        </button>
      </div>
    </div>
  )
}

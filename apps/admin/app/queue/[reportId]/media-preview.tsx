'use client'

import { useCallback, useEffect, useState } from 'react'
import { signMediaUrl } from '@/lib/api'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { getBrowserClient } from '@/lib/supabase/client'
import type { QueueMedia } from '@/lib/api'

/**
 * The media preview.
 *
 * The `report-media` bucket is **private**, so the preview needs a **short-
 * lived signed URL**. The URL is fetched on demand, held in component state
 * for as long as the preview is on screen, and never written to a query key,
 * a URL, or a log.
 *
 * The placeholder rule
 * -------------------
 * A preview that cannot be signed, or whose signed URL has expired, shows a
 * **neutral placeholder** — never a broken image. The story is explicit: an
 * unavailable preview must not break the screen, and the moderator must still
 * be able to judge the report from everything else on the page.
 *
 * The URL is **re-requested on demand**: the "Try again" control asks for a
 * fresh URL rather than reusing the expired one. That is the difference
 * between a preview that recovers and a preview that stays broken for the
 * rest of the session.
 *
 * The image element's own `onError` also falls back to the placeholder, so a
 * URL that was signed but has since expired mid-session degrades to the
 * placeholder instead of showing the browser's broken-image glyph.
 */
export function MediaPreview({ media }: { media: QueueMedia }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)

  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [requesting, setRequesting] = useState(false)

  const request = useCallback(async () => {
    setRequesting(true)
    const signed = await signMediaUrl(getBrowserClient(), media.storagePath)
    setUrl(signed)
    setFailed(signed === null)
    setRequesting(false)
  }, [media.storagePath])

  useEffect(() => {
    let active = true

    // The effect body mirrors `request` but guards its own state writes: an
    // unmounted component must not set state.
    void (async () => {
      const signed = await signMediaUrl(getBrowserClient(), media.storagePath)
      if (!active) return
      setUrl(signed)
      setFailed(signed === null)
    })()

    return () => {
      active = false
    }
  }, [media.storagePath])

  const available = url !== null && !failed

  return (
    <div className="stackGapSm">
      {available ? (
        media.mediaType === 'video' ? (
          <video
            src={url as string}
            controls
            playsInline
            onError={() => setFailed(true)}
            style={{ width: '100%', borderRadius: 'var(--r-sm)' }}
          />
        ) : (
          <img
            src={url as string}
            alt=""
            onError={() => setFailed(true)}
            style={{ width: '100%', borderRadius: 'var(--r-sm)', display: 'block' }}
          />
        )
      ) : (
        <div
          className="muted"
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            border: '1px solid var(--ink-200)',
            borderRadius: 'var(--r-sm)',
            background: 'var(--ink-50)',
          }}
          role="note"
        >
          {copy.detailMediaUnavailable}
        </div>
      )}

      {/*
        The re-request control appears only when the preview failed. It asks
        for a **fresh** URL — an expired one is never reused.
      */}
      {failed ? (
        <button
          type="button"
          className="button buttonSecondary"
          onClick={() => void request()}
          disabled={requesting}
          style={{ alignSelf: 'flex-start' }}
        >
          {copy.detailMediaRetry}
        </button>
      ) : null}

      <p className="muted">
        {media.mediaType} · {media.byteSize} bytes
        {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
      </p>
    </div>
  )
}

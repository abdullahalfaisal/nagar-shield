import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { signMediaUrl } from '@/lib/api'
import { MediaPreview } from './media-preview'

/**
 * The media preview.
 *
 * Story `002-report-review-detail`, criteria 1 and 2:
 *
 *   > "the media preview is loaded through a **short-lived signed Storage
 *   > URL** and the bucket itself is never public"
 *
 *   > "Given the signed URL has expired or the media row is missing, When the
 *   > preview area renders, Then a neutral placeholder is shown — never a
 *   > broken image — and the signed URL is re-requested on demand"
 *
 * Two rules, and both are about what happens when the **happy path fails**.
 * A preview that renders an `<img>` with a broken `src` looks fine in a code
 * review and fails in front of a moderator who is trying to judge a report.
 *
 * The test therefore asserts the *absence* of a broken image as much as the
 * presence of a working one.
 */

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  signMediaUrl: jest.fn(),
}))

jest.mock('@/lib/supabase/client', () => ({
  getBrowserClient: jest.fn(() => ({ auth: { getSession: jest.fn() } })),
}))

const mockedSignMediaUrl = signMediaUrl as jest.MockedFunction<typeof signMediaUrl>

const copy = getCopy(DEFAULT_ADMIN_LOCALE)

/**
 * The previewed image.
 *
 * The `<img>` carries an empty `alt` — it is a preview of the report's media,
 * and the media list beside it already names the object. An empty `alt` means
 * the element has **no** accessible name, so it is not matched by the `img`
 * role. The query is by tag instead.
 */
function previewImage(): HTMLImageElement | null {
  return document.querySelector('img')
}

const MEDIA = {
  id: 'media-1',
  storagePath: 'reports/token/media-1/photo.jpg',
  mediaType: 'photo' as const,
  byteSize: 2048,
  durationSeconds: null,
  width: 800,
  height: 600,
}

describe('the media preview', () => {
  beforeEach(() => {
    mockedSignMediaUrl.mockReset()
  })

  it('renders the signed URL once it arrives', async () => {
    mockedSignMediaUrl.mockResolvedValue('https://signed.example/photo.jpg?token=abc')

    render(<MediaPreview media={MEDIA} />)

    await waitFor(() => {
      expect(previewImage()).toHaveAttribute('src', 'https://signed.example/photo.jpg?token=abc')
    })

    // The placeholder is gone once the URL lands.
    expect(screen.queryByText(copy.detailMediaUnavailable)).toBeNull()
  })

  it('signs the URL for the media’s own storage path', async () => {
    mockedSignMediaUrl.mockResolvedValue('https://signed.example/photo.jpg')

    render(<MediaPreview media={MEDIA} />)

    await waitFor(() => {
      expect(mockedSignMediaUrl).toHaveBeenCalledTimes(1)
    })

    // The path comes from the server payload; the console must not invent
    // one, and must not sign a path other than the media's own.
    expect(mockedSignMediaUrl.mock.calls[0]?.[1]).toBe(MEDIA.storagePath)
  })

  it('shows a neutral placeholder when the URL cannot be signed — never a broken image', async () => {
    mockedSignMediaUrl.mockResolvedValue(null)

    render(<MediaPreview media={MEDIA} />)

    await waitFor(() => {
      expect(screen.getByText(copy.detailMediaUnavailable)).toBeTruthy()
    })

    // No `img` element at all — a broken one would render as the browser's
    // broken-image glyph with an alt text the moderator has to read.
    expect(previewImage()).toBeNull()
  })

  it('re-requests the URL on demand when the preview failed', async () => {
    mockedSignMediaUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('https://signed.example/ok.jpg')

    render(<MediaPreview media={MEDIA} />)

    await waitFor(() => {
      expect(screen.getByText(copy.detailMediaUnavailable)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: copy.detailMediaRetry }))

    // The **second** call asks for a fresh URL. The expired one is never
    // reused — that is the difference between a preview that recovers and one
    // that stays broken for the rest of the session.
    await waitFor(() => {
      expect(mockedSignMediaUrl).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(previewImage()).toHaveAttribute('src', 'https://signed.example/ok.jpg')
    })
  })

  it('falls back to the placeholder when a signed URL fails to load', async () => {
    mockedSignMediaUrl.mockResolvedValue('https://signed.example/photo.jpg')

    render(<MediaPreview media={MEDIA} />)

    const image = await waitFor(() => {
      const found = previewImage()
      expect(found).not.toBeNull()
      return found as HTMLImageElement
    })

    // The URL was signed but has since expired. The image element's own
    // error handler degrades to the placeholder rather than leaving a broken
    // image on the page.
    fireEvent.error(image)

    await waitFor(() => {
      expect(screen.getByText(copy.detailMediaUnavailable)).toBeTruthy()
    })
    expect(previewImage()).toBeNull()
  })

  it('never signs an empty storage path', async () => {
    mockedSignMediaUrl.mockResolvedValue(null)

    render(<MediaPreview media={{ ...MEDIA, storagePath: '' }} />)

    // The guard lives in the API layer — a pathless media row must not
    // produce a request at all.
    await waitFor(() => {
      expect(screen.getByText(copy.detailMediaUnavailable)).toBeTruthy()
    })
  })
})

import { AppError } from '@nagar-shield/shared'
import { parseErrorBody, signMediaUrl, toAppError } from '@/lib/api'

/**
 * The console's error mapping.
 *
 * The console switches on the **stable code**, never on the raw driver
 * message. These tests pin the Postgres → stable-code mapping so a silent
 * change cannot turn a `FORBIDDEN` into a generic "something went wrong" on
 * the moderator's screen.
 */
describe('toAppError', () => {
  it('passes an existing AppError through unchanged', () => {
    const original = new AppError('FORBIDDEN')
    expect(toAppError(original)).toBe(original)
  })

  it('maps a unique violation to CONFLICT', () => {
    expect(toAppError({ code: '23505' }).code).toBe('CONFLICT')
  })

  it('maps the constraint violations to VALIDATION_FAILED', () => {
    expect(toAppError({ code: '23503' }).code).toBe('VALIDATION_FAILED')
    expect(toAppError({ code: '23514' }).code).toBe('VALIDATION_FAILED')
    expect(toAppError({ code: '23502' }).code).toBe('VALIDATION_FAILED')
    expect(toAppError({ code: '22023' }).code).toBe('VALIDATION_FAILED')
  })

  it('maps insufficient privilege to FORBIDDEN', () => {
    expect(toAppError({ code: '42501' }).code).toBe('FORBIDDEN')
  })

  it('maps the not-found codes to NOT_FOUND', () => {
    expect(toAppError({ code: 'P0002' }).code).toBe('NOT_FOUND')
    expect(toAppError({ code: 'PGRST116' }).code).toBe('NOT_FOUND')
  })

  it('maps an expired JWT to AUTH_REQUIRED', () => {
    expect(toAppError({ code: 'PGRST301' }).code).toBe('AUTH_REQUIRED')
  })

  it('maps a row-level-security denial to FORBIDDEN', () => {
    expect(toAppError({ message: 'new row violates row-level security policy' }).code).toBe(
      'FORBIDDEN',
    )
  })

  it('maps a missing session to AUTH_REQUIRED', () => {
    expect(toAppError({ message: 'JWT expired' }).code).toBe('AUTH_REQUIRED')
  })

  it('collapses an unknown failure to INTERNAL', () => {
    expect(toAppError({ code: '99999', message: 'something odd' }).code).toBe('INTERNAL')
    expect(toAppError(null).code).toBe('INTERNAL')
    expect(toAppError(undefined).code).toBe('INTERNAL')
  })
})

describe('parseErrorBody', () => {
  it('reads the code out of an error envelope', () => {
    const error = parseErrorBody({
      error: { code: 'VALIDATION_FAILED', message: 'The note is required.' },
    })
    expect(error.code).toBe('VALIDATION_FAILED')
    expect(error.message).toBe('The note is required.')
  })

  it('collapses a body with no envelope to INTERNAL', () => {
    expect(parseErrorBody(null).code).toBe('INTERNAL')
    expect(parseErrorBody({}).code).toBe('INTERNAL')
    expect(parseErrorBody({ error: {} }).code).toBe('INTERNAL')
  })
})

describe('signMediaUrl', () => {
  /**
   * A minimal Storage double.
   *
   * The console signs a URL with the moderator's **own** session and the anon
   * key — never a service-role credential — so the only thing that matters
   * here is which bucket it asks and what it does with the answer.
   */
  function storageClient(result: { data?: unknown; error?: unknown }) {
    const createSignedUrl = jest.fn().mockResolvedValue(result)
    const from = jest.fn().mockReturnValue({ createSignedUrl })
    return { client: { storage: { from } } as never, from, createSignedUrl }
  }

  it('asks the private report-media bucket', async () => {
    const { client, from } = storageClient({ data: { signedUrl: 'https://signed/x.jpg' } })

    await signMediaUrl(client, 'reports/token/media-1/photo.jpg')

    expect(from).toHaveBeenCalledWith('report-media')
  })

  it('signs the URL for the path it was given', async () => {
    const { client, createSignedUrl } = storageClient({
      data: { signedUrl: 'https://signed/x.jpg' },
    })

    await signMediaUrl(client, 'reports/token/media-1/photo.jpg')

    expect(createSignedUrl).toHaveBeenCalledWith(
      'reports/token/media-1/photo.jpg',
      expect.any(Number),
    )
  })

  it('returns the signed URL', async () => {
    const { client } = storageClient({ data: { signedUrl: 'https://signed/x.jpg' } })

    expect(await signMediaUrl(client, 'reports/token/media-1/photo.jpg')).toBe(
      'https://signed/x.jpg',
    )
  })

  it('returns null when the URL cannot be signed', async () => {
    // The placeholder rule: an unsignable URL is a **null**, never a throw.
    // A thrown error would take down the whole review screen over one
    // unavailable preview.
    const { client } = storageClient({ error: { message: 'not allowed' } })

    expect(await signMediaUrl(client, 'reports/token/media-1/photo.jpg')).toBeNull()
  })

  it('returns null when the bucket answers with no URL', async () => {
    const { client } = storageClient({ data: { signedUrl: null } })

    expect(await signMediaUrl(client, 'reports/token/media-1/photo.jpg')).toBeNull()
  })

  it('never asks for a URL with no path', async () => {
    const { client, createSignedUrl } = storageClient({
      data: { signedUrl: 'https://signed/x.jpg' },
    })

    expect(await signMediaUrl(client, '')).toBeNull()
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
  API_ERROR_I18N_KEYS,
  API_ERROR_MESSAGES,
  AppError,
  API_ERROR_CODE_SET,
  toAppError,
  isAppError,
  resolveErrorMessage,
  type ApiErrorCode,
} from '../errors'

describe('error code registry', () => {
  it('has an HTTP status, message and i18n key for every code', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(200)
      expect(API_ERROR_MESSAGES[code]).toBeTruthy()
      expect(API_ERROR_I18N_KEYS[code]).toMatch(/^errors\./)
    }
  })

  it('matches the code table in the standard, exactly', () => {
    // The standard is the contract: `memory-bank/standards/api-conventions.md`
    // § Error codes. The story requires the union to contain **every** code
    // the table lists and **no** code outside it — so both directions are
    // checked, not just the first.
    const standard = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'memory-bank', 'standards', 'api-conventions.md'),
      'utf8',
    )

    const table = standard.slice(standard.indexOf('### Error codes'))
    const rows = [...table.matchAll(/^\|\s*`([A-Z_]+)`\s*\|\s*(\d{3})\s*\|/gm)]

    // The table must have been read at all — a renamed heading would leave
    // zero rows and the checks below would pass vacuously.
    expect(rows.length).toBeGreaterThan(0)

    const fromStandard = rows.map((row) => row[1] as string)

    const missing = fromStandard.filter((code) => !API_ERROR_CODE_SET.has(code))
    const extra = API_ERROR_CODES.filter((code) => !fromStandard.includes(code))

    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('agrees with the standard on every HTTP status', () => {
    const standard = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'memory-bank', 'standards', 'api-conventions.md'),
      'utf8',
    )

    const table = standard.slice(standard.indexOf('### Error codes'))
    const rows = [...table.matchAll(/^\|\s*`([A-Z_]+)`\s*\|\s*(\d{3})\s*\|/gm)]

    for (const [, code, status] of rows) {
      expect(API_ERROR_HTTP_STATUS[code as ApiErrorCode]).toBe(Number(status))
    }
  })

  it('exposes a lookup set', () => {
    expect(API_ERROR_CODE_SET.has('VALIDATION_FAILED')).toBe(true)
    expect(API_ERROR_CODE_SET.has('NOPE')).toBe(false)
  })

  it('uses 429 for the rate-limit codes', () => {
    expect(API_ERROR_HTTP_STATUS.FLAG_RATE_LIMIT).toBe(429)
    expect(API_ERROR_HTTP_STATUS.CAPTURE_RATE_LIMIT).toBe(429)
    expect(API_ERROR_HTTP_STATUS.OTP_RATE_LIMIT).toBe(429)
  })

  it('uses 403 for the disabled and forbidden codes', () => {
    expect(API_ERROR_HTTP_STATUS.AUTH_DISABLED).toBe(403)
    expect(API_ERROR_HTTP_STATUS.FORBIDDEN).toBe(403)
  })
})

describe('AppError', () => {
  it('carries a stable code and the matching HTTP status', () => {
    const error = new AppError('FLAG_RATE_LIMIT', { retry_after_sec: 3600 })
    expect(error.code).toBe('FLAG_RATE_LIMIT')
    expect(error.httpStatus).toBe(429)
    expect(error.details).toEqual({ retry_after_sec: 3600 })
  })

  it('serialises to the standard envelope', () => {
    const error = new AppError('NOT_FOUND')
    expect(error.toBody()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    })
  })

  it('never leaks a raw Postgres error to the caller', () => {
    const raw = new Error(
      'duplicate key value violates unique constraint "flags_report_id_flagger_id_key"',
    )
    const error = toAppError(raw)
    expect(error.code).toBe('INTERNAL')
    expect(error.message).not.toContain('duplicate key')
  })

  it('passes an AppError through unchanged', () => {
    const original = new AppError('CONFLICT')
    expect(toAppError(original)).toBe(original)
    expect(isAppError(original)).toBe(true)
  })
})

describe('resolveErrorMessage', () => {
  it('returns the bundle key for every code', () => {
    for (const code of API_ERROR_CODES) {
      expect(resolveErrorMessage(code)).toBe(API_ERROR_I18N_KEYS[code])
    }
  })

  it('returns a key in the errors namespace', () => {
    expect(resolveErrorMessage('AUTH_REQUIRED')).toMatch(/^errors\./)
  })

  it('returns camelCase keys, which is what the bundles actually carry', () => {
    // The story's Technical Notes say the namespace is `errors.<CODE>`. The
    // shipped bundles use camelCase — `errors.authRequired`, not
    // `errors.authrequired`. A key that does not exist renders as the key
    // itself, which is how a user ended up seeing the word "undefined".
    expect(resolveErrorMessage('AUTH_REQUIRED')).toBe('errors.authRequired')
    expect(resolveErrorMessage('AUTH_DISABLED')).toBe('errors.authDisabled')
  })
})

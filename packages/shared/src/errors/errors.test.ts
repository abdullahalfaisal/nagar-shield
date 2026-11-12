import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
  API_ERROR_I18N_KEYS,
  API_ERROR_MESSAGES,
  AppError,
  API_ERROR_CODE_SET,
  toAppError,
  isAppError,
} from '../errors';

describe('error code registry', () => {
  it('has an HTTP status, message and i18n key for every code', () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(200);
      expect(API_ERROR_MESSAGES[code]).toBeTruthy();
      expect(API_ERROR_I18N_KEYS[code]).toMatch(/^errors\./);
    }
  });

  it('exposes a lookup set', () => {
    expect(API_ERROR_CODE_SET.has('VALIDATION_FAILED')).toBe(true);
    expect(API_ERROR_CODE_SET.has('NOPE')).toBe(false);
  });

  it('uses 429 for the rate-limit codes', () => {
    expect(API_ERROR_HTTP_STATUS.FLAG_RATE_LIMIT).toBe(429);
    expect(API_ERROR_HTTP_STATUS.CAPTURE_RATE_LIMIT).toBe(429);
    expect(API_ERROR_HTTP_STATUS.OTP_RATE_LIMIT).toBe(429);
  });

  it('uses 403 for the disabled and forbidden codes', () => {
    expect(API_ERROR_HTTP_STATUS.AUTH_DISABLED).toBe(403);
    expect(API_ERROR_HTTP_STATUS.FORBIDDEN).toBe(403);
  });
});

describe('AppError', () => {
  it('carries a stable code and the matching HTTP status', () => {
    const error = new AppError('FLAG_RATE_LIMIT', { retry_after_sec: 3600 });
    expect(error.code).toBe('FLAG_RATE_LIMIT');
    expect(error.httpStatus).toBe(429);
    expect(error.details).toEqual({ retry_after_sec: 3600 });
  });

  it('serialises to the standard envelope', () => {
    const error = new AppError('NOT_FOUND');
    expect(error.toBody()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    });
  });

  it('never leaks a raw Postgres error to the caller', () => {
    const raw = new Error('duplicate key value violates unique constraint "flags_report_id_flagger_id_key"');
    const error = toAppError(raw);
    expect(error.code).toBe('INTERNAL');
    expect(error.message).not.toContain('duplicate key');
  });

  it('passes an AppError through unchanged', () => {
    const original = new AppError('CONFLICT');
    expect(toAppError(original)).toBe(original);
    expect(isAppError(original)).toBe(true);
  });
});

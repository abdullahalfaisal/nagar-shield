import { fromSupabaseError, isNetworkError, parseErrorBody } from '@/shared/api/errors';

/**
 * The error mapping is the app's view of the database's refusals.
 *
 * The `ACCOUNT_DISABLED` case is the one that matters most: it is how the
 * database tells the app that a moderator has disabled the account, and the
 * app must say *"your account is disabled"* rather than *"you do not have
 * permission"*. Those are different messages to a different audience — one
 * tells the user something happened to their account, the other tells them
 * to try something else. Mis-mapping it means a disabled user keeps tapping
 * buttons that cannot work, with no explanation.
 */
describe('fromSupabaseError', () => {
  it('maps the disabled-account guard to AUTH_DISABLED', () => {
    const error = fromSupabaseError({
      code: '42501',
      message: 'ACCOUNT_DISABLED',
    });

    expect(error.code).toBe('AUTH_DISABLED');
  });

  it('matches the disabled-account guard regardless of case', () => {
    const error = fromSupabaseError({
      code: '42501',
      message: 'account_disabled',
    });

    expect(error.code).toBe('AUTH_DISABLED');
  });

  it('maps a plain permission error to FORBIDDEN', () => {
    // The same Postgres code, but NOT the disable guard. It must not be
    // mistaken for a disable.
    const error = fromSupabaseError({
      code: '42501',
      message: 'permission denied for table reports',
    });

    expect(error.code).toBe('FORBIDDEN');
  });

  it('maps a unique violation to CONFLICT', () => {
    const error = fromSupabaseError({ code: '23505', details: 'contacts_phone_key' });
    expect(error.code).toBe('CONFLICT');
  });

  it('maps a foreign-key violation to VALIDATION_FAILED', () => {
    const error = fromSupabaseError({ code: '23503' });
    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it('maps a semantic server rejection (22023) to VALIDATION_FAILED', () => {
    // `raise exception '<CODE>' using errcode = '22023'` is how the server
    // functions reject a request on its own terms — a missing note, a
    // self-disable, a restore whose window has closed.
    const error = fromSupabaseError({ code: '22023', message: 'VALIDATION_FAILED' });
    expect(error.code).toBe('VALIDATION_FAILED');
  });

  it('maps an RLS denial without a code to FORBIDDEN', () => {
    const error = fromSupabaseError({ message: 'new row violates row-level security policy' });
    expect(error.code).toBe('FORBIDDEN');
  });

  it('maps a missing row to NOT_FOUND', () => {
    const error = fromSupabaseError({ code: 'PGRST116' });
    expect(error.code).toBe('NOT_FOUND');
  });

  it('maps an expired JWT to AUTH_REQUIRED', () => {
    const error = fromSupabaseError({ code: 'PGRST301' });
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  it('maps a rate-limit message to FLAG_RATE_LIMIT', () => {
    const error = fromSupabaseError({ message: 'rate limit exceeded, too many requests' });
    expect(error.code).toBe('FLAG_RATE_LIMIT');
  });

  it('falls back to INTERNAL for an unknown failure', () => {
    const error = fromSupabaseError({ message: 'something exotic' });
    expect(error.code).toBe('INTERNAL');
  });

  it('treats a missing error as INTERNAL', () => {
    expect(fromSupabaseError(null).code).toBe('INTERNAL');
  });
});

describe('parseErrorBody', () => {
  it('reads the stable code out of an error envelope', () => {
    const error = parseErrorBody({ error: { code: 'AUTH_DISABLED', message: 'disabled' } });
    expect(error.code).toBe('AUTH_DISABLED');
  });

  it('falls back to INTERNAL for a body with no envelope', () => {
    expect(parseErrorBody({}).code).toBe('INTERNAL');
    expect(parseErrorBody(null).code).toBe('INTERNAL');
  });
});

describe('isNetworkError', () => {
  it('recognises a transport failure', () => {
    expect(isNetworkError(new Error('Network request failed'))).toBe(true);
  });

  it('does not mistake a server rejection for a transport failure', () => {
    expect(isNetworkError(fromSupabaseError({ code: '42501', message: 'ACCOUNT_DISABLED' }))).toBe(
      false,
    );
  });
});

import { AppError } from '@nagar-shield/shared';
import {
  clearPendingReset,
  isRateLimited,
  peekPendingReset,
  readAttemptsRemaining,
  readRetryAfterSeconds,
  stagePasswordReset,
  takePendingReset,
} from '@/shared/auth/passwordResetService';

/**
 * The password-reset service's pure logic.
 *
 * Two things are worth pinning here:
 *
 *   * **The in-memory hand-off.** The code the user typed must reach the
 *     password step without ever passing through a route param — a URL ends
 *     up in navigation state and in any route log, and the code is a
 *     credential. The hand-off must therefore be *taken* exactly once: a
 *     second pass through the password step must not be able to replay it.
 *
 *   * **The error-detail readers.** The cooldown and the attempt count come
 *     from the server and nowhere else, so the readers must return the
 *     server's number and must not guess when the server did not say.
 *
 * The network half of the service is proved live by `pnpm reset:check`, over
 * the real GoTrue and the real mailbox. It is not re-proved here.
 */

// The service imports the Supabase client for the capture helpers, and the
// client pulls in AsyncStorage and SecureStore — native modules that need
// their own mocks under Jest.
jest.mock('@/shared/services/submitCapture', () => ({
  supabaseUrl: () => 'http://127.0.0.1:54321',
  supabaseAnonKey: () => 'anon-key',
}));

describe('the in-memory hand-off', () => {
  beforeEach(() => {
    clearPendingReset();
  });

  it('carries the identifier and the code between the two screens', () => {
    stagePasswordReset('01711000040', '152124');

    const staged = peekPendingReset();

    expect(staged?.identifier).toBe('01711000040');
    expect(staged?.code).toBe('152124');
  });

  it('trims the identifier', () => {
    stagePasswordReset('  01711000040  ', '152124');

    expect(peekPendingReset()?.identifier).toBe('01711000040');
  });

  it('keeps the code as a string — 000123 is not 123', () => {
    stagePasswordReset('01711000040', '000123');

    expect(peekPendingReset()?.code).toBe('000123');
  });

  it('peeking does not consume the hand-off', () => {
    stagePasswordReset('01711000040', '152124');

    peekPendingReset();
    peekPendingReset();

    expect(takePendingReset()?.code).toBe('152124');
  });

  it('taking clears it, so a second pass cannot replay the code', () => {
    stagePasswordReset('01711000040', '152124');

    const first = takePendingReset();
    const second = takePendingReset();

    expect(first?.code).toBe('152124');
    expect(second).toBeNull();
  });

  it('the newest challenge replaces the older one', () => {
    stagePasswordReset('01711000040', '111111');
    stagePasswordReset('01711000040', '222222');

    expect(takePendingReset()?.code).toBe('222222');
  });

  it('clearing discards it', () => {
    stagePasswordReset('01711000040', '152124');

    clearPendingReset();

    expect(takePendingReset()).toBeNull();
  });

  it('nothing is staged before the first request', () => {
    expect(peekPendingReset()).toBeNull();
    expect(takePendingReset()).toBeNull();
  });
});

describe('the error-detail readers', () => {
  it('reads the remaining cooldown from the server', () => {
    const error = new AppError('OTP_RATE_LIMIT', { retry_after_sec: 1800 });

    expect(readRetryAfterSeconds(error)).toBe(1800);
  });

  it('reads the remaining attempts from the server', () => {
    const error = new AppError('VALIDATION_FAILED', { attempts_remaining: 2 });

    expect(readAttemptsRemaining(error)).toBe(2);
  });

  it('returns undefined rather than guessing when the server did not say', () => {
    const error = new AppError('VALIDATION_FAILED');

    expect(readRetryAfterSeconds(error)).toBeUndefined();
    expect(readAttemptsRemaining(error)).toBeUndefined();
  });

  it('ignores a non-numeric detail', () => {
    const error = new AppError('OTP_RATE_LIMIT', { retry_after_sec: 'soon' });

    expect(readRetryAfterSeconds(error)).toBeUndefined();
  });

  it('ignores a detail that is not an error at all', () => {
    expect(readRetryAfterSeconds(new Error('boom'))).toBeUndefined();
    expect(readAttemptsRemaining(null)).toBeUndefined();
  });

  it('recognises the cooldown', () => {
    expect(isRateLimited(new AppError('OTP_RATE_LIMIT'))).toBe(true);
    expect(isRateLimited(new AppError('VALIDATION_FAILED'))).toBe(false);
    expect(isRateLimited(new Error('boom'))).toBe(false);
  });
});

import { AppError } from '@nagar-shield/shared';
import { parseErrorBody, toAppError } from '@/lib/api';

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
    const original = new AppError('FORBIDDEN');
    expect(toAppError(original)).toBe(original);
  });

  it('maps a unique violation to CONFLICT', () => {
    expect(toAppError({ code: '23505' }).code).toBe('CONFLICT');
  });

  it('maps the constraint violations to VALIDATION_FAILED', () => {
    expect(toAppError({ code: '23503' }).code).toBe('VALIDATION_FAILED');
    expect(toAppError({ code: '23514' }).code).toBe('VALIDATION_FAILED');
    expect(toAppError({ code: '23502' }).code).toBe('VALIDATION_FAILED');
    expect(toAppError({ code: '22023' }).code).toBe('VALIDATION_FAILED');
  });

  it('maps insufficient privilege to FORBIDDEN', () => {
    expect(toAppError({ code: '42501' }).code).toBe('FORBIDDEN');
  });

  it('maps the not-found codes to NOT_FOUND', () => {
    expect(toAppError({ code: 'P0002' }).code).toBe('NOT_FOUND');
    expect(toAppError({ code: 'PGRST116' }).code).toBe('NOT_FOUND');
  });

  it('maps an expired JWT to AUTH_REQUIRED', () => {
    expect(toAppError({ code: 'PGRST301' }).code).toBe('AUTH_REQUIRED');
  });

  it('maps a row-level-security denial to FORBIDDEN', () => {
    expect(toAppError({ message: 'new row violates row-level security policy' }).code).toBe(
      'FORBIDDEN',
    );
  });

  it('maps a missing session to AUTH_REQUIRED', () => {
    expect(toAppError({ message: 'JWT expired' }).code).toBe('AUTH_REQUIRED');
  });

  it('collapses an unknown failure to INTERNAL', () => {
    expect(toAppError({ code: '99999', message: 'something odd' }).code).toBe('INTERNAL');
    expect(toAppError(null).code).toBe('INTERNAL');
    expect(toAppError(undefined).code).toBe('INTERNAL');
  });
});

describe('parseErrorBody', () => {
  it('reads the code out of an error envelope', () => {
    const error = parseErrorBody({
      error: { code: 'VALIDATION_FAILED', message: 'The note is required.' },
    });
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('The note is required.');
  });

  it('collapses a body with no envelope to INTERNAL', () => {
    expect(parseErrorBody(null).code).toBe('INTERNAL');
    expect(parseErrorBody({}).code).toBe('INTERNAL');
    expect(parseErrorBody({ error: {} }).code).toBe('INTERNAL');
  });
});

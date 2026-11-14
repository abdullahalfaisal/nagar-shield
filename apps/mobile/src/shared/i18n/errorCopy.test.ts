import { API_ERROR_CODES, API_ERROR_I18N_KEYS } from '@nagar-shield/shared';
import { errorCopy, errorCopyForCode } from './errorCopy';
import { bn } from './bn';
import { en } from './en';

/**
 * The localized message for an API error code.
 *
 * The screens used to build the i18n key by hand:
 *
 * ```ts
 * t(`errors.${appError.code.toLowerCase()}`)
 * ```
 *
 * which produced `errors.authrequired` — while the bundle's key is
 * `errors.authRequired`. The key did not exist, i18next fell back to
 * rendering **the key itself**, and the user saw the literal word
 * *"undefined"* where the error message should have been.
 *
 * These tests are deliberately written against the **real bundles** rather
 * than a stub. A test that mocks `t` would prove only that the helper
 * passes a string through; what matters is that the string it passes is a
 * key the bundle actually has.
 */

/** The nested value at a dotted path, or undefined. */
function bundleValue(bundle: unknown, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>(
      (carry, part) =>
        carry && typeof carry === 'object'
          ? (carry as Record<string, unknown>)[part]
          : undefined,
      bundle,
    );
  return typeof value === 'string' ? value : undefined;
}

/**
 * A `t` that resolves against the real English bundle.
 *
 * It behaves like i18next on a dotted path, and — like i18next — it returns
 * the **key itself** when the path does not resolve. That is exactly the
 * behaviour that produced the bug, so the test must reproduce it: a key that
 * is missing shows up as the key, and the assertions below catch it.
 */
function translator() {
  return ((key: string) => bundleValue(en, key) ?? key) as never;
}

describe('the error copy', () => {
  it('resolves every error code to a message that exists in the bundle', () => {
    const t = translator();

    for (const code of API_ERROR_CODES) {
      const message = errorCopy(t, code);

      // The message must be a real bundle string — not the key echoed back,
      // and never the literal "undefined".
      expect(message).not.toBe(`errors.${code.toLowerCase()}`);
      expect(message).not.toContain('undefined');
      expect(message.length).toBeGreaterThan(0);
      expect(bundleValue(en, API_ERROR_I18N_KEYS[code])).toBe(message);
    }
  });

  it('resolves the code the old template got wrong', () => {
    const t = translator();

    // `AUTH_REQUIRED`.toLowerCase() is `authrequired`; the bundle's key is
    // `errors.authRequired`. The old template produced the first, which the
    // bundle does not have.
    expect(bundleValue(en, 'errors.authrequired')).toBeUndefined();
    expect(bundleValue(en, 'errors.authRequired')).toBeDefined();

    expect(errorCopy(t, 'AUTH_REQUIRED')).toBe(bundleValue(en, 'errors.authRequired'));
  });

  it('gives the disabled account its own message, not the permission one', () => {
    const t = translator();

    // The disabled-account guard is the one that matters most: it tells the
    // user their account was disabled, which is a different fact from
    // lacking permission, and a different audience.
    expect(errorCopy(t, 'AUTH_DISABLED')).toBe(bundleValue(en, 'errors.authDisabled'));
    expect(errorCopy(t, 'AUTH_DISABLED')).not.toBe(errorCopy(t, 'FORBIDDEN'));
  });

  it('has a Bangla message for every error code', () => {
    for (const code of API_ERROR_CODES) {
      const bangla = bundleValue(bn, API_ERROR_I18N_KEYS[code]);
      expect(typeof bangla).toBe('string');
      expect((bangla as string).length).toBeGreaterThan(0);
    }
  });

  it('never shows the developer-facing message', () => {
    const t = translator();

    // The shared package's default messages are for developers. A user must
    // never see one.
    for (const code of API_ERROR_CODES) {
      const message = errorCopy(t, code);
      expect(message).not.toContain('The request failed validation');
      expect(message).not.toContain('A valid session is required');
    }
  });
});

describe('errorCopyForCode', () => {
  it('resolves a known code', () => {
    const t = translator();
    expect(errorCopyForCode(t, 'CONFLICT')).toBe(bundleValue(en, 'errors.conflict'));
  });

  it('falls back to the generic message for a code the app does not know', () => {
    const t = translator();

    // A server that grew a new code before the app shipped it must still
    // produce a readable message, not a raw key.
    const message = errorCopyForCode(t, 'SOMETHING_NEW');

    expect(message).toBe(bundleValue(en, 'errors.internal'));
    expect(message).not.toContain('undefined');
  });
});

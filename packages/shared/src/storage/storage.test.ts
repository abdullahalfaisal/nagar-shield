import { authorToken, authorTokenFromDigest } from '../storage';

/**
 * The author token.
 *
 * The token is the hex SHA-256 of the author's uuid. Three implementations
 * must agree byte for byte:
 *
 *   * this one — the mobile client and, through the generated mirror, the
 *     Edge Function;
 *   * Postgres — `encode(extensions.digest(<uuid>::text, 'sha256'), 'hex')`,
 *     which the Storage insert policy compares the path segment against;
 *   * the `finalize-capture` Edge Function, which compares the path prefix
 *     against the same hash.
 *
 * If they drift, the upload is rejected by the Storage policy and the
 * ownership check in the Edge Function refuses the finalize — a capture that
 * silently stops working. The expected values below are the ones Postgres
 * produces, so a drift fails here rather than in production.
 */

const AUTHOR_ID = '44444444-4444-4444-4444-4444444444a1';

/** The value Postgres's `encode(digest(<id>::text, 'sha256'), 'hex')` gives. */
const AUTHOR_TOKEN = '6b9c2d74fcddd172f8a6b2329a0f4197e23fec9420d118cc06c551129f085de7';

describe('the author token', () => {
  it('is the hex SHA-256 of the user id', async () => {
    await expect(authorToken(AUTHOR_ID)).resolves.toBe(AUTHOR_TOKEN);
  });

  it('is lower-case, 64 hex characters, and unseparated', async () => {
    const token = await authorToken(AUTHOR_ID);

    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not contain the user id', async () => {
    const token = await authorToken(AUTHOR_ID);

    expect(token).not.toContain(AUTHOR_ID);
    expect(token).not.toContain(AUTHOR_ID.replace(/-/g, ''));
  });

  it('is stable — the same id always produces the same token', async () => {
    await expect(authorToken(AUTHOR_ID)).resolves.toBe(await authorToken(AUTHOR_ID));
  });

  it('differs for a different id', async () => {
    const other = await authorToken('44444444-4444-4444-4444-4444444444a2');

    expect(other).not.toBe(AUTHOR_TOKEN);
  });

  it('is not reversible by a plain lookup — no id maps onto this token', async () => {
    // A cheap, non-cryptographic property: the token is not an encoding of
    // the id, so it cannot be decoded back into one.
    const token = await authorToken(AUTHOR_ID);

    expect(Buffer.from(token, 'hex').toString('utf8')).not.toContain(AUTHOR_ID);
  });
});

describe('the digest-to-token encoding', () => {
  it('renders each byte as two lower-case hex digits', () => {
    expect(authorTokenFromDigest(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('pads a byte below 0x10', () => {
    expect(authorTokenFromDigest(new Uint8Array([5]))).toBe('05');
  });

  it('renders an empty digest as an empty string', () => {
    expect(authorTokenFromDigest(new Uint8Array([]))).toBe('');
  });
});

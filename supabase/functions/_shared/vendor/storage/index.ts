/**
 * GENERATED FILE — do not edit.
 *
 * Mirrored from `packages/shared/src/storage/index.ts`.
 * Run `node tools/mirror-shared-to-functions.cjs` to regenerate, and
 * `node tools/mirror-shared-to-functions.cjs --check` to verify.
 */
/**
 * The **author token** — the second segment of a report-media storage path.
 *
 * The storage path is:
 *
 *   reports/<author_token>/<client_request_id>/<file>
 *
 * The second segment used to be the author's user id **in the clear**. That was
 * a leak, and the leak was found by a negative test on the public alert
 * detail: the detail returns the media path to any signed-in citizen so the
 * client can mint a short-lived signed URL, and a path carrying the author's
 * uuid hands every reader a stable, cross-referenceable handle on the author.
 *
 * FR-DATA-3 and `006-alerts / 009-alert-detail-screen` forbid exactly that —
 * "no author identity of any kind … no name, no avatar, no handle, no author
 * id, and no 'reported by' row of any kind". The unit brief says the same
 * thing from the schema side: `reports.author_id` is "server-side only".
 *
 * The token is the **hex SHA-256 of the author's user id**. It is:
 *
 *   * **verifiable by the author** — the Storage insert policy compares the
 *     path segment against `encode(digest(auth.uid()::text, 'sha256'), 'hex')`,
 *     and the Edge Function's ownership check compares the path prefix against
 *     the same hash. The author can therefore still prove a path is theirs;
 *   * **not invertible** — the id cannot be recovered from the token, so a
 *     reader of a public alert detail learns nothing about who filed it.
 *
 * The three implementations — this one, the Edge Function's, and Postgres's
 * `digest()` — must agree byte for byte. The Postgres side is the authority;
 * this one is the client-side mirror.
 */

/**
 * The hex SHA-256 of a user id, lower-case, unseparated.
 *
 * The pure form: it takes the digest as a byte array so it can be unit-tested
 * without a crypto runtime. `sha256Hex` wraps it with the platform digest.
 */
export function authorTokenFromDigest(digest: Uint8Array): string {
  let token = ''
  for (let index = 0; index < digest.length; index += 1) {
    token += (digest[index] ?? 0).toString(16).padStart(2, '0')
  }
  return token
}

/**
 * The hex SHA-256 of a user id.
 *
 * Uses the Web Crypto API, which is present in Hermes (through Expo's
 * polyfill), in Node 18+, and in Deno — the same runtime the Edge Functions
 * use. It is a Web Crypto API, not a Node one, so the mobile bundle and the
 * function bundle share one implementation.
 */
export async function authorToken(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(userId)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return authorTokenFromDigest(new Uint8Array(digest))
}

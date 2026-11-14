/**
 * The pure rules behind the scheduled jobs.
 *
 * These carry the **shape** of the retention rules with no I/O, so they can be
 * unit-tested in isolation and reused by the Edge Functions, the dry-run
 * tool, and the runbook.
 *
 * The authoritative age comparison is always evaluated by Postgres `now()`
 * inside the SQL predicate — a scheduler whose clock is behind can never
 * shorten a window. These helpers exist for the rule, the dry-run reporting,
 * and the tests, never as an authority on the current time.
 */

/** FR-DATA-4 — report media is hard-deleted after 90 days. */
export const MEDIA_RETENTION_DAYS = 90

/** FR-DATA-6 — a deleted account's PII is purged after the 30-day window. */
export const ACCOUNT_RECOVERY_WINDOW_DAYS = 30

/** The geocode cache TTL. A cache miss costs one re-resolve, never a failure. */
export const GEOCODE_CACHE_TTL_DAYS = 90

/** The prefix every purged-account placeholder carries. */
export const TOMBSTONE_PREFIX = 'purged-'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** The age of a timestamp in days, measured from `now`. */
export function ageInDays(timestamp: Date, now: Date = new Date()): number {
  return (now.getTime() - timestamp.getTime()) / MS_PER_DAY
}

/**
 * True when the media row is eligible for the purge.
 *
 * A withdrawn report's media is eligible **immediately** — the author already
 * asked us to remove it, so waiting the full window would be wrong.
 */
export function isMediaPurgeCandidate(
  createdAt: Date,
  reportDeletedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (reportDeletedAt) return true
  return ageInDays(createdAt, now) >= MEDIA_RETENTION_DAYS
}

/** True when the geocode cache row has outlived its TTL. */
export function isGeocodeCacheEvictionCandidate(createdAt: Date, now: Date = new Date()): boolean {
  return ageInDays(createdAt, now) >= GEOCODE_CACHE_TTL_DAYS
}

/**
 * True when the account's recovery window has closed.
 *
 * `deleted_at` and `pii_purged_at` are deliberately independent: the first
 * starts the clock ("recoverable until"), the second records the ending
 * ("the PII is gone"). An account inside the window is never a candidate.
 */
export function isAccountPurgeCandidate(
  deletedAt: Date,
  piiPurgedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (piiPurgedAt) return false
  return ageInDays(deletedAt, now) >= ACCOUNT_RECOVERY_WINDOW_DAYS
}

/**
 * Builds the non-PII tombstone values for a purged account.
 *
 * The placeholders are **not** a reversible hash of the original values and
 * they carry no PII:
 *   * the phone placeholder contains no dialable digit sequence
 *   * the email placeholder contains no `@` and no substring of the original
 *
 * The `profiles.phone` / `profiles.email` columns are `NOT NULL` and
 * `phone` is `UNIQUE`, so the scrub writes a placeholder rather than nulling
 * them — the row must survive so the report and moderation foreign keys keep
 * holding.
 */
export function buildTombstoneValues(userId: string): { phone: string; email: string } {
  const token = tombstoneToken(userId)

  return {
    phone: `${TOMBSTONE_PREFIX}${token}`,
    email: `${TOMBSTONE_PREFIX}${token}`,
  }
}

/** True when a profile row carries the tombstone placeholders. */
export function isTombstoneProfile(phone: string | null, email: string | null): boolean {
  if (!phone || !email) return false
  return phone.startsWith(TOMBSTONE_PREFIX) && email.startsWith(TOMBSTONE_PREFIX) && phone === email
}

/**
 * A short, **letters-only**, non-reversible digest of an identifier.
 *
 * FNV-1a over two seeds, encoded in base 26. The alphabet is letters only, so
 * the placeholder carries no digit sequence and no `@` — a purged row can
 * never be mistaken for a dialable number or a reachable mailbox.
 */
export function tombstoneToken(value: string): string {
  const high = fnv1a(value, 2166136261)
  const low = fnv1a(value, 0x9e3779b9)
  let combined = (BigInt(high) << 32n) | BigInt(low)

  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  let token = ''
  for (let index = 0; index < 12; index += 1) {
    token += alphabet[Number(combined % 26n)]
    combined /= 26n
  }
  return token
}

/**
 * A short, non-reversible digest of an identifier.
 *
 * FNV-1a — fast, dependency-free, and one-way. It is used for the log lines,
 * never for authentication.
 */
export function hashUserId(value: string): string {
  return fnv1a(value, 2166136261).toString(16).padStart(8, '0')
}

/** The FNV-1a 32-bit digest of a string. */
function fnv1a(value: string, seed: number): number {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

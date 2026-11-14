/**
 * Structured JSON logging for the Edge Functions.
 *
 * The rules (`memory-bank/standards/coding-standards.md` § Logging Standards):
 *   * every line is a JSON object
 *   * a request id, the job / action, and the counts are present
 *   * raw GPS coordinates, media payloads, storage paths, passwords, tokens,
 *     phone numbers, and email addresses are NEVER logged
 *
 * A storage path is deliberately absent from the allowed fields: the path
 * embeds the uploader's user id, so it is PII-adjacent.
 */

export interface LogFields {
  requestId: string
  jobName?: string
  action?: string
  itemsProcessed?: number
  itemsFailed?: number
  bytesReclaimed?: number
  durationMs?: number
  [key: string]: unknown
}

/** The keys that must never reach a log line. */
const FORBIDDEN_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'password',
  'authorization',
  'apikey',
  'api_key',
  'service_role_key',
  'storage_path',
  'storagePath',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'phone',
  'email',
  'user_id',
  'userId',
  'author_id',
  'authorId',
])

/**
 * Removes the forbidden fields from a log payload.
 *
 * A scrubbed field is replaced with `'[redacted]'` rather than dropped, so a
 * reader can still tell that the field was present.
 */
export function scrubLogFields(fields: LogFields): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key)) {
      scrubbed[key] = '[redacted]'
      continue
    }
    scrubbed[key] = value
  }

  return scrubbed
}

export function logEvent(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    ...scrubLogFields(fields),
  }

  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
    return
  }
  if (level === 'warn') {
    console.warn(line)
    return
  }
  console.info(line)
}

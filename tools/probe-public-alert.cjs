/**
 * A live probe of the **public alert detail** and the media path it returns.
 *
 * The SQL suite proves the read model's contract inside Postgres. This proves
 * the path the APP takes:
 *
 *   GoTrue → PostgREST (`alert_detail`) → Storage (a signed URL)
 *
 * and it proves the two privacy properties that the SQL suite cannot fully
 * see on its own:
 *
 *   1. **the author's uuid never reaches the client** — not in the read
 *      model's body, and not in the media path the client must name to mint a
 *      signed URL. The second path segment is the author **token**, the hex
 *      SHA-256 of the author's uuid;
 *   2. **an anonymous visitor cannot resolve a report at all** — the function
 *      is not granted to `anon`, so the call is refused rather than answered.
 *
 * The signed URL is minted through the real Storage API against the real
 * bucket, so a policy that does not actually grant the read fails here.
 *
 * Usage: node tools/probe-public-alert.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')

const API_URL = 'http://127.0.0.1:54321'

const DEV_PASSWORD = 'nagar-local-dev'
const CITIZEN_EMAIL = 'citizen@nagar.local'
const OTHER_EMAIL = 'citizen2@nagar.local'

/** The second path segment — the hex SHA-256 of the author's uuid. */
function authorToken(userId) {
  return crypto.createHash('sha256').update(userId).digest('hex')
}

function localEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  })
  const read = (key) => {
    const match = output.match(new RegExp(`${key}="([^"]+)"`))
    return match ? match[1] : ''
  }
  return {
    anonKey: read('ANON_KEY'),
    serviceRoleKey: read('SERVICE_ROLE_KEY'),
  }
}

const { anonKey, serviceRoleKey } = localEnv()

const results = []

function record(name, passed, detail = '') {
  results.push({ name, passed, detail })
  console.log(`${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function signIn(email, password) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, token: body.access_token, body }
}

async function rpc(name, body, key) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, text }
}

async function storageUpload(path, token, bytes) {
  const response = await fetch(`${API_URL}/storage/v1/object/report-media/${path}`, {
    method: 'POST',
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  return { status: response.status, text: await response.text() }
}

async function signedUrl(path, token) {
  const response = await fetch(`${API_URL}/storage/v1/object/sign/report-media/${path}`, {
    method: 'POST',
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 600 }),
  })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

async function main() {
  const citizen = await signIn(CITIZEN_EMAIL, DEV_PASSWORD)
  const other = await signIn(OTHER_EMAIL, DEV_PASSWORD)

  record('the seeded citizen can sign in', citizen.status === 200 && !!citizen.token)
  record('the second citizen can sign in', other.status === 200 && !!other.token)

  if (!citizen.token || !other.token) {
    finish()
    return
  }

  // The author's own uuid — it must never appear in anything the other
  // citizen can read.
  const authorId = citizen.body.user?.id
  const token = authorToken(authorId)

  // A report with one media, filed by the citizen.
  const clientRequestId = crypto.randomUUID()

  const finalized = await rpc(
    'finalize_capture',
    {
      p_client_request_id: clientRequestId,
      p_storage_path: `reports/${token}/${clientRequestId}/photo.jpg`,
      p_media_type: 'photo',
      p_byte_size: 4,
      p_duration_seconds: null,
      p_width: 640,
      p_height: 480,
      p_lat: 23.8103,
      p_lng: 90.4125,
      p_captured_at: new Date().toISOString(),
      p_description: 'a probe report',
      p_public_visibility: 'anonymous',
      p_category: 'theft',
    },
    citizen.token,
  )

  record(
    'the capture is finalized under the author-token path',
    finalized.status === 200,
    finalized.status === 200 ? '' : finalized.text.slice(0, 160),
  )

  if (finalized.status !== 200) {
    finish()
    return
  }

  // The RPC returns the new report's id as a bare JSON string.
  const reportId = JSON.parse(finalized.text)

  // The bytes go into the bucket at the same path, under the author's own
  // token — the insert policy must accept it.
  const uploaded = await storageUpload(
    `reports/${token}/${clientRequestId}/photo.jpg`,
    citizen.token,
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  )

  record(
    'the author may upload into their own token folder',
    uploaded.status === 200 || uploaded.status === 201,
    uploaded.status === 200 || uploaded.status === 201 ? '' : uploaded.text.slice(0, 160),
  )

  // The other citizen reads the public detail.
  const detail = await rpc('alert_detail', { p_report_id: reportId }, other.token)
  const detailBody = detail.text

  record(
    'the other citizen resolves the public alert detail',
    detail.status === 200 && detailBody.includes(reportId),
    detail.status === 200 ? '' : detailBody.slice(0, 160),
  )

  // The privacy assertions.
  record(
    'the detail body carries no author_id key',
    detail.status === 200 && !detailBody.includes('author_id'),
  )
  record(
    'the detail body carries no author uuid',
    detail.status === 200 && !detailBody.includes(authorId),
  )

  const mediaPath = detail.status === 200 ? JSON.parse(detailBody)?.media?.[0]?.storage_path : null
  record('the detail returns the media path', !!mediaPath, mediaPath ?? '')
  record(
    'the media path carries the author token, not the uuid',
    !!mediaPath && mediaPath.startsWith(`reports/${token}/`),
  )
  record('the media path carries no author uuid', !!mediaPath && !mediaPath.includes(authorId))

  // The other citizen signs the media — the Storage policy must grant it.
  //
  // The Storage API returns the path portion of the URL as `signedURL`; the
  // client prefixes the project's Storage URL to make it absolute.
  const signed = await signedUrl(mediaPath, other.token)
  const signedPath = signed.body?.signedURL
  record(
    'the other citizen may mint a signed URL for the media',
    signed.status === 200 && !!signedPath,
    signed.status === 200 ? '' : JSON.stringify(signed.body).slice(0, 160),
  )

  // The signed URL must actually fetch the bytes — a URL that is minted but
  // 404s is not a working read.
  if (signed.status === 200 && signedPath) {
    const fetched = await fetch(`${API_URL}/storage/v1${signedPath}`)
    record('the signed URL returns the media bytes', fetched.status === 200)
  }

  // The bucket is private — an unsigned read must be refused.
  const unsigned = await fetch(`${API_URL}/storage/v1/object/public/report-media/${mediaPath}`)
  record(
    'the bucket is not public — an unsigned read is refused',
    unsigned.status !== 200,
    `status ${unsigned.status}`,
  )

  // An anonymous visitor cannot resolve the detail at all.
  const anonymous = await rpc('alert_detail', { p_report_id: reportId }, anonKey)
  record(
    'an anonymous visitor is refused the alert detail',
    anonymous.status === 401 || anonymous.status === 403,
    `status ${anonymous.status}`,
  )

  finish()
}

function finish() {
  const failed = results.filter((result) => !result.passed)
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

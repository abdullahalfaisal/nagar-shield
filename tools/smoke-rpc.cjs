/**
 * A live smoke test of the REST + Auth surface.
 *
 * The SQL suites test the database. This tests the path the APP takes:
 * GoTrue → PostgREST → the `alerts_feed` RPC → the JSON envelope the mobile
 * client parses. A schema that is correct but not exposed correctly fails here
 * and nowhere else.
 *
 * Usage: node tools/smoke-rpc.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')

const API_URL = 'http://127.0.0.1:54321'

const DEV_PASSWORD = 'nagar-local-dev'
const MODERATOR_EMAIL = 'mod@nagar.local'
const CITIZEN_EMAIL = 'citizen@nagar.local'

function localEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    shell: true,
  })
  const read = (key) => {
    const match = output.match(new RegExp(`${key}="([^"]+)"`))
    return match ? match[1] : ''
  }
  return { anonKey: read('ANON_KEY'), serviceRoleKey: read('SERVICE_ROLE_KEY') }
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

async function postRpc(name, body, key) {
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

async function main() {
  // 1. The seeded accounts can sign in through GoTrue.
  const moderator = await signIn(MODERATOR_EMAIL, DEV_PASSWORD)
  record(
    'the seeded moderator can sign in',
    moderator.status === 200 && Boolean(moderator.token),
    `HTTP ${moderator.status}`,
  )

  const citizen = await signIn(CITIZEN_EMAIL, DEV_PASSWORD)
  record(
    'the seeded citizen can sign in',
    citizen.status === 200 && Boolean(citizen.token),
    `HTTP ${citizen.status}`,
  )

  // 2. The public feed RPC answers as `anon` with no session.
  const feed = await postRpc(
    'alerts_feed',
    {
      p_division: null,
      p_city: null,
      p_thana: null,
      p_neighborhood: null,
      p_cursor: null,
      p_limit: 20,
    },
    anonKey,
  )

  if (feed.status !== 200) {
    record('alerts_feed answers over REST', false, `HTTP ${feed.status}: ${feed.text}`)
    finish()
    return
  }

  const envelope = JSON.parse(feed.text)
  record(
    'alerts_feed answers over REST',
    Array.isArray(envelope.items),
    `${envelope.items?.length ?? 0} items`,
  )
  record(
    'the feed envelope carries a next_cursor key',
    'next_cursor' in envelope,
    `next_cursor = ${JSON.stringify(envelope.next_cursor)}`,
  )

  // 3. The public projection omits `author_id` at the column level.
  const hasAuthorId = (envelope.items ?? []).some((item) => 'author_id' in item)
  record('the feed items omit author_id', !hasAuthorId)

  // 4. The area filter narrows the feed by the jsonb document.
  const dhaka = await postRpc(
    'alerts_feed',
    {
      p_division: 'Dhaka',
      p_city: null,
      p_thana: null,
      p_neighborhood: null,
      p_cursor: null,
      p_limit: 20,
    },
    anonKey,
  )
  const dhakaItems = JSON.parse(dhaka.text).items ?? []
  record(
    'the division filter narrows the feed',
    dhakaItems.every((item) => item.area_hierarchy?.division === 'Dhaka'),
    `${dhakaItems.length} Dhaka items`,
  )

  // 5. A citizen is refused the moderation queue by the DATABASE.
  const citizenQueue = citizen.token
    ? await postRpc('moderation_queue', { p_cursor: null, p_limit: 20 }, citizen.token)
    : { status: 0, text: 'no token' }
  record(
    'a citizen is refused the moderation queue',
    citizenQueue.status === 401 || citizenQueue.status === 403,
    `HTTP ${citizenQueue.status}`,
  )

  // 6. The moderator gets the queue.
  const moderatorQueue = moderator.token
    ? await postRpc('moderation_queue', { p_cursor: null, p_limit: 20 }, moderator.token)
    : { status: 0, text: 'no token' }
  record(
    'a moderator gets the moderation queue',
    moderatorQueue.status === 200,
    `HTTP ${moderatorQueue.status}`,
  )

  // 7. The service role is refused the queue too — the role check lives in the
  //    function, so no key can bypass it. A service-role caller that needs the
  //    queue must impersonate a moderator.
  const serviceQueue = await postRpc(
    'moderation_queue',
    { p_cursor: null, p_limit: 20 },
    serviceRoleKey,
  )
  record(
    'the service role cannot bypass the role check',
    serviceQueue.status === 401 || serviceQueue.status === 403,
    `HTTP ${serviceQueue.status}`,
  )

  // 8. The public view is reachable over REST too.
  const view = await fetch(`${API_URL}/rest/v1/alerts_feed?select=id,captured_at&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  record('the alerts_feed view answers over REST', view.status === 200, `HTTP ${view.status}`)

  // 9. Identifier resolution works over REST for a phone number.
  const resolved = await postRpc(
    'resolve_login_identifier',
    { p_identifier: '01911000001' },
    anonKey,
  )
  record(
    'resolve_login_identifier answers over REST',
    resolved.status === 200 && JSON.parse(resolved.text || '{}').email === CITIZEN_EMAIL,
    `HTTP ${resolved.status}`,
  )

  finish()
}

function finish() {
  const failed = results.filter((result) => !result.passed)
  console.log(`\n${results.length - failed.length}/${results.length} REST smoke checks passed`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

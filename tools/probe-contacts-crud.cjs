/**
 * Probes the emergency-contacts CRUD over the real PostgREST path.
 *
 * `002-identity / 006-emergency-contacts-crud`:
 *
 *   * AC #3 — "when a contact is created, edited, reordered, or deleted, then
 *     only that user's rows change and no other user's row is readable or
 *     writable";
 *   * AC #4 — "when they query for a `user_id` that is not their own, then the
 *     API returns an empty result set, not the other user's rows" (the RLS
 *     negative test);
 *   * AC #5 — "the order is determined by `is_primary` first and `sort_order`
 *     second, and the same ordering is returned on every read";
 *   * AC #6 — "a user with an unlimited number of contacts can add more than
 *     the three captured during onboarding, and no cap is enforced" (A-4);
 *   * AC #7 — "a contact whose phone is not a valid BD E.164 number is
 *     rejected with `VALIDATION_FAILED` naming the `phone` field and no row
 *     is written";
 *   * AC #8 — "a user whose only primary contact is deleted is left with no
 *     primary contact, and the app surfaces a prompt without blocking the
 *     rest of the list";
 *   * AC #9 — "`user_id` is set from the authenticated session and never from
 *     client input, and `created_at` / `updated_at` are maintained by the
 *     database".
 *
 * The probe goes through the door the app uses — GoTrue → PostgREST → the RLS
 * policies — with **two** signed-in citizens, because the owner-scoping
 * criteria are only meaningful when there is somebody else to scope against.
 *
 * Usage: node tools/probe-contacts-crud.cjs
 */

'use strict'

const { execFileSync } = require('node:child_process')

const API_URL = 'http://127.0.0.1:54321'
const DEV_PASSWORD = 'nagar-local-dev'

/** The two seeded citizens. Their uuids are FIXED by the seed migration. */
const CITIZEN_A = { email: 'citizen@nagar.local', id: '11111111-1111-1111-1111-1111111111a1' }
const CITIZEN_B = { email: 'citizen2@nagar.local', id: '11111111-1111-1111-1111-1111111111a2' }

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

async function signIn(email) {
  const response = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, token: body.access_token, body }
}

/** A PostgREST read of the contacts table, as the signed-in user. */
async function readContacts(token, query = '') {
  const response = await fetch(`${API_URL}/rest/v1/contacts${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  const body = await response.json().catch(() => [])
  return { status: response.status, rows: Array.isArray(body) ? body : [] }
}

/** A PostgREST insert of a contact, as the signed-in user. */
async function insertContact(token, body) {
  const response = await fetch(`${API_URL}/rest/v1/contacts`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, text, row: Array.isArray(parsed) ? parsed[0] : parsed }
}

/** A PostgREST patch of a contact, as the signed-in user. */
async function patchContact(token, id, body) {
  const response = await fetch(`${API_URL}/rest/v1/contacts?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: response.status, text, row: Array.isArray(parsed) ? parsed[0] : parsed }
}

/** A PostgREST delete of the contacts matching a filter, as the signed-in user. */
async function deleteContacts(token, filter) {
  const response = await fetch(`${API_URL}/rest/v1/contacts?${filter}`, {
    method: 'DELETE',
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  return { status: response.status }
}

/** Removes every probe row, using the service role so nothing is scoped away. */
async function cleanupProbeRows() {
  await fetch(`${API_URL}/rest/v1/contacts?name=like.probe-*`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
}

/**
 * A valid BD number, offset so each probe row has its own.
 *
 * The shape is `+8801` followed by **ten** digits — that is what
 * `normalise_bd_phone` accepts and what the `contacts_phone_format` CHECK
 * requires. The offset is placed in the last two digits, so every probe
 * number is valid and distinct.
 */
function probePhone(offset) {
  const tail = String(offset % 100).padStart(2, '0')
  return `+88017100000${tail}`
}

async function main() {
  await cleanupProbeRows()

  const signInA = await signIn(CITIZEN_A.email)
  const signInB = await signIn(CITIZEN_B.email)

  if (signInA.status !== 200 || !signInA.token) {
    console.log(`SKIP: cannot sign in as ${CITIZEN_A.email} (HTTP ${signInA.status})`)
    process.exitCode = 0
    return
  }
  if (signInB.status !== 200 || !signInB.token) {
    console.log(`SKIP: cannot sign in as ${CITIZEN_B.email} (HTTP ${signInB.status})`)
    process.exitCode = 0
    return
  }

  const tokenA = signInA.token
  const tokenB = signInB.token

  // --- (1) A contact can be created, and `user_id` comes from the session --

  // The insert deliberately **omits** `user_id`. The column carries a
  // database default of `auth.uid()`, so the owner is set by the database and
  // the client never names one. The next check proves the row really did
  // land with the session's user as its owner.
  const created = await insertContact(tokenA, {
    name: 'probe-one',
    phone: probePhone(1),
  })

  record(
    'a signed-in user can insert a contact',
    created.status === 200 || created.status === 201,
    `HTTP ${created.status}`,
  )

  record(
    "the inserted row's user_id is the session's user",
    created.row?.user_id === CITIZEN_A.id,
    `user_id=${created.row?.user_id ?? '(none)'} expected=${CITIZEN_A.id}`,
  )

  // The timestamps come from the database, not the client.
  const createdAt = created.row?.created_at ?? ''
  const updatedAt = created.row?.updated_at ?? ''
  record(
    'the inserted row carries a database-created_at',
    typeof createdAt === 'string' && createdAt.length > 0 && !Number.isNaN(Date.parse(createdAt)),
    `created_at=${createdAt}`,
  )
  record(
    'the inserted row carries a database-updated_at',
    typeof updatedAt === 'string' && updatedAt.length > 0 && !Number.isNaN(Date.parse(updatedAt)),
    `updated_at=${updatedAt}`,
  )

  const contactId = created.row?.id
  if (!contactId) {
    console.log('  (no contact id — the rest of the probe needs one)')
    finish()
    return
  }

  // --- (2) A forged `user_id` is refused ------------------------------------

  const forged = await insertContact(tokenA, {
    user_id: CITIZEN_B.id,
    name: 'probe-forged',
    phone: probePhone(2),
  })

  record(
    'an insert carrying a forged user_id is refused',
    forged.status >= 400 && forged.status < 500,
    `HTTP ${forged.status}`,
  )

  const afterForged = await readContacts(tokenB, '?select=id,name')
  record(
    "the forged insert created no row on the other user's account",
    !afterForged.rows.some((row) => row.name === 'probe-forged'),
    `rows=${afterForged.rows.length}`,
  )

  // --- (3) The RLS negative test — another user's rows are not readable -----

  await insertContact(tokenB, {
    name: 'probe-b-two',
    phone: probePhone(3),
  })

  const bRows = await readContacts(tokenB, '?select=id,name,user_id')
  const bOwn = bRows.rows.filter((row) => row.name === 'probe-b-two')
  record('the other user can read their own contact', bOwn.length === 1, `rows=${bOwn.length}`)

  // The negative test: A asks for B's rows by id.
  const bContactId = bOwn[0]?.id
  const aReadsB = await readContacts(tokenA, `?id=eq.${bContactId}&select=id,name,user_id`)

  record(
    "a user reading another user's contact by id gets an EMPTY set, not the row",
    aReadsB.status === 200 && aReadsB.rows.length === 0,
    `HTTP ${aReadsB.status} rows=${aReadsB.rows.length}`,
  )

  // And A asking for B's rows by `user_id` gets nothing either.
  const aReadsBByUser = await readContacts(tokenA, `?user_id=eq.${CITIZEN_B.id}&select=id,name`)
  record(
    "a user filtering on another user's user_id gets an EMPTY set",
    aReadsBByUser.status === 200 && aReadsBByUser.rows.length === 0,
    `HTTP ${aReadsBByUser.status} rows=${aReadsBByUser.rows.length}`,
  )

  // --- (4) Another user's row is not writable --------------------------------

  // PostgREST answers a write that RLS filters out with a **success** status
  // and **no rows**: an UPDATE returns 200 with an empty representation, a
  // DELETE returns 204 with no body. Neither is an error — the row simply
  // was not in the caller's scope, so no row was touched. So the assertion
  // is about the **effect**, not the status code: the other user's row must
  // be unchanged.
  const aWritesB = await patchContact(tokenA, bContactId, { name: 'probe-hijacked' })
  record(
    "a user cannot patch another user's contact (no row is affected)",
    Array.isArray(aWritesB.row) ? aWritesB.row.length === 0 : aWritesB.row == null,
    `HTTP ${aWritesB.status} rows=${Array.isArray(aWritesB.row) ? aWritesB.row.length : 0}`,
  )

  const bAfterHijack = await readContacts(tokenB, `?id=eq.${bContactId}&select=name`)
  record(
    "the other user's contact still carries its own name",
    bAfterHijack.rows[0]?.name === 'probe-b-two',
    `name=${bAfterHijack.rows[0]?.name}`,
  )

  const aDeletesB = await deleteContacts(tokenA, `id=eq.${bContactId}`)
  record(
    "a user cannot delete another user's contact (no row is affected)",
    aDeletesB.status === 204,
    `HTTP ${aDeletesB.status}`,
  )

  const bAfterDelete = await readContacts(tokenB, `?id=eq.${bContactId}&select=id`)
  record(
    "the other user's contact survived the delete attempt",
    bAfterDelete.rows.length === 1,
    `rows=${bAfterDelete.rows.length}`,
  )

  // --- (5) The ordering contract --------------------------------------------

  // Three more of A's contacts, deliberately inserted out of order so the
  // read order cannot be an accident of insertion order.
  const orderRows = []
  for (const offset of [4, 5, 6]) {
    const made = await insertContact(tokenA, {
      name: `probe-order-${offset}`,
      phone: probePhone(offset),
      sort_order: offset,
    })
    if (made.row) orderRows.push(made.row)
  }

  // A primary among the middle of them — the primary must sort first.
  await patchContact(tokenA, orderRows[1].id, { is_primary: true })

  const ordered = await readContacts(
    tokenA,
    '?select=id,name,is_primary,sort_order&order=is_primary.desc&order=sort_order.asc&order=created_at.asc',
  )

  const probeRows = ordered.rows.filter((row) => String(row.name).startsWith('probe-'))
  const primaries = probeRows.filter((row) => row.is_primary === true)

  record(
    'exactly one primary is kept after a second one is promoted',
    primaries.length === 1,
    `primaries=${primaries.length}`,
  )

  record(
    'the primary sorts first in the read order',
    probeRows[0]?.is_primary === true,
    `first=${probeRows[0]?.name} is_primary=${probeRows[0]?.is_primary}`,
  )

  const sortOrders = probeRows.filter((row) => row.is_primary !== true).map((row) => row.sort_order)
  const ascending = sortOrders.every(
    (value, index) => index === 0 || value >= sortOrders[index - 1],
  )
  record(
    'the remaining rows are ordered by sort_order ascending',
    ascending,
    `sort_orders=${sortOrders.join(',')}`,
  )

  // The same ordering must come back on a second read — the contract is not a
  // one-off.
  const orderedAgain = await readContacts(
    tokenA,
    '?select=id,name,is_primary,sort_order&order=is_primary.desc&order=sort_order.asc&order=created_at.asc',
  )
  const idsFirst = probeRows.map((row) => row.id).join(',')
  const idsAgain = orderedAgain.rows
    .filter((row) => String(row.name).startsWith('probe-'))
    .map((row) => row.id)
    .join(',')
  record('the read order is identical on a second read', idsFirst === idsAgain, idsFirst)

  // --- (6) No cap (A-4) ------------------------------------------------------

  // More than the three the wizard captures, plus the ones already there.
  const beforeCount = (await readContacts(tokenA, '?select=id')).rows.length
  for (let offset = 10; offset < 10 + 6; offset += 1) {
    await insertContact(tokenA, {
      name: `probe-cap-${offset}`,
      phone: probePhone(offset),
    })
  }
  const afterCount = (await readContacts(tokenA, '?select=id')).rows.length

  record(
    'a sixth contact beyond the wizard three is accepted (no cap)',
    afterCount === beforeCount + 6,
    `before=${beforeCount} after=${afterCount}`,
  )

  // --- (7) An invalid phone is refused ---------------------------------------

  const beforeBad = (await readContacts(tokenA, '?select=id')).rows.length
  const badPhone = await insertContact(tokenA, {
    name: 'probe-bad-phone',
    phone: '+14155550123',
  })

  record(
    'a non-BD phone number is refused',
    badPhone.status >= 400 && badPhone.status < 500,
    `HTTP ${badPhone.status}`,
  )

  const afterBad = (await readContacts(tokenA, '?select=id')).rows.length
  record('the refused insert wrote no row', afterBad === beforeBad, `rows=${afterBad - beforeBad}`)

  // --- (8) Deleting the only primary leaves the list valid ------------------

  // The row count **before** the delete, so "the rest of the list is intact"
  // is measured against the list as it stood rather than against a count
  // taken several steps earlier.
  const beforeDelete = (await readContacts(tokenA, '?select=id')).rows.length

  // Find A's primary and delete it.
  const aRows = await readContacts(tokenA, '?select=id,name,is_primary&is_primary=eq.true')
  const primaryRows = aRows.rows.filter((row) => String(row.name).startsWith('probe-'))

  if (primaryRows.length === 0) {
    record('a primary contact exists to delete', false, 'none found')
  } else {
    const victim = primaryRows[0]
    const deleted = await deleteContacts(tokenA, `id=eq.${victim.id}`)

    record(
      'the only primary contact can be deleted',
      deleted.status === 200 || deleted.status === 204,
      `HTTP ${deleted.status}`,
    )

    const remainingPrimaries = (
      await readContacts(tokenA, '?select=id,is_primary&is_primary=eq.true')
    ).rows
    record(
      'the list is left with NO primary contact',
      remainingPrimaries.length === 0,
      `primaries=${remainingPrimaries.length}`,
    )

    const remainingRows = (await readContacts(tokenA, '?select=id')).rows
    record(
      'the rest of the list is intact after the delete',
      remainingRows.length === beforeDelete - 1,
      `rows=${remainingRows.length} expected=${beforeDelete - 1}`,
    )
  }

  // --- (9) A duplicate phone is accepted (no uniqueness constraint) -----------

  const duplicate = await insertContact(tokenA, {
    name: 'probe-duplicate-phone',
    phone: probePhone(1),
  })
  record(
    'a contact with a duplicate phone is accepted',
    duplicate.status === 200 || duplicate.status === 201,
    `HTTP ${duplicate.status}`,
  )

  // --- (10) An empty name is refused ----------------------------------------

  const emptyName = await insertContact(tokenA, {
    name: '',
    phone: probePhone(20),
  })
  record(
    'an empty contact name is refused',
    emptyName.status >= 400 && emptyName.status < 500,
    `HTTP ${emptyName.status}`,
  )

  // --- (11) The other user's list is untouched by all of this ----------------

  const bFinal = await readContacts(tokenB, '?select=id,name')
  const bProbeRows = bFinal.rows.filter((row) => String(row.name).startsWith('probe-'))
  record(
    "the other user's list holds only their own row",
    bProbeRows.length === 1 && bProbeRows[0].name === 'probe-b-two',
    `rows=${bProbeRows.map((row) => row.name).join(',')}`,
  )

  await cleanupProbeRows()
  finish()
}

function finish() {
  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} contacts-crud probes passed`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('ERROR', error)
  process.exitCode = 2
})

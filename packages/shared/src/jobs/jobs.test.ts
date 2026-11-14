import {
  ACCOUNT_RECOVERY_WINDOW_DAYS,
  GEOCODE_CACHE_TTL_DAYS,
  MEDIA_RETENTION_DAYS,
  buildTombstoneValues,
  hashUserId,
  isAccountPurgeCandidate,
  isGeocodeCacheEvictionCandidate,
  isMediaPurgeCandidate,
  isTombstoneProfile,
  tombstoneToken,
} from '../jobs'

const NOW = new Date('2026-11-05T00:00:00.000Z')

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('the media retention cut-off', () => {
  it('keeps a candidate at 89 days and purges one at 90 days', () => {
    expect(isMediaPurgeCandidate(daysAgo(89), null, NOW)).toBe(false)
    expect(isMediaPurgeCandidate(daysAgo(90), null, NOW)).toBe(true)
    expect(isMediaPurgeCandidate(daysAgo(91), null, NOW)).toBe(true)
  })

  it('makes a withdrawn report eligible immediately', () => {
    expect(isMediaPurgeCandidate(daysAgo(0), daysAgo(2), NOW)).toBe(true)
  })

  it('uses the 90-day window', () => {
    expect(MEDIA_RETENTION_DAYS).toBe(90)
  })
})

describe('the geocode cache cut-off', () => {
  it('keeps a row at 89 days and evicts one at 90 days', () => {
    expect(isGeocodeCacheEvictionCandidate(daysAgo(89), NOW)).toBe(false)
    expect(isGeocodeCacheEvictionCandidate(daysAgo(90), NOW)).toBe(true)
  })

  it('uses the 90-day TTL', () => {
    expect(GEOCODE_CACHE_TTL_DAYS).toBe(90)
  })
})

describe('the account recovery window', () => {
  it('keeps a deletion at 29 days and purges one at 30 days', () => {
    expect(isAccountPurgeCandidate(daysAgo(29), null, NOW)).toBe(false)
    expect(isAccountPurgeCandidate(daysAgo(30), null, NOW)).toBe(true)
  })

  it('skips an account that has already been scrubbed', () => {
    expect(isAccountPurgeCandidate(daysAgo(90), daysAgo(1), NOW)).toBe(false)
  })

  it('uses the 30-day window', () => {
    expect(ACCOUNT_RECOVERY_WINDOW_DAYS).toBe(30)
  })
})

describe('the tombstone builder', () => {
  const userId = '11111111-1111-1111-1111-1111111111a1'

  it('produces a phone with no dialable digit sequence', () => {
    const { phone } = buildTombstoneValues(userId)
    expect(phone).toMatch(/^purged-[a-z]{12}$/)
    expect(phone).not.toMatch(/\d/)
  })

  it('produces an email with no @ and no part of the original', () => {
    const { email } = buildTombstoneValues(userId)
    expect(email).not.toContain('@')
    expect(email).not.toContain(userId)
  })

  it('is deterministic — the same id always yields the same placeholder', () => {
    expect(buildTombstoneValues(userId)).toEqual(buildTombstoneValues(userId))
  })

  it('is different for two different accounts', () => {
    expect(tombstoneToken(userId)).not.toBe(tombstoneToken('11111111-1111-1111-1111-1111111111a2'))
  })

  it('recognises its own placeholder', () => {
    const values = buildTombstoneValues(userId)
    expect(isTombstoneProfile(values.phone, values.email)).toBe(true)
    expect(isTombstoneProfile('+8801711000001', 'citizen@nagar.local')).toBe(false)
  })
})

describe('the log hash', () => {
  it('is stable and carries no part of the identifier', () => {
    const userId = '11111111-1111-1111-1111-1111111111a1'
    const hash = hashUserId(userId)
    expect(hash).toBe(hashUserId(userId))
    expect(hash).not.toContain(userId)
    expect(hash).toHaveLength(8)
  })
})

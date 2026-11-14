import {
  formatRelativeTime,
  formatRelativeTimeBn,
  formatRelativeTimeForLocale,
  toBengaliDigits,
} from '@/shared/utils/relativeTime'

const NOW = new Date('2026-11-05T12:00:00.000Z')

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString()
}

describe('formatRelativeTime', () => {
  it('reports a fresh alert as "just now"', () => {
    expect(formatRelativeTime(minutesAgo(0), NOW)).toBe('just now')
  })

  it('reports minutes below an hour', () => {
    expect(formatRelativeTime(minutesAgo(5), NOW)).toBe('5 min ago')
    expect(formatRelativeTime(minutesAgo(59), NOW)).toBe('59 min ago')
  })

  it('reports hours below a day', () => {
    expect(formatRelativeTime(minutesAgo(60), NOW)).toBe('1 hr ago')
    expect(formatRelativeTime(minutesAgo(60 * 23), NOW)).toBe('23 hr ago')
  })

  it('reports days below a week', () => {
    expect(formatRelativeTime(minutesAgo(60 * 24), NOW)).toBe('1 d ago')
    expect(formatRelativeTime(minutesAgo(60 * 24 * 6), NOW)).toBe('6 d ago')
  })

  it('reports weeks below five', () => {
    expect(formatRelativeTime(minutesAgo(60 * 24 * 7), NOW)).toBe('1 wk ago')
    expect(formatRelativeTime(minutesAgo(60 * 24 * 34), NOW)).toBe('4 wk ago')
  })

  it('reports months below a year', () => {
    expect(formatRelativeTime(minutesAgo(60 * 24 * 35), NOW)).toBe('1 mo ago')
  })

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('')
  })
})

describe('toBengaliDigits', () => {
  it('maps every ASCII digit to its Bengali form', () => {
    expect(toBengaliDigits('0123456789')).toBe('০১২৩৪৫৬৭৮৯')
  })

  it('leaves non-digit characters alone', () => {
    expect(toBengaliDigits('min ago')).toBe('min ago')
  })
})

describe('formatRelativeTimeBn', () => {
  it('uses Bengali digits and the Bengali unit words', () => {
    expect(formatRelativeTimeBn(minutesAgo(5), NOW)).toBe('৫ মিনিট আগে')
    expect(formatRelativeTimeBn(minutesAgo(60 * 3), NOW)).toBe('৩ ঘণ্টা আগে')
  })

  it('reports a fresh alert in Bengali', () => {
    expect(formatRelativeTimeBn(minutesAgo(0), NOW)).toBe('এইমাত্র')
  })
})

describe('formatRelativeTimeForLocale', () => {
  it('picks the Bengali formatter for the bn locale', () => {
    expect(formatRelativeTimeForLocale(minutesAgo(5), 'bn', NOW)).toBe('৫ মিনিট আগে')
  })

  it('picks the English formatter for every other locale', () => {
    expect(formatRelativeTimeForLocale(minutesAgo(5), 'en', NOW)).toBe('5 min ago')
  })
})

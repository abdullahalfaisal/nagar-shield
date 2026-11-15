import { en } from '@/shared/i18n/en'
import { bn } from '@/shared/i18n/bn'
import { GREETING_ICONS, GREETING_KEYS, greetingPeriod, type GreetingPeriod } from './greeting'

function at(hour: number, minute = 0): Date {
  return new Date(2026, 10, 15, hour, minute)
}

describe('greetingPeriod', () => {
  it.each<[number, number, GreetingPeriod]>([
    [4, 59, 'night'],
    [5, 0, 'morning'],
    [11, 59, 'morning'],
    [12, 0, 'afternoon'],
    [16, 59, 'afternoon'],
    [17, 0, 'evening'],
    [19, 59, 'evening'],
    [20, 0, 'night'],
    [23, 59, 'night'],
    [0, 0, 'night'],
  ])('%i:%i is %s', (hour, minute, expected) => {
    expect(greetingPeriod(at(hour, minute))).toBe(expected)
  })
})

describe('the greeting copy', () => {
  const periods = Object.keys(GREETING_KEYS) as GreetingPeriod[]

  it('has an English and a Bangla phrase for every period', () => {
    for (const period of periods) {
      const key = GREETING_KEYS[period].replace('home.', '') as keyof typeof en.home
      expect(en.home[key]).toBeTruthy()
      expect(bn.home[key]).toBeTruthy()
    }
  })

  it('has an icon for every period', () => {
    for (const period of periods) expect(GREETING_ICONS[period]).toBeTruthy()
  })

  it('says each period in Bangla in its own words', () => {
    expect(bn.home.greetingMorning).toBe('শুভ সকাল')
    expect(bn.home.greetingAfternoon).toBe('শুভ দুপুর')
    expect(bn.home.greetingEvening).toBe('শুভ সন্ধ্যা')
    expect(bn.home.greetingNight).toBe('শুভ রাত্রি')
  })
})

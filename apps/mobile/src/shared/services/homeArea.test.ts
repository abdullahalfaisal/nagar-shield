jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}))

import { shortAreaLine } from './homeArea'

describe('shortAreaLine', () => {
  it('names the neighbourhood and the city', () => {
    expect(
      shortAreaLine({
        neighborhood: 'Dhanmondi',
        thana: 'Dhanmondi',
        city: 'Dhaka',
        division: 'Dhaka',
      }),
    ).toBe('Dhanmondi, Dhaka')
  })

  it('falls back to the thana when there is no neighbourhood', () => {
    expect(shortAreaLine({ thana: 'Mirpur', city: 'Dhaka', division: 'Dhaka' })).toBe(
      'Mirpur, Dhaka',
    )
  })

  it('uses the division when the city is missing', () => {
    expect(shortAreaLine({ thana: '', city: '', division: 'Sylhet' })).toBe('Sylhet')
  })

  it('never repeats a name', () => {
    expect(shortAreaLine({ neighborhood: 'Dhaka', city: 'Dhaka' })).toBe('Dhaka')
  })

  it('is empty when nothing is known', () => {
    expect(shortAreaLine({ neighborhood: null, thana: ' ', city: '', division: null })).toBe('')
  })

  it('translates each name', () => {
    const bn: Record<string, string> = { Dhanmondi: 'ধানমন্ডি', Dhaka: 'ঢাকা' }
    expect(
      shortAreaLine({ neighborhood: 'Dhanmondi', city: 'Dhaka' }, (name) => bn[name] ?? name),
    ).toBe('ধানমন্ডি, ঢাকা')
  })
})

import { formatNational } from './formatNational'

describe('formatNational', () => {
  it('formats an E.164 number as 01712-345678', () => {
    expect(formatNational('+8801712345678')).toBe('01712-345678')
  })

  it('formats the same number written without the plus', () => {
    expect(formatNational('8801712345678')).toBe('01712-345678')
  })

  it('returns a number of an unexpected length unchanged', () => {
    expect(formatNational('12345')).toBe('12345')
  })
})

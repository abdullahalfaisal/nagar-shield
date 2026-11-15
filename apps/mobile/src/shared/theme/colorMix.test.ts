import { mixHex } from './colorMix'

describe('mixHex', () => {
  it('returns the base at weight 0 and the other colour at weight 1', () => {
    expect(mixHex('#7B1FA2', '#FFFFFF', 0)).toBe('#7B1FA2')
    expect(mixHex('#7B1FA2', '#FFFFFF', 1)).toBe('#FFFFFF')
  })

  it('lightens towards white by the given share', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })

  it('keeps each channel two hex digits wide', () => {
    expect(mixHex('#010203', '#010203', 0.3)).toBe('#010203')
  })
})

import { darkColors, lightColors, type ThemeColors } from './tokens'

/**
 * Secondary text has to be readable. WCAG 2.1 AA asks for 4.5:1 for normal
 * text; the ink ramp's 400 step does not reach it (about 3:1 on white), so
 * secondary and placeholder text uses `textMuted`. This test fails if a token
 * edit drops it under the line on any surface the text is drawn on.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const themes: Array<[string, ThemeColors]> = [
  ['light', lightColors],
  ['dark', darkColors],
]

describe.each(themes)('%s theme secondary text', (_name, colors) => {
  const surfaces = Object.entries(colors.surface).filter(([key]) => key !== 'outline')

  it.each(surfaces)('textMuted reaches 4.5:1 on surface.%s', (_key, surface) => {
    expect(contrast(colors.textMuted, surface)).toBeGreaterThanOrEqual(4.5)
  })
})

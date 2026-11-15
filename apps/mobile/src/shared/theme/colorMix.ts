/**
 * Mixes two `#RRGGBB` colours. `weight` is the share of `other`: 0 returns
 * `base`, 1 returns `other`.
 *
 * The category accents are picked to read on a light card. On the dark theme
 * the same hue has to be lightened to stay legible as a glyph, and this is the
 * one place that is done.
 */
export function mixHex(base: string, other: string, weight: number): string {
  const channel = (hex: string, start: number) =>
    parseInt(hex.replace('#', '').slice(start, start + 2), 16)
  const mixed = [0, 2, 4].map((start) => {
    const value = Math.round(channel(base, start) * (1 - weight) + channel(other, start) * weight)
    return value.toString(16).padStart(2, '0')
  })
  return `#${mixed.join('').toUpperCase()}`
}

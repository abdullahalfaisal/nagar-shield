import { typography } from './tokens'

export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold'

/**
 * The font face for a weight, in the app's language.
 *
 * Inter for English, Noto Sans Bengali for Bangla — Inter has no Bengali glyphs,
 * so Bangla set in it would fall back to whatever the phone picks. On Android a
 * custom font is chosen per weight by its family name, so this returns the family
 * and the caller must **not** also set `fontWeight` (it would fake-bold the face).
 */
export function appFont(weight: FontWeightName, language: string): string {
  const f = typography.fontFamily

  if (language === 'bn') {
    switch (weight) {
      case 'regular':
        return f.bengali
      case 'medium':
        return f.bengaliMedium
      case 'semibold':
        return f.bengaliSemiBold
      default:
        return f.bengaliBold
    }
  }

  switch (weight) {
    case 'regular':
      return f.sans
    case 'medium':
      return f.sansMedium
    case 'semibold':
      return f.sansSemiBold
    case 'bold':
      return f.sansBold
    default:
      return f.sansExtraBold
  }
}

import Svg, { Path } from 'react-native-svg'
import { SOLID_GLYPHS, type SolidIconName } from './solidGlyphs'

interface SolidIconProps {
  name: SolidIconName
  size?: number
  color: string
}

/**
 * A filled glyph from the bundled set (`solidGlyphs.ts`).
 *
 * `LineIcon` draws outlines; this draws solid shapes, which is the style the
 * Home redesign uses for the shortcuts, the header and the incident types. The
 * geometry ships with the app, so nothing is fetched and nothing needs a font.
 *
 * It is decorative: the pressable or the text beside it carries the accessible
 * name, so it is hidden from screen readers.
 */
export function SolidIcon({ name, size = 24, color }: SolidIconProps) {
  const glyph = SOLID_GLYPHS[name]

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${glyph.size} ${glyph.size}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {glyph.paths.map((d, index) => (
        <Path key={index} d={d} fill={color} />
      ))}
    </Svg>
  )
}

export type { SolidIconName }

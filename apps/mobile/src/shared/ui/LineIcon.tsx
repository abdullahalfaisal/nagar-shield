import Svg, { Circle, Path } from 'react-native-svg'
import { useTheme } from '../theme'

/**
 * Thin, even-weight line icons for the redesigned screens.
 *
 * The shapes are copied from Lucide (https://lucide.dev, ISC licence: Copyright
 * (c) 2026 Lucide Icons and Contributors) — only the few the app uses, so the
 * whole 1,500-icon package is not bundled. Every icon is drawn on a 24 × 24 grid
 * with a 2-unit round stroke, so they all look like one family at any size.
 *
 * `Icon` (Material Symbols) is still used by the screens that have not been
 * redesigned yet.
 */
/**
 * `duo` — a closed part that takes the soft fill in the duotone style.
 * `duoOnly` — drawn only in the duotone style, as the fill behind an open outline.
 */
type Shape = ({ d: string } | { cx: number; cy: number; r: number }) & {
  duo?: true
  duoOnly?: true
}

const SHAPES = {
  camera: [
    {
      d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z',
      duo: true,
    },
    { cx: 12, cy: 13, r: 3 },
  ],
  mapPin: [
    {
      d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
      duo: true,
    },
    { cx: 12, cy: 10, r: 3 },
  ],
  history: [
    { cx: 12, cy: 12, r: 9, duoOnly: true },
    { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' },
    { d: 'M3 3v5h5' },
    { d: 'M12 7v5l4 2' },
  ],
  users: [
    { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', duo: true },
    { d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    { d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { cx: 9, cy: 7, r: 4, duo: true },
  ],
  settings: [
    {
      d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
    },
    { cx: 12, cy: 12, r: 3 },
  ],
  search: [{ d: 'm21 21-4.34-4.34' }, { cx: 11, cy: 11, r: 8 }],
  siren: [
    { d: 'M7 18v-6a5 5 0 1 1 10 0v6' },
    { d: 'M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z' },
    { d: 'M21 12h1' },
    { d: 'M18.5 4.5 18 5' },
    { d: 'M2 12h1' },
    { d: 'M12 2v1' },
    { d: 'm4.929 4.929.707.707' },
    { d: 'M12 12v6' },
  ],
  chevronRight: [{ d: 'm9 18 6-6-6-6' }],
  chevronDown: [{ d: 'm6 9 6 6 6-6' }],
  // Report categories.
  backpack: [
    { d: 'M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', duo: true },
    { d: 'M8 10h8' },
    { d: 'M8 18h8' },
    { d: 'M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6' },
    { d: 'M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2' },
  ],
  alert: [
    { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', duo: true },
    { d: 'M12 9v4' },
    { d: 'M12 17h.01' },
  ],
  shieldAlert: [
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      duo: true,
    },
    { d: 'M12 8v4' },
    { d: 'M12 16h.01' },
  ],
  // Lucide's `<rect>`s are written as paths here, so the file draws only paths
  // and circles.
  banknote: [
    { d: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', duo: true },
    { cx: 12, cy: 12, r: 2 },
    { d: 'M6 12h.01M18 12h.01' },
  ],
  car: [
    { d: 'm21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8' },
    { d: 'M5 10h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z', duo: true },
    { d: 'M7 14h.01' },
    { d: 'M17 14h.01' },
    { d: 'M5 18v2' },
    { d: 'M19 18v2' },
  ],
  flame: [
    {
      d: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4',
      duo: true,
    },
  ],
  heartPulse: [
    {
      d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
      duo: true,
    },
    { d: 'M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27' },
  ],
  creditCard: [
    { d: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', duo: true },
    { d: 'M2 10h20' },
    { d: 'M6 14h2' },
  ],
  hammer: [
    { d: 'm15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9' },
    { d: 'm18 15 4-4' },
    {
      d: 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5',
      duo: true,
    },
  ],
  eye: [
    {
      d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      duo: true,
    },
    { cx: 12, cy: 12, r: 3 },
  ],
  help: [
    { cx: 12, cy: 12, r: 10, duo: true },
    { d: 'M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5' },
    { d: 'M12 17h.01' },
  ],
  // Capture.
  video: [
    { d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' },
    { d: 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', duo: true },
  ],
  eyeOff: [
    {
      d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49',
    },
    { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' },
    {
      d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143',
    },
    { d: 'm2 2 20 20' },
  ],
  paperclip: [
    {
      d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551',
    },
  ],
  fileText: [
    {
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      duo: true,
    },
    { d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { d: 'M10 9H8' },
    { d: 'M16 13H8' },
    { d: 'M16 17H8' },
  ],
  image: [
    { d: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', duo: true },
    { cx: 9, cy: 9, r: 2 },
    { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' },
  ],
  close: [{ d: 'M18 6 6 18' }, { d: 'm6 6 12 12' }],
  play: [
    {
      d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
      duo: true,
    },
  ],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  // lucide `locate-fixed`.
  locate: [
    { d: 'M2 12h3' },
    { d: 'M19 12h3' },
    { d: 'M12 2v3' },
    { d: 'M12 19v3' },
    { cx: 12, cy: 12, r: 7 },
    { cx: 12, cy: 12, r: 3, duo: true },
  ],
  // lucide `phone-call`.
  phoneCall: [
    {
      d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
      duo: true,
    },
    { d: 'M14.05 2a9 9 0 0 1 8 7.94' },
    { d: 'M14.05 6A5 5 0 0 1 18 10' },
  ],
  // lucide `map-pinned`.
  mapPinned: [
    { d: 'M18 8c0 4.5-6 9-6 9s-6-4.5-6-9a6 6 0 0 1 12 0', duo: true },
    { cx: 12, cy: 8, r: 2 },
    {
      d: 'M8.835 14H5a1 1 0 0 0-.9.7l-2 6c-.1.1-.1.2-.1.3 0 .6.4 1 1 1h18c.6 0 1-.4 1-1 0-.1 0-.2-.1-.3l-2-6a1 1 0 0 0-.9-.7h-3.835',
    },
  ],
  // Card furniture.
  clock: [{ cx: 12, cy: 12, r: 10 }, { d: 'M12 6v6l4 2' }],
  flag: [
    {
      d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528',
    },
  ],
  arrowRight: [{ d: 'M5 12h14' }, { d: 'm12 5 7 7-7 7' }],
  sun: [
    { cx: 12, cy: 12, r: 4 },
    { d: 'M12 2v2' },
    { d: 'M12 20v2' },
    { d: 'm4.93 4.93 1.41 1.41' },
    { d: 'm17.66 17.66 1.41 1.41' },
    { d: 'M2 12h2' },
    { d: 'M20 12h2' },
    { d: 'm6.34 17.66-1.41 1.41' },
    { d: 'm19.07 4.93-1.41 1.41' },
  ],
  sunset: [
    { d: 'M12 10V2' },
    { d: 'm4.93 10.93 1.41 1.41' },
    { d: 'M2 18h2' },
    { d: 'M20 18h2' },
    { d: 'm19.07 10.93-1.41 1.41' },
    { d: 'M22 22H2' },
    { d: 'm16 6-4 4-4-4' },
    { d: 'M16 18a4 4 0 0 0-8 0' },
  ],
  moon: [
    {
      d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
    },
  ],
} as const satisfies Record<string, readonly Shape[]>

export type LineIconName = keyof typeof SHAPES

interface LineIconProps {
  name: LineIconName
  size?: number
  color?: string
  /** Stroke width on the 24-unit grid. Lucide's own default is 2. */
  strokeWidth?: number
  /**
   * The duotone style: the icon's main closed part is filled with this colour
   * (pass a translucent one) under the outline. Leave it out for a plain line icon.
   */
  duotone?: string
}

export function LineIcon({ name, size = 24, color, strokeWidth = 2, duotone }: LineIconProps) {
  const theme = useTheme()
  const stroke = color ?? theme.colors.ink[700]

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: the pressable around it carries the accessible name.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {(SHAPES[name] as readonly Shape[]).map((shape, index) => {
        if (shape.duoOnly && !duotone) return null
        const fill = duotone && (shape.duo || shape.duoOnly) ? duotone : 'none'
        const outline = shape.duoOnly ? 'none' : stroke
        return 'd' in shape ? (
          <Path key={index} d={shape.d} fill={fill} stroke={outline} />
        ) : (
          <Circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={fill}
            stroke={outline}
          />
        )
      })}
    </Svg>
  )
}

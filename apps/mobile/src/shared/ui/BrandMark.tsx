import { Image, type ImageStyle, type StyleProp } from 'react-native'
import BRAND_MARK from '../../../assets/brand-mark-256.png'

interface BrandMarkProps {
  /** The side of the square tile, in dp. */
  size?: number
  /** The corner radius. Defaults to the proportion the app icon uses. */
  radius?: number
  style?: StyleProp<ImageStyle>
}

/**
 * The app's own mark: the Nagar Shield pin on its violet tile.
 *
 * It is the launcher icon, shrunk to 256 px for the screens (the 1024 px one is
 * heavy to decode for a 48 dp tile). It is decoration — the name beside it
 * carries the meaning — so it is hidden from screen readers.
 */
export function BrandMark({ size = 48, radius, style }: BrandMarkProps) {
  return (
    <Image
      source={BRAND_MARK}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        { width: size, height: size, borderRadius: radius ?? Math.round(size * 0.22) },
        style,
      ]}
    />
  )
}

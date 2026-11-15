// Images bundled with the app load as an image source.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native'

  const source: ImageSourcePropType
  export default source
}

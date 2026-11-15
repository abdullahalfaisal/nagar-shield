import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { BrandMark } from './BrandMark'

interface BrandProps {
  /** The product name — "নগর শিল্ড". */
  name: string
  /** The line under the name. */
  tagline?: string
  /** The size of the logo tile, in dp. The prototype's is 80. */
  size?: number
}

/**
 * `.brand-display` — the product's own mark (the Nagar Shield pin on its violet
 * tile, the same artwork as the launcher icon), with the name and the tagline
 * below it.
 */
export function Brand({ name, tagline, size = 80 }: BrandProps) {
  const theme = useTheme()

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.logo,
          {
            width: size,
            height: size,
            borderRadius: theme.radius.xl,
            shadowColor: '#7C3AED',
            shadowOpacity: 0.32,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 12 },
            elevation: 8,
          },
        ]}
      >
        <BrandMark size={size} radius={theme.radius.xl} />
      </View>
      <Text style={[styles.name, { color: theme.colors.ink[950] }]}>{name}</Text>
      {tagline ? (
        <Text style={[styles.tagline, { color: theme.colors.ink[500] }]}>{tagline}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    marginBottom: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 12,
    marginTop: 4,
  },
})

import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'
import { Icon } from './Icon'

interface BrandProps {
  /** The product name — "নগর শিল্ড". */
  name: string
  /** The line under the name. */
  tagline?: string
  /** The size of the logo tile, in dp. The prototype's is 80. */
  size?: number
}

/**
 * `.brand-display` — the product's own mark: a gradient tile carrying the
 * shield glyph, with the name and the tagline below it.
 *
 * The prototype renders the tile with `background: var(--grad-primary)` and
 * `border-radius: var(--r-xl)`; React Native gets the gradient from
 * `expo-linear-gradient`, which is the documented substitute.
 *
 * The logo's `::after` overlay — a white gradient across the top of the tile
 * — is a second `LinearGradient` layered over the first.
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
        <LinearGradient
          colors={[...theme.gradients.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoFill}
        >
          <Icon name="shield" size={Math.round(size * 0.55)} color="#FFFFFF" filled />
        </LinearGradient>
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
  logoFill: {
    flex: 1,
    width: '100%',
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

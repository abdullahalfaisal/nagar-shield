import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../theme'

/**
 * The prototype's Splash (screen 0) — a branded hold shown while the session
 * and fonts resolve.
 */
export function SplashView({ message }: { message?: string }) {
  const theme = useTheme()

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[...theme.gradients.hero]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.brand}>নগর শিল্ড</Text>
        <Text style={styles.brandEn}>NAGAR SHIELD</Text>
      </LinearGradient>
      {message ? (
        <Text style={[styles.message, { color: theme.colors.ink[500] }]}>{message}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  hero: {
    paddingHorizontal: 40,
    paddingVertical: 28,
    borderRadius: 28,
    alignItems: 'center',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandEn: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 4,
    marginTop: 4,
  },
  message: {
    fontSize: 13,
  },
})

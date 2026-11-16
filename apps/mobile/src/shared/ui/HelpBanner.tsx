import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../theme'
import { haptic } from '../services/haptics'
import { LineIcon } from './LineIcon'
import { usePressGuard } from './usePressGuard'

interface HelpBannerProps {
  title: string
  subtitle: string
  onPress: () => void
}

/**
 * The Home screen's emergency entry point.
 *
 * In a safety app the way to get help must not look like one of six equal
 * cards, so it is a full-width, solid-red banner above everything else. The
 * fill is flat `red[600]` rather than the app's emergency gradient: white text
 * on that gradient's light end is about 2.8:1, and on `red[600]` it is about
 * 4.8:1.
 *
 * It opens the help screen, where the user picks Police, Medical, Fire or a
 * personal contact; the dialer then asks for the final press, so this does not
 * place a call by itself.
 */
export function HelpBanner({ title, subtitle, onPress }: HelpBannerProps) {
  const theme = useTheme()
  const press = usePressGuard(onPress)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={() => {
        haptic('tap')
        press?.()
      }}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: theme.palette.red[600],
          borderRadius: theme.radius.lg,
          opacity: pressed ? 0.92 : 1,
          shadowColor: theme.palette.red[600],
        },
      ]}
    >
      <View style={styles.iconTile}>
        <LineIcon name="siren" size={26} color="#FFFFFF" />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.go}>
        <LineIcon name="arrowRight" size={18} color={theme.palette.red[600]} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  // The same 44 dp rounded square as every other icon well on Home.
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  go: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
})

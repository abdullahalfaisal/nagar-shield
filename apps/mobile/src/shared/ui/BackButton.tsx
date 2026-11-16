import { Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { SolidIcon } from './SolidIcon'
import { surfaceShadow } from './surface'
import { usePressGuard } from './usePressGuard'

/** The back button every screen uses. */
export function BackButton({ onPress }: { onPress: (() => void) | undefined }) {
  const theme = useTheme()
  const { t } = useTranslation()
  const press = usePressGuard(onPress)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={press}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.surface.white, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <SolidIcon name="chevronLeft" size={24} color={theme.colors.ink[700]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...surfaceShadow,
  },
})

import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'

interface MapZoomButtonsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}

/** The glyph colour: a fixed dark, because the map tiles are light in both themes. */
const ZOOM_GLYPH = '#11112B'

/**
 * The + and − buttons every map has, over its right edge.
 *
 * They are small and have no fill, so the glyphs sit straight on the map and
 * hide as little of it as possible. The touch area is padded out to 48 dp by
 * `hitSlop`. A map zooms with a pinch as well; the buttons are for one-handed
 * use and for anyone who cannot pinch.
 */
export function MapZoomButtons({
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}: MapZoomButtonsProps) {
  const { t } = useTranslation()

  return (
    <View style={styles.zoomControls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('location.zoomIn')}
        accessibilityState={{ disabled: !canZoomIn }}
        disabled={!canZoomIn}
        hitSlop={11}
        onPress={onZoomIn}
        style={[styles.zoomButton, { opacity: canZoomIn ? 1 : 0.35 }]}
      >
        <Icon name="add" size={22} color={ZOOM_GLYPH} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('location.zoomOut')}
        accessibilityState={{ disabled: !canZoomOut }}
        disabled={!canZoomOut}
        hitSlop={11}
        onPress={onZoomOut}
        style={[styles.zoomButton, { opacity: canZoomOut ? 1 : 0.35 }]}
      >
        <Icon name="remove" size={22} color={ZOOM_GLYPH} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  // No button fill: the glyphs sit straight on the map, with room between them.
  zoomControls: {
    position: 'absolute',
    right: 10,
    top: '50%',
    marginTop: -34,
    gap: 20,
  },
  zoomButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

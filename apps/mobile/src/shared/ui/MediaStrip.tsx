import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { withAlpha } from './AlertCard'
import { LineIcon } from './LineIcon'
import { MediaViewer, isViewable, type MediaItem } from './MediaViewer'
import { VideoFrame } from './VideoFrame'

/**
 * A report's attachments as a row of square tiles, on the alert detail and
 * on the author's own report detail.
 *
 * A photo shows itself; a video shows a play button; a document shows a file
 * icon. Tapping a photo or a video opens it full screen in the
 * {@link MediaViewer}. A tile whose URL is not signed yet, or a document,
 * is not a button.
 */
export function MediaStrip({ items }: { items: MediaItem[] }) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [openAt, setOpenAt] = useState<number | null>(null)

  const viewable = items.filter(isViewable)
  const violet = theme.palette.violet[600]

  return (
    <View style={styles.strip}>
      {items.map((item) => {
        const viewIndex = viewable.findIndex((entry) => entry.id === item.id)
        const label =
          item.kind === 'video'
            ? t('alerts.mediaVideoLabel')
            : item.kind === 'file'
              ? t('alerts.mediaFileLabel')
              : t('alerts.mediaLabel')

        return (
          <Pressable
            key={item.id}
            accessibilityRole={viewIndex >= 0 ? 'imagebutton' : 'image'}
            accessibilityLabel={label}
            accessibilityHint={viewIndex >= 0 ? t('alerts.mediaOpenHint') : undefined}
            disabled={viewIndex < 0}
            onPress={() => setOpenAt(viewIndex)}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor:
                  item.kind === 'photo' ? theme.colors.ink[100] : withAlpha(violet, 0.1),
              },
              pressed && styles.pressed,
            ]}
          >
            {item.kind === 'photo' && item.url ? (
              <Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" />
            ) : item.kind === 'video' ? (
              <>
                <VideoFrame itemId={item.id} url={item.url} style={styles.image} />
                <View style={[styles.playCircle, { backgroundColor: theme.colors.surface.white }]}>
                  <LineIcon
                    name="play"
                    size={20}
                    color={violet}
                    duotone={withAlpha(violet, 0.25)}
                  />
                </View>
              </>
            ) : (
              <LineIcon
                name={item.kind === 'file' ? 'fileText' : 'image'}
                size={26}
                color={item.kind === 'file' ? violet : theme.colors.ink[400]}
              />
            )}
          </Pressable>
        )
      })}

      <MediaViewer items={viewable} startIndex={openAt} onClose={() => setOpenAt(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  tile: {
    width: 104,
    height: 104,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.8,
  },
  image: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

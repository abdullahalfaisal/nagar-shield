import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme'
import { withAlpha } from './AlertCard'
import { LineIcon } from './LineIcon'
import { MediaViewer, isViewable, type MediaItem } from './MediaViewer'
import { SolidIcon } from './SolidIcon'
import { VideoFrame } from './VideoFrame'

/**
 * A report's attachments as one short preview with a row of thumbnails under it.
 *
 * The preview shows the chosen item; a tap opens it full screen in the
 * {@link MediaViewer}. The thumbnails choose which item the preview shows, and
 * appear only when there is more than one. A photo shows itself, a video shows
 * a play button, a document shows a file glyph. An item whose URL is not signed
 * yet, or a document, cannot be opened, so its preview is not a button.
 */
export function MediaGallery({ items }: { items: MediaItem[] }) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [selected, setSelected] = useState(0)
  const [openAt, setOpenAt] = useState<number | null>(null)

  const viewable = items.filter(isViewable)
  const violet = theme.palette.violet[theme.colors.isDark ? 400 : 700]
  const current = items[Math.min(selected, items.length - 1)]
  if (!current) return null

  const labelFor = (item: MediaItem) =>
    item.kind === 'video'
      ? t('alerts.mediaVideoLabel')
      : item.kind === 'file'
        ? t('alerts.mediaFileLabel')
        : t('alerts.mediaLabel')

  const viewIndex = viewable.findIndex((entry) => entry.id === current.id)
  const glyphColor = (item: MediaItem) => (item.kind === 'file' ? violet : theme.colors.ink[400])

  return (
    <View>
      <Pressable
        accessibilityRole={viewIndex >= 0 ? 'imagebutton' : 'image'}
        accessibilityLabel={labelFor(current)}
        accessibilityHint={viewIndex >= 0 ? t('alerts.mediaOpenHint') : undefined}
        disabled={viewIndex < 0}
        onPress={() => setOpenAt(viewIndex)}
        style={({ pressed }) => [
          styles.preview,
          {
            backgroundColor:
              current.kind === 'photo' ? theme.colors.ink[100] : withAlpha(violet, 0.12),
          },
          pressed && styles.pressed,
        ]}
      >
        {current.kind === 'photo' && current.url ? (
          <Image source={{ uri: current.url }} style={styles.image} resizeMode="cover" />
        ) : current.kind === 'video' ? (
          <>
            {/* A still from the clip, when the phone can take one. */}
            <VideoFrame itemId={current.id} url={current.url} style={StyleSheet.absoluteFill} />
            <View style={[styles.playCircle, { backgroundColor: theme.colors.surface.white }]}>
              <SolidIcon name="play" size={22} color={violet} />
            </View>
          </>
        ) : (
          <LineIcon
            name={current.kind === 'file' ? 'fileText' : 'image'}
            size={30}
            color={glyphColor(current)}
          />
        )}
        {items.length > 1 ? (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{`${selected + 1} / ${items.length}`}</Text>
          </View>
        ) : null}
      </Pressable>

      {items.length > 1 ? (
        <View style={styles.thumbs}>
          {items.map((item, index) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: index === selected }}
              accessibilityLabel={`${labelFor(item)} ${index + 1}`}
              onPress={() => setSelected(index)}
              hitSlop={2}
              style={[
                styles.thumb,
                {
                  backgroundColor:
                    item.kind === 'photo' ? theme.colors.ink[100] : withAlpha(violet, 0.12),
                  borderColor: index === selected ? violet : 'transparent',
                  opacity: index === selected ? 1 : 0.75,
                },
              ]}
            >
              {item.kind === 'photo' && item.url ? (
                <Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" />
              ) : item.kind === 'video' ? (
                <>
                  <VideoFrame itemId={item.id} url={item.url} style={StyleSheet.absoluteFill} />
                  <View style={[styles.thumbPlay, { backgroundColor: theme.colors.surface.white }]}>
                    <SolidIcon name="play" size={14} color={violet} />
                  </View>
                </>
              ) : (
                <LineIcon
                  name={item.kind === 'file' ? 'fileText' : 'image'}
                  size={18}
                  color={glyphColor(item)}
                />
              )}
            </Pressable>
          ))}
        </View>
      ) : null}

      <MediaViewer items={viewable} startIndex={openAt} onClose={() => setOpenAt(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  preview: {
    height: 128,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
  },
  image: {
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
  thumbPlay: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(14,10,31,0.66)',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  // 44 dp to look at; `hitSlop` brings the touch area to 48.
  thumb: {
    width: 64,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})

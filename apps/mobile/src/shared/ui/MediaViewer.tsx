import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useEvent } from 'expo'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useTheme } from '../theme'
import { LineIcon } from './LineIcon'

/** One attachment of a report, with its signed URL once it is known. */
export interface MediaItem {
  id: string
  kind: 'photo' | 'video' | 'file'
  /** `null` while the URL is being signed, or when it could not be. */
  url: string | null
}

/** Only a photo or a video with a URL can be opened full screen. */
export function isViewable(item: MediaItem): item is MediaItem & { url: string } {
  return item.kind !== 'file' && item.url !== null
}

interface MediaViewerProps {
  /** The viewable items, in the order the report lists them. */
  items: Array<MediaItem & { url: string }>
  /** The item to open on; `null` keeps the viewer closed. */
  startIndex: number | null
  onClose: () => void
}

/**
 * The full-screen viewer for a report's photos and videos.
 *
 * Black in both themes, one item per page, swiped sideways when a report has
 * more than one. A photo fits the screen; a video plays with the system
 * controls, and only while its page is the one on screen. The ✕ and the
 * Android back button both close it.
 */
export function MediaViewer({ items, startIndex, onClose }: MediaViewerProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [index, setIndex] = useState(startIndex ?? 0)
  const listRef = useRef<FlatList<MediaItem & { url: string }>>(null)

  // Every opening starts on the item that was tapped.
  useEffect(() => {
    if (startIndex !== null) setIndex(startIndex)
  }, [startIndex])

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
  }

  const white = theme.staticColors.white

  return (
    <Modal
      visible={startIndex !== null && items.length > 0}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={[styles.root, { backgroundColor: theme.staticColors.black }]}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item, index: i }) => (
            <View style={{ width, height }}>
              {item.kind === 'video' ? (
                <VideoPage url={item.url} active={i === index} />
              ) : (
                <PhotoPage url={item.url} width={width} height={height} />
              )}
            </View>
          )}
        />

        <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          {items.length > 1 ? (
            <View style={[styles.counter, { backgroundColor: theme.staticColors.scrim }]}>
              <Text style={[styles.counterText, { color: white }]}>
                {t('alerts.mediaCounter', { index: index + 1, total: items.length })}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('alerts.mediaClose')}
            onPress={onClose}
            hitSlop={4}
            style={[styles.closeButton, { backgroundColor: theme.staticColors.scrim }]}
          >
            <LineIcon name="close" size={22} color={white} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

/** A photo, fitted to the screen. Pinch zooms it on iOS. */
function PhotoPage({ url, width, height }: { url: string; width: number; height: number }) {
  const { t } = useTranslation()
  return (
    <ScrollView
      maximumZoomScale={3}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.centered}
    >
      <Image
        source={{ uri: url }}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityLabel={t('alerts.mediaLabel')}
      />
    </ScrollView>
  )
}

/** A video with the system controls. It plays only while its page is shown. */
function VideoPage({ url, active }: { url: string; active: boolean }) {
  const theme = useTheme()
  const { t } = useTranslation()
  const player = useVideoPlayer(url, (created) => {
    created.loop = false
  })
  const { status } = useEvent(player, 'statusChange', { status: player.status })

  useEffect(() => {
    if (active) player.play()
    else player.pause()
  }, [active, player])

  if (status === 'error') {
    return (
      <View style={[styles.fill, styles.centered]}>
        <Text style={[styles.unavailable, { color: theme.staticColors.white }]}>
          {t('alerts.mediaUnavailable')}
        </Text>
      </View>
    )
  }

  return (
    <VideoView
      player={player}
      style={styles.fill}
      contentFit="contain"
      nativeControls
      accessibilityLabel={t('alerts.mediaVideoLabel')}
    />
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailable: {
    fontSize: 14,
  },
})

import { Image, type ImageStyle, type StyleProp } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { createVideoPlayer, type VideoPlayer } from 'expo-video'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

/** How long a clip may take to become ready before the thumbnail is given up on. */
const READY_TIMEOUT_MS = 8_000

/** The widest the saved still needs to be: the card is under 400 dp wide. */
const FRAME_MAX_WIDTH = 480

/** Waits until the player has the clip's header, or throws when it takes too long. */
function waitUntilReady(player: VideoPlayer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (player.status === 'readyToPlay') {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      subscription.remove()
      reject(new Error('The video took too long to open.'))
    }, READY_TIMEOUT_MS)

    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        clearTimeout(timer)
        subscription.remove()
        resolve()
      } else if (status === 'error') {
        clearTimeout(timer)
        subscription.remove()
        reject(new Error('The video could not be opened.'))
      }
    })
  })
}

/**
 * One still from a video, saved as a small JPEG, and its file URI.
 *
 * The player only opens the clip's header and seeks to one frame, so the whole
 * video is not downloaded for a thumbnail. The frame is taken a moment in, as
 * the very first frame of a phone video is often black. `null` when the phone
 * cannot do it: the tile then shows its plain play button, as it did before.
 */
export async function extractVideoFrame(url: string): Promise<string | null> {
  let player: VideoPlayer | null = null

  try {
    player = createVideoPlayer({ uri: url })
    await waitUntilReady(player)

    const [thumbnail] = await player.generateThumbnailsAsync(0.5, { maxWidth: FRAME_MAX_WIDTH })
    if (!thumbnail) return null

    const image = await ImageManipulator.manipulate(thumbnail).renderAsync()
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 })
    return saved.uri
  } catch {
    return null
  } finally {
    player?.release()
  }
}

/**
 * The still for a video item, taken once and kept. The signed link changes
 * every ten minutes but the clip does not, so the item's id is the key and a
 * renewed link never takes a second frame.
 */
export function useVideoFrame(itemId: string | undefined, url: string | null | undefined) {
  return useQuery({
    queryKey: ['video-frame', itemId],
    enabled: Boolean(itemId && url),
    queryFn: () => extractVideoFrame(url as string),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 0,
  })
}

/**
 * A video's still, drawn to fill its tile. It draws nothing until the frame is
 * ready, or when there is none, so the tile's own colour and play button show.
 */
export function VideoFrame({
  itemId,
  url,
  style,
}: {
  itemId: string | undefined
  url: string | null | undefined
  style: StyleProp<ImageStyle>
}) {
  const { data } = useVideoFrame(itemId, url)
  if (!data) return null

  return <Image source={{ uri: data }} style={style} resizeMode="cover" />
}

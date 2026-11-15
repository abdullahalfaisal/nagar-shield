import { TurboModuleRegistry } from 'react-native'
import type * as CompressorModule from 'react-native-compressor'
import { VIDEO_COMPRESS_MAX_SIDE } from './mediaPipeline'

/**
 * The on-device video compressor.
 *
 * A phone camera records 30 seconds at 40 – 200 MB; the upload cap is 10 MB.
 * The compressor re-encodes the clip to 720p at a bitrate that fits the cap,
 * and writes the output **without** the source's metadata, so the recorded
 * location is not carried over.
 *
 * It needs a native module (`react-native-compressor`, on Nitro), which a
 * development or release build carries and Expo Go does not. In Expo Go
 * `loadVideoCompressor` returns `null` and the caller keeps the uncompressed
 * path: a video over the cap is refused with the limit it broke.
 */
export interface VideoCompressor {
  /** Re-encodes the video and resolves with the `file://` URI of the output. */
  compress(uri: string, bitrate: number, onProgress?: ProgressListener): Promise<string>
  /** The frame size of a video file, or `null` when it cannot be read. */
  frameSize(uri: string): Promise<{ width: number; height: number } | null>
}

/** Told how far the re-encode has got, from 0 to 1. */
export type ProgressListener = (progress: number) => void

/** Whether this binary can compress a video (a dev or release build, not Expo Go). */
export function canCompressVideo(): boolean {
  return requireCompressor() !== null
}

export function loadVideoCompressor(): VideoCompressor | null {
  const native = requireCompressor()
  if (!native) return null

  return {
    compress: async (uri, bitrate, onProgress) => {
      const output = await native.Video.compress(
        uri,
        {
          compressionMethod: 'manual',
          maxSize: VIDEO_COMPRESS_MAX_SIDE,
          bitrate,
          // Compress even a small clip: returning the source would return its
          // metadata with it.
          minimumFileSizeForCompress: 0,
          preserveMetadata: false,
        },
        onProgress,
      )
      return output.startsWith('file://') ? output : `file://${output}`
    },
    frameSize: async (uri) => {
      try {
        const { width, height } = await native.getVideoMetaData(uri)
        return width > 0 && height > 0 ? { width, height } : null
      } catch {
        return null
      }
    },
  }
}

/**
 * Loads `react-native-compressor` without making it a hard import.
 *
 * The package creates its native object when it is first required and throws
 * if the binary does not carry it, so a static import would take the Capture
 * screen down in Expo Go and in Jest. The registry is asked first: a failed
 * module load is reported as an error by React Native's dev mode even when it
 * is caught.
 */
function requireCompressor(): typeof CompressorModule | null {
  try {
    if (TurboModuleRegistry.get('NitroModules') == null) return null
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-compressor')
  } catch {
    return null
  }
}

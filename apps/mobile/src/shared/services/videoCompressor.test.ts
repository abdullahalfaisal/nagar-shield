/**
 * The compressor is a native module: present in a development or release
 * build, absent in Expo Go. The app must work in both, so the loader is the
 * thing under test — what it answers when the module is missing, and what it
 * asks of the module when it is there.
 */

const mockCompress = jest.fn()
const mockMetadata = jest.fn()

// The factories reach the mocks through a call, not a reference: `jest.mock`
// is hoisted above the declarations, so a direct reference would be read
// before it is initialised.
jest.mock('react-native-compressor', () => ({
  Video: { compress: (...args: unknown[]) => mockCompress(...args) },
  getVideoMetaData: (uri: string) => mockMetadata(uri),
}))

import { TurboModuleRegistry } from 'react-native'
import { canCompressVideo, loadVideoCompressor } from './videoCompressor'

const mockRegistry = { get: jest.spyOn(TurboModuleRegistry, 'get') }

beforeEach(() => {
  mockRegistry.get.mockReset()
  mockCompress.mockReset()
  mockMetadata.mockReset()
})

describe('without the native module (Expo Go)', () => {
  it('answers null, so the caller keeps the uncompressed path', () => {
    mockRegistry.get.mockReturnValue(null)

    expect(loadVideoCompressor()).toBeNull()
    expect(canCompressVideo()).toBe(false)
  })

  it('answers null when asking the registry throws', () => {
    mockRegistry.get.mockImplementation(() => {
      throw new Error('no registry')
    })

    expect(loadVideoCompressor()).toBeNull()
  })
})

describe('with the native module (a development or release build)', () => {
  beforeEach(() => {
    mockRegistry.get.mockReturnValue({} as never)
  })

  it('re-encodes to 720p at the given bitrate and drops the source metadata', async () => {
    mockCompress.mockResolvedValue('file:///cache/out.mp4')

    const output = await loadVideoCompressor()?.compress('file:///in.mov', 2_000_000)

    expect(output).toBe('file:///cache/out.mp4')
    expect(mockCompress).toHaveBeenCalledWith(
      'file:///in.mov',
      {
        compressionMethod: 'manual',
        maxSize: 1280,
        bitrate: 2_000_000,
        minimumFileSizeForCompress: 0,
        preserveMetadata: false,
      },
      undefined,
    )
  })

  it('answers a file URI when the module returns a bare path', async () => {
    mockCompress.mockResolvedValue('/data/cache/out.mp4')

    await expect(loadVideoCompressor()?.compress('file:///in.mp4', 1)).resolves.toBe(
      'file:///data/cache/out.mp4',
    )
  })

  it('reads the frame size, and answers null when it cannot', async () => {
    mockMetadata.mockResolvedValueOnce({ width: 720, height: 1280 })
    mockMetadata.mockRejectedValueOnce(new Error('unreadable'))
    const compressor = loadVideoCompressor()

    await expect(compressor?.frameSize('file:///a.mp4')).resolves.toEqual({
      width: 720,
      height: 1280,
    })
    await expect(compressor?.frameSize('file:///b.mp4')).resolves.toBeNull()
  })
})

import { createHash } from 'node:crypto'

import { sha256Hex } from './sha256'

/**
 * A pure-TypeScript digest has one job: produce exactly the bytes every other
 * SHA-256 produces. The standard test vectors pin the algorithm itself, and
 * Node's own `createHash` pins everything else — including the UTF-8 encoding
 * of a Bengali string, because a report's author id is hashed, and ids here
 * are ASCII, but the digest must not silently depend on that.
 */
function nodeSha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

describe('sha256Hex', () => {
  it('produces the standard SHA-256 of the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('produces the standard SHA-256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('matches Node for a user-id-shaped string', () => {
    const userId = '4f7b010f-e9bc-4856-bbb6-03fdb6202a37'
    expect(sha256Hex(userId)).toBe(nodeSha256Hex(userId))
  })

  it('matches Node for a multi-byte UTF-8 string', () => {
    const bengali = 'নগর শিল্ড — ঢাকা'
    expect(sha256Hex(bengali)).toBe(nodeSha256Hex(bengali))
  })

  it('matches Node across a 64-byte block boundary', () => {
    // 55 bytes fill one block exactly with the padding; 56 forces a second
    // block — the boundary where a hand-rolled digest most often goes wrong.
    for (const length of [55, 56, 57, 64, 65, 120, 121]) {
      const input = 'x'.repeat(length)
      expect(sha256Hex(input)).toBe(nodeSha256Hex(input))
    }
  })
})

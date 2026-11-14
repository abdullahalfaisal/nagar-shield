import { bn } from './bn'
import { en } from './en'

/**
 * The i18n key-parity gate.
 *
 * The story `003-mobile-design-system` names the gap: *"nothing checks that
 * `en` and `bn` have the same keys. A key added to one bundle and
 * forgotten in the other ships silently, and the Bangla screen renders
 * `undefined` for it."*
 *
 * **Why the type annotation is not enough.** `en.ts` says:
 *
 *   > "English strings. `bn` is the source of truth for the key set — this
 *   > file is typed as `TranslationSchema` so a missing key is a compile
 *   > error."
 *
 * That is true for `en ⊆ bn`: `en` cannot carry a key `bn` does not have.
 * It is **not** true for `bn ⊆ en`. `TranslationSchema` is `typeof bn`,
 * and a TypeScript object type does not require its properties to be
 * present — so a key added to `bn` and forgotten in `en` compiles
 * cleanly, and the English screen renders `undefined` for it.
 *
 * So the gate has to run at **runtime**, over the actual bundles.
 *
 * **The bug this would have caught.** The mobile app once built its error
 * key by hand at ten call sites — `t(\`errors.${appError.code.toLowerCase()}\`)`
 * — while the bundle's key is camelCase (`errors.authRequired`). Both
 * bundles carried the key faithfully; the *call site* asked for the wrong
 * one. That is a different failure from a missing key, and a parity gate
 * cannot catch it — `errorCopy.test.ts` is the guard for that one, because
 * it resolves every code through the real bundles.
 *
 * This gate is for the failure parity *can* catch: a key in one bundle
 * and not the other.
 */

/** A bundle, as a nested object of strings. */
type Bundle = Record<string, unknown>

/** Every leaf string in a bundle, with its dotted path. */
function leafPaths(value: unknown, prefix: string[] = []): string[] {
  if (typeof value === 'string') return [prefix.join('.')]

  if (typeof value !== 'object' || value === null) return []

  return Object.entries(value as Bundle).flatMap(([key, nested]) =>
    leafPaths(nested, [...prefix, key]),
  )
}

/**
 * The leaf paths of a bundle, sorted.
 *
 * Sorted so the comparison diff is stable: an unsorted comparison would
 * report the same set of differences in a different order on every run,
 * which makes a failure report harder to read.
 */
function keysOf(bundle: Bundle): string[] {
  return leafPaths(bundle).sort()
}

describe('the i18n bundles', () => {
  it('both carry a key set', () => {
    // The scan is not vacuous: a bundle that failed to load would give an
    // empty key set, and an empty set compares equal to an empty set.
    expect(keysOf(en as Bundle).length).toBeGreaterThan(400)
    expect(keysOf(bn as Bundle).length).toBeGreaterThan(400)
  })

  it('carry the same number of keys', () => {
    const english = keysOf(en as Bundle)
    const bangla = keysOf(bn as Bundle)

    expect(english.length).toBe(bangla.length)
  })

  it('carry the same key set', () => {
    const english = new Set(keysOf(en as Bundle))
    const bangla = new Set(keysOf(bn as Bundle))

    // Every key `bn` has, `en` must have too — this is the direction the
    // type annotation does **not** cover, and the one that ships a
    // silent `undefined`.
    const missingInEnglish = [...bangla].filter((key) => !english.has(key))

    // And the other way, for the same reason: `en` is typed as
    // `typeof bn`, so a key `en` had that `bn` lacked would be a
    // compile error — but a runtime gate does not assume the type is
    // still there.
    const missingInBangla = [...english].filter((key) => !bangla.has(key))

    expect({ missingInEnglish, missingInBangla }).toEqual({
      missingInEnglish: [],
      missingInBangla: [],
    })
  })

  it('carry the same namespaces', () => {
    const english = Object.keys(en as Bundle).sort()
    const bangla = Object.keys(bn as Bundle).sort()

    expect(english).toEqual(bangla)
  })

  it('do not carry an empty string', () => {
    // An empty string is a key that exists in both bundles and renders as
    // nothing. It is a missing string wearing a disguise, so it is a
    // parity failure of its own.
    const empty: string[] = []

    const walk = (value: unknown, prefix: string[] = []): void => {
      if (typeof value === 'string') {
        if (value.trim() === '') empty.push(`${prefix.join('.')} (${value.length} chars)`)
        return
      }
      if (typeof value !== 'object' || value === null) return

      for (const [key, nested] of Object.entries(value as Bundle)) {
        walk(nested, [...prefix, key])
      }
    }

    walk(en as Bundle)
    walk(bn as Bundle)

    expect(empty).toEqual([])
  })
})

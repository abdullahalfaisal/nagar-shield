import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { LOCK_MS, SAME_TARGET_MS, allowNavigation, resetNavigationGuard } from './useSafeRouter'

beforeEach(() => resetNavigationGuard())

describe('allowNavigation', () => {
  it('lets the first navigation through', () => {
    expect(allowNavigation('push:/(app)/settings', 10_000)).toBe(true)
  })

  it('swallows a double and a triple tap on the same card', () => {
    expect(allowNavigation('push:/(app)/history', 10_000)).toBe(true)
    expect(allowNavigation('push:/(app)/history', 10_100)).toBe(false)
    expect(allowNavigation('push:/(app)/history', 10_250)).toBe(false)
  })

  it('swallows a second tap on a different card inside the lock window', () => {
    expect(allowNavigation('push:/(app)/history', 10_000)).toBe(true)
    expect(allowNavigation('push:/(app)/contacts', 10_000 + LOCK_MS - 1)).toBe(false)
  })

  it('lets a deliberate second step through once the lock has passed', () => {
    expect(allowNavigation('push:/(app)/history', 10_000)).toBe(true)
    expect(allowNavigation('push:/(app)/contacts', 10_000 + LOCK_MS)).toBe(true)
  })

  it('still refuses the same place twice in a row after the lock, for a while', () => {
    expect(allowNavigation('push:/(app)/history', 10_000)).toBe(true)
    expect(allowNavigation('push:/(app)/history', 10_000 + LOCK_MS + 50)).toBe(false)
    expect(allowNavigation('push:/(app)/history', 10_000 + SAME_TARGET_MS)).toBe(true)
  })

  it('does not let two quick taps on Back leave two screens', () => {
    expect(allowNavigation('back', 10_000)).toBe(true)
    expect(allowNavigation('back', 10_150)).toBe(false)
  })

  it('does not count a refused tap against the next real one', () => {
    expect(allowNavigation('push:/a', 10_000)).toBe(true)
    expect(allowNavigation('push:/a', 10_200)).toBe(false)
    // The refused tap did not move the window: this is 500 ms after the real one.
    expect(allowNavigation('push:/b', 10_000 + LOCK_MS)).toBe(true)
  })
})

describe('every screen gets its router from the guarded hook', () => {
  const ROOT = join(__dirname, '..', '..', '..')

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full)
    }
    return out
  }

  it('imports no `useRouter` straight from expo-router', () => {
    const offenders = [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'src'))]
      .filter((file) => !file.endsWith(join('navigation', 'useSafeRouter.ts')))
      .filter((file) => {
        const code = readFileSync(file, 'utf8')
        return /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*'expo-router'/.test(code)
      })
      .map((file) => relative(ROOT, file).split(sep).join('/'))

    // A screen that takes the plain router has no tap guard: three taps open it
    // three times, and Back has to be pressed three times to get home.
    expect(offenders).toEqual([])
  })
})

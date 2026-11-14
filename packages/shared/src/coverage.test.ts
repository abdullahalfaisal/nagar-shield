import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The coverage of the shared suite.
 *
 * The story says: *"Given the shared package's test suite, when it runs, then
 * it covers every Zod schema and every enum parser."*
 *
 * "It covers" is a claim about **which names the tests mention**, and a
 * claim like that rots. A schema added last month with no test is
 * invisible — the suite is green, the coverage is not.
 *
 * So the coverage is **asserted**, the same way the boundary guard asserts
 * that its shared-name list is not stale. The list below is derived from the
 * source: every exported Zod schema and every exported enum parser. If a
 * schema is added and not listed, this test fails and says which one.
 *
 * The list is derived by **reading the source**, not by importing it: the
 * names are what the test files have to *mention*, and a name that is not
 * exported is not a gap — it is a mistake in the list.
 */

const SRC = join(__dirname)

/** Every `.ts` file in the package's `src`, excluding the tests. */
function sourceFiles(dir = SRC): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(full)
  }

  return found
}

/** Every test file in the package's `src`. */
function testFiles(dir = SRC): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...testFiles(full))
    else if (entry.name.endsWith('.test.ts')) found.push(full)
  }

  return found
}

/** The names the test files mention. */
const mentionedNames = (): Set<string> => {
  const names = new Set<string>()

  for (const file of testFiles()) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      names.add(match[1] as string)
    }
  }

  return names
}

/**
 * The first capture group of every match of `pattern` in `text`.
 *
 * `matchAll` types a capture group as `string | undefined`, and the cast to
 * `string` is sound here because every pattern used below has exactly one
 * mandatory capture group.
 */
function captures(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] as string)
}

describe('the shared suite', () => {
  const mentioned = mentionedNames()

  it('has test files', () => {
    // A suite with no tests would make every check below vacuous.
    expect(testFiles().length).toBeGreaterThan(0)
  })

  it('covers every exported Zod schema', () => {
    const schemas: string[] = []

    for (const file of sourceFiles()) {
      schemas.push(...captures(readFileSync(file, 'utf8'), /export const (\w*Schema)\b/g))
    }

    expect(schemas.length).toBeGreaterThan(0)

    const uncovered = schemas.filter((name) => !mentioned.has(name))

    expect(uncovered).toEqual([])
  })

  it('covers every exported enum parser', () => {
    const parsers: string[] = []

    for (const file of sourceFiles()) {
      // The parsers the story names: `parseReportCategory`,
      // `parseAreaHierarchy`, and the rest of the `parse*` family.
      parsers.push(...captures(readFileSync(file, 'utf8'), /export function (parse\w+)\b/g))
    }

    expect(parsers.length).toBeGreaterThan(0)

    const uncovered = parsers.filter((name) => !mentioned.has(name))

    expect(uncovered).toEqual([])
  })

  it('covers every exported enum', () => {
    const enums: string[] = []

    for (const file of sourceFiles()) {
      // The value enums are the exported `as const` arrays.
      enums.push(
        ...captures(readFileSync(file, 'utf8'), /export const ([A-Z][A-Z0-9_]*(?:S|IES))\b/g),
      )
    }

    expect(enums.length).toBeGreaterThan(0)

    const uncovered = enums.filter((name) => !mentioned.has(name))

    expect(uncovered).toEqual([])
  })

  it('covers every exported business-rule constant', () => {
    const constants: string[] = []

    for (const file of sourceFiles()) {
      constants.push(
        ...captures(readFileSync(file, 'utf8'), /export const ([A-Z][A-Z0-9_]{3,})\b/g),
      )
    }

    expect(constants.length).toBeGreaterThan(0)

    const uncovered = constants.filter((name) => !mentioned.has(name))

    expect(uncovered).toEqual([])
  })
})

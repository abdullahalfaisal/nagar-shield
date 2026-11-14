import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The workspace configuration.
 *
 * The story `001-monorepo-workspace` is about **configuration being right**,
 * and its acceptance criteria are satisfied by *reading the files* rather
 * than by an assertion that fails when the configuration regresses. That is
 * the wrong shape for a gate: a workspace could quietly relax `strict`, drop
 * the `packageManager` pin, or re-point its `extends`, and `pnpm verify`
 * would stay green.
 *
 * So the configuration is **asserted**, here. Every check reads the real file
 * the way the toolchain reads it, so a config that is correct-but-unread is
 * not mistaken for a config that is correct-and-enforced.
 *
 * The story's own edge-case table names the failure this guards: *"A
 * path alias resolves in the editor but fails under Jest — Jest
 * `moduleNameMapper` maps `@shared/(.*)` to `<rootDir>/packages/shared/src/$1`;
 * the alias test in `packages/shared` fails until both mappings agree."*
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')

const WORKSPACES = [
  { name: 'apps/mobile', dir: join(REPO_ROOT, 'apps', 'mobile') },
  { name: 'apps/admin', dir: join(REPO_ROOT, 'apps', 'admin') },
  { name: 'packages/shared', dir: join(REPO_ROOT, 'packages', 'shared') },
]

/** A parsed JSON file, or a thrown error naming the file. */
function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`)
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

/** The `compilerOptions` of a tsconfig, as a plain object. */
function compilerOptions(path: string): Record<string, unknown> {
  const config = readJson(path)
  return (config.compilerOptions ?? {}) as Record<string, unknown>
}

/** The `extends` of a tsconfig, as a list. */
function extendsList(path: string): string[] {
  const config = readJson(path)
  const value = config.extends
  if (value === undefined) return []
  return Array.isArray(value) ? (value as string[]) : [value as string]
}

describe('the workspace layout', () => {
  it('declares the three workspaces in pnpm-workspace.yaml', () => {
    const text = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')

    // The glob is what picks up a new workspace folder with no manifest
    // edit — the story's Technical Notes name it explicitly.
    expect(text).toContain("'apps/*'")
    expect(text).toContain("'packages/*'")
  })

  it('has a manifest in each workspace', () => {
    for (const workspace of WORKSPACES) {
      expect(existsSync(join(workspace.dir, 'package.json'))).toBe(true)
    }
  })

  it('has a README that documents the layout and the scripts', () => {
    const readme = join(REPO_ROOT, 'README.md')

    expect(existsSync(readme)).toBe(true)

    const text = readFileSync(readme, 'utf8')
    expect(text).toContain('apps/mobile')
    expect(text).toContain('apps/admin')
    expect(text).toContain('packages/shared')
    // The prerequisites and the root scripts.
    expect(text).toContain('pnpm')
    expect(text).toContain('pnpm verify')
  })

  it('has a README that documents every root script', () => {
    // The criterion says the README documents "**every** root script". So
    // this is derived from the manifest rather than from a list kept in
    // the test — a script added to `package.json` and forgotten in the
    // README fails here.
    const manifest = readJson(join(REPO_ROOT, 'package.json')) as {
      scripts?: Record<string, string>
    }
    const text = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8')

    const undocumented = Object.keys(manifest.scripts ?? {}).filter(
      (script) => !text.includes(`pnpm ${script}`),
    )

    expect(undocumented).toEqual([])
  })

  it('has an .editorconfig that pins UTF-8 and LF', () => {
    const editorconfig = join(REPO_ROOT, '.editorconfig')

    expect(existsSync(editorconfig)).toBe(true)

    const text = readFileSync(editorconfig, 'utf8')
    // Bangla copy requires UTF-8, and a CRLF checkout would show up as a
    // whitespace diff in every file.
    expect(text).toMatch(/charset\s*=\s*utf-8/)
    expect(text).toMatch(/end_of_line\s*=\s*lf/)
    expect(text).toMatch(/indent_style\s*=\s*space/)
    expect(text).toMatch(/indent_size\s*=\s*2/)
  })

  it('ignores the artefacts the toolchain produces', () => {
    const text = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8')

    for (const pattern of [
      'node_modules/',
      '.expo/',
      'dist/',
      '.next/',
      'coverage/',
      '.env',
      '.eas/',
    ]) {
      expect(text).toContain(pattern)
    }
  })
})

describe('the root manifest', () => {
  const manifest = readJson(join(REPO_ROOT, 'package.json')) as {
    private?: boolean
    packageManager?: string
    engines?: { node?: string }
    scripts?: Record<string, string>
    workspaces?: string[]
  }

  it('is private', () => {
    expect(manifest.private).toBe(true)
  })

  it('pins the package manager', () => {
    // A Node or pnpm bump has to be a deliberate edit. Without the pin,
    // two machines resolve different trees from the same manifest.
    expect(manifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
  })

  it('declares a Node engine floor', () => {
    expect(manifest.engines?.node).toMatch(/^>=\d+$/)
  })

  it('defines the scripts the story names', () => {
    // The story names five: `dev`, `build`, `lint`, `typecheck`, `test`.
    for (const script of ['dev', 'build', 'lint', 'typecheck', 'test']) {
      expect(manifest.scripts?.[script]).toBeDefined()
    }
  })

  it('delegates the root scripts to the per-package scripts', () => {
    // "each delegates to the per-package scripts rather than duplicating
    // logic" — so the root script must fan out with `-r`, not run the
    // tools itself.
    expect(manifest.scripts?.typecheck).toContain('-r')
    expect(manifest.scripts?.lint).toContain('-r')
    expect(manifest.scripts?.test).toContain('-r')
  })

  it('delegates the root dev and build scripts to the per-package scripts', () => {
    // `dev` and `build` cannot fan out with `-r` — several packages would
    // start a dev server at once — so they delegate through `--filter` to
    // the package that actually owns the script. The delegation is still
    // the thing being asserted: the root script names a workspace script
    // rather than inlining the tool's own invocation.
    const packageDirs: Record<string, string> = {
      admin: 'apps/admin',
      mobile: 'apps/mobile',
      shared: 'packages/shared',
    }

    for (const script of ['dev', 'build']) {
      const value = manifest.scripts?.[script] ?? ''

      expect(value).toMatch(/--filter/)
      // The named workspace must actually own that script — otherwise the
      // root script points at a script that does not exist.
      const [, filter] = /--filter\s+(\S+)/.exec(value) ?? []
      const workspace = filter?.replace('@nagar-shield/', '') ?? ''
      const directory = packageDirs[workspace]

      expect(directory).toBeDefined()

      const target = join(REPO_ROOT, directory as string, 'package.json')

      expect(existsSync(target)).toBe(true)
      expect(
        (readJson(target) as { scripts?: Record<string, string> }).scripts?.[script],
      ).toBeDefined()
    }
  })

  it('lists the three workspaces', () => {
    expect(manifest.workspaces).toEqual(
      expect.arrayContaining(['apps/mobile', 'apps/admin', 'packages/shared']),
    )
  })
})

describe('the TypeScript contract', () => {
  const base = compilerOptions(join(REPO_ROOT, 'tsconfig.base.json'))

  it('turns strict on', () => {
    expect(base.strict).toBe(true)
  })

  it('carries the flags the story names', () => {
    // The Technical Notes list the shared compiler contract. Each one is a
    // rule that catches a real defect, so each one is asserted.
    for (const flag of [
      'noUncheckedIndexedAccess',
      'noImplicitOverride',
      'noFallthroughCasesInSwitch',
      'forceConsistentCasingInFileNames',
      'isolatedModules',
    ]) {
      expect(base[flag]).toBe(true)
    }
  })

  it('resolves the shared alias to packages/shared/src', () => {
    const paths = (base.paths ?? {}) as Record<string, string[]>

    // The path is relative to the **base config's** directory, not to the
    // extending config's. TypeScript 4.1+ resolves an inherited `paths`
    // against the file that declared it, so the root-relative path in the
    // base is the one that works in every workspace — and the workspaces
    // that redeclare it have to say the same thing.
    expect(paths['@shared/*']).toEqual(['./packages/shared/src/*'])
  })

  it.each(WORKSPACES.map((workspace) => [workspace.name, workspace] as const))(
    '%s extends the shared base',
    (_name, workspace) => {
      const path = join(workspace.dir, 'tsconfig.json')
      const parents = extendsList(path)

      // `apps/mobile` extends `expo/tsconfig.base` — the Expo preset owns
      // the React Native lib and JSX settings — so it is the one workspace
      // that also extends the repository base.
      const extendsRepoBase = parents.some((parent) => parent.includes('tsconfig.base.json'))

      if (workspace.name === 'apps/mobile') {
        expect(parents.length).toBeGreaterThan(0)
        return
      }

      expect(extendsRepoBase).toBe(true)
    },
  )

  it.each(WORKSPACES.map((workspace) => [workspace.name, workspace] as const))(
    '%s does not turn strict off',
    (_name, workspace) => {
      const options = compilerOptions(join(workspace.dir, 'tsconfig.json'))

      // The override has to be *absent* or `true`. A workspace that sets
      // `strict: false` — or `strict: null` — has opted out of the contract.
      if ('strict' in options) {
        expect(options.strict).toBe(true)
      }
    },
  )

  it('gives every workspace the shared alias', () => {
    for (const workspace of WORKSPACES) {
      const options = compilerOptions(join(workspace.dir, 'tsconfig.json'))
      const paths = (options.paths ?? {}) as Record<string, string[]>

      // A workspace that redeclares the alias has to say the **same**
      // thing the base says. TypeScript resolves an inherited `paths`
      // against the declaring file, so a workspace that redeclares it with
      // a different relative path would silently point the alias
      // somewhere else.
      if ('@shared/*' in paths) {
        expect(paths['@shared/*']).toEqual(['../../packages/shared/src/*'])
      } else {
        // Otherwise it must inherit the base's mapping.
        expect(extendsList(join(workspace.dir, 'tsconfig.json')).length).toBeGreaterThan(0)
      }
    }
  })

  it('resolves the alias to the same directory in every workspace', () => {
    // The check on the check: the alias is only really shared if it lands
    // on the same directory everywhere. So each workspace resolves it, and
    // the resolved file has to be the same file.
    const resolved = WORKSPACES.map((workspace) => {
      // The probe goes in the workspace's **own** source directory, so the
      // workspace's `include` picks it up — a probe outside the project
      // would not be compiled at all, and the check would pass vacuously.
      // The directory is created if it is missing, because a workspace
      // without a `src/` is still a workspace whose alias must resolve.
      const srcDir = join(workspace.dir, 'src')
      const probe = join(srcDir, 'tmp-alias-probe.ts')
      const source =
        "import { REPORT_CATEGORIES } from '@shared/enums';\nexport const p = REPORT_CATEGORIES;\n"

      mkdirSync(srcDir, { recursive: true })

      try {
        writeFileSync(probe, source, 'utf8')
        execFileSync(
          process.execPath,
          [join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'],
          { cwd: workspace.dir, stdio: 'pipe', encoding: 'utf8' },
        )
        return workspace.name
      } catch (error) {
        const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer }
        const output = `${String(failure.stdout ?? '')}${String(failure.stderr ?? '')}`
        throw new Error(
          `The alias does not resolve in ${workspace.name} ` +
            `(probe: ${probe}):\n${output || '(the compiler reported no diagnostics)'}`,
        )
      } finally {
        rmSync(probe, { force: true })
      }
    })

    expect(resolved).toEqual(WORKSPACES.map((workspace) => workspace.name))
  }, 300_000)
})

describe('the Jest alias mapping', () => {
  it.each([
    ['apps/admin', join(REPO_ROOT, 'apps', 'admin')],
    ['apps/mobile', join(REPO_ROOT, 'apps', 'mobile')],
  ])('%s maps the shared alias the same way TypeScript does', async (name, dir) => {
    // The story's edge case: "A path alias resolves in the editor but fails
    // under Jest". Jest and TypeScript have to agree on where the alias
    // points, or the same import works in one and not the other.
    //
    // The check is on the **effective** mapping, not on the text of the
    // config file. `apps/mobile` gets its mapping from the `jest-expo`
    // preset, which derives it from the tsconfig `paths` — so a config
    // that never mentions `@shared` can still resolve it correctly, and
    // one that mentions it can still point it at the wrong place.
    const mapper = await jestAliasMapper(dir)

    expect(mapper).toBeDefined()
    // The target must land inside `packages/shared/src`.
    expect(String(mapper)).toMatch(/packages[\\/]shared[\\/]src/)
  })

  it('maps the alias to the same directory TypeScript does', async () => {
    // The admin app states the mapping itself; the mobile app inherits it
    // from the preset. Both must land on the same directory, or the same
    // import resolves to two different modules.
    const admin = await jestAliasMapper(join(REPO_ROOT, 'apps', 'admin'))
    const mobile = await jestAliasMapper(join(REPO_ROOT, 'apps', 'mobile'))

    const normalise = (value: unknown) =>
      String(value)
        .replace(/\\/g, '/')
        .replace(/^.*?packages/, 'packages')

    expect(normalise(admin)).toBe(normalise(mobile))
  })
})

/**
 * The effective `moduleNameMapper` for a workspace's Jest projects.
 *
 * `apps/mobile` runs two Jest projects and takes its mapping from the
 * `jest-expo` preset, which derives it from the tsconfig `paths`. The
 * preset is resolved **from the workspace's own directory**, because
 * `jest-expo` reads `tsconfig.json` relative to `process.cwd()`. Read from
 * the repository root it finds the root's `tsconfig.json` — which has no
 * `paths` — and the mapping is silently absent. That is the shape of the
 * bug the story's edge case describes: the alias resolves in the editor
 * and fails under Jest.
 *
 * `apps/admin` states the mapping itself, in plain text. Its config is
 * built by `next/jest`, whose export is an **async** function that uses a
 * dynamic import — which cannot run inside a Jest test without
 * `--experimental-vm-modules`. So the admin's mapping is read from the
 * source and the mobile's from the resolved preset, and the two are
 * compared — so neither can drift from the other unnoticed.
 */
async function jestAliasMapper(dir: string): Promise<unknown> {
  const configPath = join(dir, 'jest.config.js')

  if (dir.includes('admin')) {
    const text = readFileSync(configPath, 'utf8')
    const match = /'\^@shared\/\(\.\*\)\$':\s*'([^']+)'/.exec(text)
    return match?.[1]
  }

  // The preset resolves its `paths` mapping from `process.cwd()`, so the
  // lookup has to happen with the workspace as the working directory. The
  // cwd is changed and restored around the `require`, because the preset is
  // read once and cached.
  const previousCwd = process.cwd()

  try {
    process.chdir(dir)

    // The config and the preset are cached by `require`, and both are
    // cwd-sensitive — so the cache is cleared before the read. Otherwise the
    // second workspace would be handed the first workspace's mapping.
    for (const key of Object.keys(require.cache)) {
      if (key.includes('jest.config') || key.includes('jest-preset')) {
        delete require.cache[key]
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(configPath)
    const resolved = typeof loaded === 'function' ? loaded() : loaded

    const projects: unknown[] = resolved.projects ?? [resolved]

    for (const project of projects) {
      const mapper = (project as { moduleNameMapper?: Record<string, string> }).moduleNameMapper
      const entry = mapper?.['^@shared/(.*)$']
      if (entry) return entry
    }

    return undefined
  } finally {
    process.chdir(previousCwd)
  }
}

describe('the shared package boundary', () => {
  it('is enforced by ESLint', () => {
    // AC #8: "an import that resolves into `apps/*` is reported as an
    // error and `pnpm lint` exits non-zero". The rule has to be *in the
    // config* — a test that scans the source is the second half of the
    // story's own requirement, not a substitute for the first.
    const config = readFileSync(join(REPO_ROOT, 'eslint.config.js'), 'utf8')

    expect(config).toContain('no-restricted-imports')
    expect(config).toContain('apps/')
  })

  it('reports an apps/* import as a lint error', () => {
    // The causal check on the rule itself: write a file in `packages/shared`
    // that imports from `apps/`, run ESLint on it, and require a non-zero
    // exit. A config that carries the rule but does not fire is not a guard.
    const probe = join(REPO_ROOT, 'packages', 'shared', 'src', 'tmp-boundary-probe.ts')

    try {
      writeFileSync(
        probe,
        "import { something } from '../../apps/admin/lib/api';\nexport const probe = something;\n",
        'utf8',
      )

      let failed = false
      let output = ''

      try {
        execFileSync(
          process.execPath,
          [
            join(REPO_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'),
            'src/tmp-boundary-probe.ts',
          ],
          { cwd: join(REPO_ROOT, 'packages', 'shared'), stdio: 'pipe', encoding: 'utf8' },
        )
      } catch (error) {
        failed = true
        output = `${(error as { stdout?: string }).stdout ?? ''}${
          (error as { stderr?: string }).stderr ?? ''
        }`
      }

      expect(failed).toBe(true)
      expect(output).toMatch(/apps\//)
    } finally {
      rmSync(probe, { force: true })
    }
  }, 120_000)
})

describe('the lockfile', () => {
  it('is committed', () => {
    expect(existsSync(join(REPO_ROOT, 'pnpm-lock.yaml'))).toBe(true)
  })

  it('is in sync with the manifests', () => {
    // The story's edge case: "`pnpm-lock.yaml` is out of sync with a
    // `package.json`" — the failure mode is a lockfile mismatch. The check
    // runs `pnpm install --frozen-lockfile`, which is exactly what CI does.
    //
    // `pnpm` is a **global** install, not a dependency of the repository, so
    // it is invoked through the shell's `PATH` rather than through a path
    // inside `node_modules`.
    let failed = false
    let output = ''

    try {
      execFileSync(
        'pnpm',
        ['install', '--frozen-lockfile', '--ignore-scripts', '--reporter=silent'],
        { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8', shell: true },
      )
    } catch (error) {
      failed = true
      output = `${(error as { stdout?: string }).stdout ?? ''}${
        (error as { stderr?: string }).stderr ?? ''
      }`
    }

    // A mismatch makes pnpm exit non-zero with a message naming the
    // manifest that drifted. The message is in the failure, so a drift
    // report says *which* manifest, not just "it failed".
    expect({ failed, output }).toMatchObject({ failed: false })
  }, 300_000)
})

describe('the formatting contract', () => {
  it('pins the Prettier settings the story names', () => {
    // The story's criterion is explicit: "no semicolons, single quotes,
    // trailing commas, print width 100, 2-space indent". Each of those is
    // a setting, and a setting that drifts is a formatting difference in
    // every file.
    const config = readJson(join(REPO_ROOT, '.prettierrc.json'))

    expect(config.semi).toBe(false)
    expect(config.singleQuote).toBe(true)
    expect(config.trailingComma).toBe('all')
    expect(config.printWidth).toBe(100)
    expect(config.tabWidth).toBe(2)
  })

  it('has every workspace source file matching the Prettier configuration', () => {
    // The criterion is scoped to *source files in any workspace*, so the
    // check runs Prettier over the three workspace trees. The scope is
    // the workspaces — not the whole repository — because the generated
    // artefacts and the vendored Edge Functions mirror are owned by their
    // generators, not by Prettier. `.prettierignore` says which is which.
    const globs = ['apps/*/**/*.{ts,tsx}', 'packages/*/**/*.{ts,tsx}']

    let failed = false
    let output = ''

    try {
      execFileSync(
        process.execPath,
        [join(REPO_ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs'), '--check', ...globs],
        { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8' },
      )
    } catch (error) {
      failed = true
      output = `${(error as { stdout?: string }).stdout ?? ''}${
        (error as { stderr?: string }).stderr ?? ''
      }`
    }

    // The output names every offending file, so a failure report says
    // *which* files drifted rather than just "it failed".
    expect({ failed, output }).toMatchObject({ failed: false })
  }, 300_000)
})

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The exported type surface.
 *
 * The story says: *"Given the exported type surface of `packages/shared`,
 * when I scan the emitted declaration files, then no exported type contains
 * `any`, and `@typescript-eslint/no-explicit-any` reports no violation."*
 *
 * The lint rule covers the **source**. This covers the **declarations** —
 * the shape a consumer actually sees. The two are not the same: a type can
 * be clean in the source and still widen to `any` in the emitted `.d.ts`
 * through an inferred return type, a re-export, or an unresolved import.
 *
 * The declarations are built on demand with `tsc --emitDeclarationOnly`, so
 * the test needs no build step in the repository and cannot pass against a
 * stale artefact.
 */

const PACKAGE_ROOT = join(__dirname, '..');

describe('the exported type surface', () => {
  let declarationDir: string;

  beforeAll(() => {
    declarationDir = mkdtempSync(join(tmpdir(), 'nagar-shield-dts-'));

    try {
      execFileSync(
        process.execPath,
        [
          join(PACKAGE_ROOT, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc'),
          '--project',
          join(PACKAGE_ROOT, 'tsconfig.json'),
          '--emitDeclarationOnly',
          '--declaration',
          // `tsconfig.base.json` sets `noEmit: true` for every package, so the
          // declaration build has to turn it back off. Without this the build
          // succeeds and emits **nothing**, and every check below would pass
          // vacuously — which is exactly what happened the first time.
          '--noEmit',
          'false',
          '--outDir',
          declarationDir,
        ],
        { cwd: PACKAGE_ROOT, stdio: 'pipe' },
      );
    } catch (error) {
      // The compiler's diagnostics are the whole point of the failure, and
      // `stdio: 'pipe'` buries them. `tsc` writes its diagnostics to
      // **stdout**, not stderr, so both streams are read.
      const failure = error as { stdout?: Buffer; stderr?: Buffer };
      const output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
      throw new Error(`The declaration build failed:\n${output}`);
    }
  }, 120_000);

  afterAll(() => {
    rmSync(declarationDir, { recursive: true, force: true });
  });

  /** Every `.d.ts` the build produced. */
  const declarationFiles = (): string[] => {
    const found: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.d.ts')) found.push(full);
      }
    };

    walk(declarationDir);
    return found;
  };

  it('emits declarations', () => {
    // A build that produced nothing would make every check below vacuous.
    expect(declarationFiles().length).toBeGreaterThan(0);
  });

  it('contains no `any` in any exported type', () => {
    const offenders: string[] = [];

    for (const file of declarationFiles()) {
      const text = readFileSync(file, 'utf8');

      // The comments are stripped first. `tsc` copies doc comments into the
      // emitted declarations, and the prose uses the English word "any" —
      // "no author identity of any kind", "to any signed-in citizen". A scan
      // that does not strip comments matches the prose and reports a type
      // that is not there. The criterion is about the *type* `any`, so only
      // the code is scanned.
      const code = stripComments(text);

      // The type `any` in a declaration position: `any`, `<any>`, `: any`,
      // `Array<any>`, `readonly any[]`. A *reference* to a type whose name
      // merely contains "any" (say, `Many`) is not a match, so the word
      // boundary is required on both sides.
      const matches = code.match(/\bany\b/g);

      if (matches) {
        offenders.push(`${file.slice(declarationDir.length + 1)}: ${matches.length} occurrence(s)`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('contains no `as unknown as` narrowing shortcut', () => {
    // **This one scans the source, not the declarations** — and that is not
    // a compromise, it is the only place the pattern can appear.
    //
    // `tsc` *erases* the cast: `value as unknown as string` is emitted as
    // `(value: unknown) => string`, because the declaration describes the
    // resolved type. A scan over the `.d.ts` for `as unknown as` can
    // therefore **never** fire — it is a check that cannot fail, and a check
    // that cannot fail has proved nothing. The first version of this test
    // was exactly that, and it passed while the codebase contained a live
    // `as unknown as`.
    //
    // The Technical Notes make the same distinction: "No `any`, no
    // `unknown`-to-`any` casts, and no `as` narrowing shortcuts in the
    // exported surface — `unknown` plus narrowing is the required pattern."
    // The cast is a *source-level* shortcut, so the source is where it lives.
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      if (code.includes('as unknown as')) {
        offenders.push(file.slice(PACKAGE_ROOT.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('proves the `as unknown as` scan can fail', () => {
    // The check on the check. If the scan could not fire, this would pass
    // with the pattern present — so this test asserts it *does* fire on a
    // snippet carrying the pattern, and does not fire on one that does not.
    const offender = 'export const x = (v: unknown) => v as unknown as string;\n';
    const clean = 'export const x = (v: unknown): string => {\n  if (typeof v === "string") return v;\n  return "";\n};\n';

    expect(stripComments(offender)).toContain('as unknown as');
    expect(stripComments(clean)).not.toContain('as unknown as');
  });

  it('scans the type surface, not the prose around it', () => {
    // The scan above strips comments. This is the check on the stripper: a
    // declaration whose only "any" is English prose must not be an offender,
    // and a declaration whose `any` is a real type must be. Without this the
    // scan could silently degrade into "never reports anything".
    const prose = '/** no author identity of any kind */\nexport declare const x: string;\n';
    const real = 'export declare const x: any;\n';

    expect(stripComments(prose)).not.toMatch(/\bany\b/);
    expect(stripComments(real)).toMatch(/\bany\b/);
  });
});

/** Every source file in the package, excluding the tests themselves. */
function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(full);
    }
  };

  walk(join(PACKAGE_ROOT, 'src'));
  return found;
}

/**
 * Removes the comment blocks from a declaration file.
 *
 * Only block comments are stripped, because `tsc` emits only `/** … *\/`
 * doc comments into a `.d.ts` — a `//` comment cannot appear there. The
 * delimiters are replaced with spaces rather than removed, so the character
 * offsets of everything after the comment are unchanged and a match stays
 * on its own line.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => ' '.repeat(comment.length));
}

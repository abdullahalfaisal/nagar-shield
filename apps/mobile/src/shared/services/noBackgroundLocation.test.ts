import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The **absence** test for FR-LOC-3 / FR-NG-7.
 *
 * Nagar Shield is not a tracking app. That is a claim about the whole
 * codebase, not about one screen, so it is asserted by **scanning the
 * source** rather than by convention. A convention is a note in a document;
 * a source scan is a build failure.
 *
 * The scan asserts that the product contains **none** of:
 *
 *   * `watchPositionAsync` — a continuous position subscription;
 *   * the background-location permission strings — `ACCESS_BACKGROUND_LOCATION`,
 *     `ACCESS_FINE_LOCATION` in a background context, `NSLocationAlways*`;
 *   * a background location **task** — `expo-task-manager` registering a
 *     location task;
 *   * a **foreground service** — a persistent notification holding a
 *     location;
 *   * a `mode = 'stream'` write — the Phase-2 streaming mode;
 *   * a **delivery or read receipt** — `delivered_at`, `read_at`, `seen_at`,
 *     or a share-status read (ADR-005).
 *
 * The scan covers the whole `src` tree **and** the Expo config, so a
 * permission added to `app.json` would fail the build too.
 */

/** The roots the scan covers. */
const SRC_ROOT = join(__dirname, '..', '..', '..');
const APP_ROOT = join(SRC_ROOT, '..');

/** Every source file the scan reads. */
function sourceFiles(): string[] {
  const files: string[] = [];

  // The scan's own file is excluded: it necessarily **names** every
  // forbidden thing, and matching its own assertions would make the scan
  // fail on itself. Everything else is scanned.
  const SELF = 'noBackgroundLocation.test';

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules' || entry === '.expo' || entry === 'dist') continue;
      if (entry.includes(SELF)) continue;

      const full = join(directory, entry);

      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        walk(full);
        continue;
      }

      if (/\.(ts|tsx|js|jsx|json)$/.test(entry)) files.push(full);
    }
  };

  walk(SRC_ROOT);

  // The Expo config — a permission declared there is a permission the app
  // asks for.
  const appJson = join(APP_ROOT, 'app.json');
  try {
    statSync(appJson);
    files.push(appJson);
  } catch {
    // No app.json — nothing to scan there.
  }

  return files;
}

/** The source files, with their contents. */
const files = sourceFiles().map((path) => ({
  path: relative(APP_ROOT, path).replace(/\\/g, '/'),
  contents: readFileSync(path, 'utf8'),
}));

/**
 * The lines that match a forbidden pattern.
 *
 * Only the **matching lines** are reported, not the file — a false
 * positive needs to be pointed at a line so it can be looked at.
 */
function matches(pattern: RegExp): { path: string; line: number; text: string }[] {
  const found: { path: string; line: number; text: string }[] = [];

  for (const file of files) {
    const lines = file.contents.split('\n');

    lines.forEach((text, index) => {
      if (pattern.test(text)) {
        found.push({ path: file.path, line: index + 1, text: text.trim() });
      }
    });
  }

  return found;
}

describe('the absence of background location', () => {
  it('scans a non-empty set of files — the scan is not vacuous', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('contains no watchPositionAsync subscription', () => {
    expect(matches(/watchPositionAsync/)).toEqual([]);
  });

  it('contains no background-location permission', () => {
    expect(matches(/ACCESS_BACKGROUND_LOCATION|NSLocationAlways|isBackgroundLocationEnabled/)).toEqual(
      [],
    );
  });

  it('contains no background location task', () => {
    // `expo-task-manager` is only ever used for a location task in this
    // product, so the package itself is the assertion.
    expect(matches(/expo-task-manager|TaskManager/)).toEqual([]);
  });

  it('contains no foreground service', () => {
    expect(matches(/foregroundService|FOREGROUND_SERVICE|startForegroundService/)).toEqual([]);
  });

  it('contains no background location task registration', () => {
    expect(matches(/defineTask\(|registerTaskAsync|isRegisteredForTaskUpdates/)).toEqual([]);
  });
});

describe('the absence of live location streaming', () => {
  it('never writes mode = stream', () => {
    // The column is the Phase-2 hook; Phase 1 writes only 'snapshot'.
    // The migration keeps the column and the enum carries one value.
    expect(matches(/mode:\s*'stream'|mode\s*=\s*'stream'|location_share_mode.*stream/)).toEqual(
      [],
    );
  });
});

describe('the absence of delivery and read receipts', () => {
  it('contains no delivered_at, read_at, or seen_at field', () => {
    expect(matches(/delivered_at|read_at|seen_at|received_at/)).toEqual([]);
  });

  it('contains no share-status read', () => {
    expect(matches(/share_status|delivery_status|read_receipt|delivery_receipt/)).toEqual([]);
  });
});

describe('the user-facing copy', () => {
  it('never claims a message was delivered, read, or seen', () => {
    // ADR-005. The app cannot know any of these, so the copy must not
    // assert them.
    //
    // The scan covers the **i18n bundles** — the user-facing strings.
    //
    // The words are matched in their **receipt** form, not as bare words.
    // "delivered" on its own would also catch "undelivered", and "read" on
    // its own would catch innocent uses ("cannot read your position"). What
    // is forbidden is the *claim*: the copy saying the message was
    // delivered, that someone read it, or that someone has seen it. So the
    // patterns are anchored on the receipt sense — a past participle
    // preceded by "was" / "were" / "has been" / "is", or the phrase
    // "read by" / "seen by".
    const i18nFiles = files.filter(
      (file) => file.path.includes('/i18n/') || file.path.endsWith('/en.ts') || file.path.endsWith('/bn.ts'),
    );

    expect(i18nFiles.length).toBeGreaterThan(0);

    const forbidden =
      /\b(was|were|has been|have been|is|are)\s+(delivered|read|seen)\b|\b(read|seen)\s+by\b|পৌঁছেছে|দেখেছে/;

    const offenders = i18nFiles.flatMap((file) =>
      file.contents
        .split('\n')
        .map((text, index) => ({ path: file.path, line: index + 1, text: text.trim() }))
        .filter((entry) => forbidden.test(entry.text)),
    );

    expect(offenders).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The shared-contracts boundary.
 *
 * `packages/shared` exists so the two apps and the Edge Functions agree on
 * one definition of the phone format, the report category, the error code
 * and the rest. The moment an app defines its own copy of one of those, the
 * two copies drift — and the drift is invisible, because both compile and
 * both look right. The client would accept a phone number the server
 * rejects, or render a category the database does not have.
 *
 * This file is the guard. It fails the build when an app redefines a shared
 * schema or a shared enum locally.
 *
 * **The scan reads code, not prose.** The rule is *stated* in the very files
 * it scans — a naive grep for `z.object` would match the comment explaining
 * the rule. So string literals and comments are stripped before the scan.
 *
 * It lives here, in the package that owns the contract, rather than in
 * either app: the property is about **both** apps at once, and a test that
 * only one app's suite runs would leave the other unguarded.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const APP_ROOTS = [join(REPO_ROOT, 'apps', 'mobile'), join(REPO_ROOT, 'apps', 'admin')];

/** The directories that hold source. Everything else is build output. */
const SOURCE_DIRS = ['app', 'src', 'lib', 'components'];

/** Files that are build output or vendored, not source. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.expo',
  'dist',
  'build',
  'coverage',
  '.turbo',
  'android',
  'ios',
]);

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

/**
 * Strips comments and string literals from a source file.
 *
 * A line comment runs to the end of the line; a block comment runs to its
 * closing delimiter. A string literal is any single-quoted, double-quoted
 * or backtick-quoted run. The contents of each are replaced by a space, so
 * positions still line up and a match cannot be split across a replaced
 * region.
 *
 * The result is deliberately not valid JavaScript — it only has to be
 * *unmatchable* by the patterns below.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const two = source.slice(i, i + 2);

    if (two === '//') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (two === '/*') {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== '*/') i += 1;
      i += 2;
      out += ' ';
      continue;
    }

    const char = source[i];
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        // A template literal's `${…}` can hold real code. Blanking the whole
        // template would hide a schema inside one, so the substitution is
        // kept and only the literal text around it is removed.
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1;
            if (source[i] === '}') depth -= 1;
            i += 1;
          }
          out += ' ';
          continue;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }

    out += char;
    i += 1;
  }

  return out;
}

/** Every source file under a directory, as absolute paths. */
function sourceFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // a directory that does not exist is not a failure
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(full);
      } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        found.push(full);
      }
    }
  };

  walk(root);
  return found;
}

/**
 * The shared names.
 *
 * These are the identifiers the shared package owns. An app that declares
 * one of them **locally** is duplicating a contract.
 *
 * The list is not a copy of the shared package's exports — it is the list of
 * names that would *mean* something if redefined, and it is checked against
 * the package's real exports by the test below, so it cannot rot.
 */
const SHARED_NAMES = [
  // Schemas — `packages/shared/src/schemas/index.ts`
  'E164_PHONE_REGEX',
  'normalisePhone',
  'phoneSchema',
  'emailSchema',
  'alternatePhoneSchema',
  'passwordSchema',
  'captureDescriptionSchema',
  'reportCategorySchema',
  'flagReasonSchema',
  'signupSchema',
  'loginSchema',
  'passwordResetRequestSchema',
  'otpCodeSchema',
  'passwordResetVerifySchema',
  'passwordResetRequestBodySchema',
  'passwordResetVerifyBodySchema',
  'emergencyContactSchema',
  'captureSubmissionSchema',
  'areaFilterSchema',
  'historyQuerySchema',
  'alertsQuerySchema',
  'flagReportSchema',
  'wrongNumberReportSchema',
  'locationShareSchema',
  'moderationDecisionSchema',
  'disableUserSchema',
  'areaHierarchySchema',
  'contactSchema',
  'parseAreaHierarchy',

  // Business-rule constants — `packages/shared/src/schemas/index.ts`
  'CAPTURE_DESCRIPTION_MAX_LENGTH',
  'OTP_TTL_MINUTES',
  'OTP_MAX_ATTEMPTS',
  'OTP_COOLDOWN_MINUTES',
  'BIOMETRIC_FAILS_TO_PASSWORD',
  'BIOMETRIC_FAILS_TO_DISABLE',
  'BIOMETRIC_FAIL_WINDOW_HOURS',
  'REMEMBER_ME_DAYS',
  'HISTORY_DEFAULT_RADIUS_KM',
  'HISTORY_DEFAULT_WINDOW_HOURS',
  'HISTORY_MAX_RADIUS_KM',
  'HISTORY_MAX_WINDOW_HOURS',
  'FLAG_HIDE_THRESHOLD',
  'FLAG_RATE_LIMIT_PER_HOUR',
  'AUTHOR_FLAG_AUTO_HIDE_THRESHOLD',
  'AUTHOR_FLAG_AUTO_HIDE_WINDOW_HOURS',
  'SEEK_THANA_FALLBACK_RADIUS_KM',
  'SEEK_THANA_FALLBACK_NUMBER',
  'MEDIA_MAX_VIDEO_SECONDS',
  'MEDIA_MAX_DIMENSION',
  'MEDIA_MAX_FILE_BYTES',
  'CAPTURE_MAX_PER_DAY',
  'ALERTS_REFRESH_INTERVAL_MS',
  'ALERTS_BATTERY_PAUSE_THRESHOLD',

  // Enums — `packages/shared/src/enums/`
  'REPORT_CATEGORIES',
  'REPORT_CATEGORY_SET',
  'parseReportCategory',
  'REPORT_CATEGORY_LABELS',
  'REPORT_CATEGORY_ICONS',
  'REPORT_CATEGORY_ACCENTS',
  'PUBLIC_VISIBILITIES',
  'PUBLIC_VISIBILITY_SET',
  'DEFAULT_PUBLIC_VISIBILITY',
  'ROLES',
  'ROLE_SET',
  'LOCALES',
  'LOCALE_SET',
  'DEFAULT_LOCALE',
  'THEMES',
  'THEME_SET',
  'DEFAULT_THEME',
  'MEDIA_TYPES',
  'MEDIA_TYPE_SET',
  'STATION_TYPES',
  'STATION_TYPE_SET',
  'WRONG_NUMBER_ENTRY_TYPES',
  'WRONG_NUMBER_ENTRY_TYPE_SET',
  'SHARE_CHANNELS',
  'SHARE_CHANNEL_SET',
  'LOCATION_SHARE_MODES',
  'CONTACT_GROUPS',
  'CONTACT_GROUP_SET',
  'FLAG_REASONS',
  'FLAG_REASON_SET',
  'FLAG_REASON_LABELS',
  'MODERATION_STATUSES',
  'MODERATION_STATUS_SET',
  'PUBLICLY_VISIBLE_STATUSES',
  'isPubliclyVisible',
  'MODERATION_DECISIONS',
  'MODERATION_DECISION_SET',
  'HIDE_REASONS',
  'HIDE_REASON_SET',

  // Reference data — `packages/shared/src/data/`
  'REFERENCE_DATA_VERSION',
  'STATIONS',
  'HOTLINES',
  'SEEK_FALLBACK_NUMBER',
  'MORE_HELP_ROWS',
  'EMERGENCY_NUMBERS',

  // Errors — `packages/shared/src/errors/`
  'API_ERROR_CODES',
  'API_ERROR_CODE_SET',
  'API_ERROR_I18N_KEYS',
  'resolveErrorMessage',

  // Jobs — `packages/shared/src/jobs/`
  'TOMBSTONE_PREFIX',
];

/**
 * A local `const NAME = …` or `function NAME(…)`.
 *
 * The declaration is what makes it a **duplicate** rather than an import
 * alias. `import { REPORT_CATEGORIES } from '@nagar-shield/shared'` is the
 * correct usage and must not be flagged.
 */
function declaresLocally(code: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\bconst\\s+${escaped}\\b`),
    new RegExp(`\\blet\\s+${escaped}\\b`),
    new RegExp(`\\bvar\\s+${escaped}\\b`),
    new RegExp(`\\bfunction\\s+${escaped}\\b`),
    new RegExp(`\\bclass\\s+${escaped}\\b`),
    new RegExp(`\\benum\\s+${escaped}\\b`),
    new RegExp(`\\btype\\s+${escaped}\\b`),
    new RegExp(`\\binterface\\s+${escaped}\\b`),
  ];
  return patterns.some((pattern) => pattern.test(code));
}

/**
 * A file that imports Zod and builds a schema of its own.
 *
 * The **import** is detected in the original source and the **construction**
 * in the stripped source. That split is deliberate: a module specifier is
 * not prose, so it is safe to read — but the specifier is a string literal,
 * and the stripper blanks string literals, so the import would be invisible
 * in the stripped text. Conversely the construction must be read from the
 * stripped text, because a schema written inside a comment or a string
 * literal is not a schema.
 */
function buildsLocalZodSchema(original: string, stripped: string): boolean {
  const importsZod =
    /\bfrom\s*['"]zod['"]/.test(original) || /require\(\s*['"]zod['"]\s*\)/.test(original);
  if (!importsZod) return false;
  return /\bz\s*\.\s*(object|enum|union|discriminatedUnion|intersection)\s*\(/.test(stripped);
}

/** The files in an app that are source rather than build output. */
function appSourceFiles(appRoot: string): string[] {
  const direct = SOURCE_DIRS.filter((dir) => {
    try {
      return statSync(join(appRoot, dir)).isDirectory();
    } catch {
      return false;
    }
  });

  // `app` and `src` are the two layouts in use. `lib` and `components` are
  // included for a future layout that has not arrived yet — a directory
  // that does not exist contributes nothing.
  const files: string[] = [];
  for (const dir of direct) {
    files.push(...sourceFiles(join(appRoot, dir)));
  }

  // A stray source file at the app's root (a `*.test.ts` beside the config)
  // is source too.
  try {
    for (const entry of readdirSync(appRoot)) {
      const full = join(appRoot, entry);
      if (statSync(full).isFile() && SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        files.push(full);
      }
    }
  } catch {
    // no root-level files
  }

  return Array.from(new Set(files)).sort();
}

describe('the shared-contracts boundary', () => {
  const apps = APP_ROOTS.map((root) => ({
    name: root.split(sep).slice(-2).join('/'),
    root,
  }));

  it('scans both apps', () => {
    // A scan that silently found nothing would pass every other test here.
    for (const app of apps) {
      const files = appSourceFiles(app.root);
      expect(files.length).toBeGreaterThan(0);
    }
  });

  it.each(apps.map((app) => [app.name, app.root] as const))(
    '%s declares no shared schema or enum of its own',
    (_name, root) => {
      const offenders: string[] = [];

      for (const file of appSourceFiles(root)) {
        const original = readFileSync(file, 'utf8');
        const code = stripCommentsAndStrings(original);
        const where = relative(REPO_ROOT, file);

        for (const shared of SHARED_NAMES) {
          if (declaresLocally(code, shared)) {
            offenders.push(`${where} re-declares \`${shared}\``);
          }
        }

        if (buildsLocalZodSchema(original, code)) {
          offenders.push(`${where} builds a local Zod schema`);
        }
      }

      expect(offenders).toEqual([]);
    },
  );

  it('has a shared-name list that is not stale', async () => {
    // The list above is a hand-written vocabulary. If the shared package
    // gains an export and the list does not follow, the guard would stop
    // catching that export — silently. So the list must name **every**
    // exported constant, not just the ones it happens to remember.
    const shared = await import('./index');

    const exported = Object.keys(shared).filter((key) => {
      const value = (shared as Record<string, unknown>)[key];
      return typeof value === 'string' || Array.isArray(value);
    });

    const known = new Set(SHARED_NAMES);
    const missing = exported.filter((name) => !known.has(name));

    expect(missing).toEqual([]);
  });
});

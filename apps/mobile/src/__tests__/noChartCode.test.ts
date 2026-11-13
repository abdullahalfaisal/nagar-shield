import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The no-chart rule, enforced over the source tree.
 *
 * `006-alerts / 004-distribution-by-category` (FR-NG-3 / FR-NG-4 / ADR-010).
 *
 * The rule this file protects: the বিতরণ tab is **a list of counts**. There is
 * no chart, no bar, no percentage, no trend, no heatmap, and no hotspot
 * ranking anywhere in the shipped app — and there never will be.
 *
 * Why a source scan and not a rendering test
 * -----------------------------------------
 * A rendering test can only assert what a given render produces. It cannot
 * assert that a *component* was never added, and the failure mode here is
 * exactly that: someone adds a `BarChart` component to the shared UI kit, a
 * new screen wires it up, and every existing render test still passes because
 * none of them render the new screen. The regression is invisible to a
 * behaviour test and obvious to a scan.
 *
 * The prototype's own screen 23 (Charts) states the product rule out loud:
 * *"We don't show crime statistics, heatmaps, or hotspot rankings — Nagar
 * Shield is for live reports, not aggregator data."* The prototype's screen 23
 * is never built, and this scan is what keeps it unbuilt.
 *
 * What the scan reads
 * -------------------
 * **Code only.** Comments and string literals are stripped before the scan
 * runs, because the rule is stated in prose in several places — the History
 * screen's doc comment, the `history.distributionNote` i18n string, the shared
 * read model's comment — and a scan that matched those would either fail on
 * the rule itself or force the rule to be hidden from the codebase.
 *
 * The scan is deliberately narrow about *where* it looks: the app's own source
 * (`app/`, `src/`), not `node_modules`, not the workspace `packages/`. The
 * rule is about what the app shows.
 */

/** The directories the scan reads. */
const SCAN_ROOTS = ['app', 'src'];

/** The source extensions the scan reads. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/** The directories the scan never descends into. */
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', '.expo', 'coverage']);

/**
 * The banned dependency names.
 *
 * A charting library in the tree is a charting library in the bundle, whether
 * or not anyone has imported it yet. The check is on the manifest, not the
 * import graph, so an unused dependency is still a failure — an unused
 * charting library is one import away from a crime-statistics screen.
 */
const BANNED_DEPENDENCIES = [
  'react-native-chart-kit',
  'react-native-svg-charts',
  'victory-native',
  'victory',
  'recharts',
  'chart.js',
  'react-chartjs-2',
  'echarts',
  'echarts-for-react',
  'd3',
  'd3-shape',
  'plotly',
  'react-native-gifted-charts',
  'react-native-linear-gradient-chart',
  '@react-native-community/charts',
];

/**
 * The banned identifiers, matched against **code only**.
 *
 * `share` and `rate` are deliberately absent: they are ordinary English words
 * that appear in ordinary code — the OS share sheet, an error rate, a
 * refresh rate. The crime-statistics words that are unambiguous are the ones
 * listed here.
 */
const BANNED_IDENTIFIERS: Array<{ pattern: RegExp; rule: string }> = [
  // A chart component, by name.
  {
    pattern: /\b(BarChart|LineChart|PieChart|DonutChart|AreaChart|RadarChart|ScatterChart|Sparkline|Heatmap)\b/,
    rule: 'a chart component',
  },
  // A percentage, a rate, a share, a trend, as an identifier.
  {
    pattern: /\b(percentage|percent|sharePercent|trendLine|trend|hotspot|hotSpot|clusterRanking|riskScore|dangerIndex)\b/,
    rule: 'a statistic derived from the counts',
  },
  // SVG primitives — the only way a bar or a line gets drawn in React Native.
  { pattern: /<\s*(Rect|Polyline|Polygon|Line|Circle)\b/, rule: 'drawn geometry (an SVG chart primitive)' },
];

/** The package manifest. */
const PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

interface SourceFile {
  /** The path relative to the app root, with forward slashes. */
  path: string;
  /** The file's text, with comments and string literals removed. */
  code: string;
}

/**
 * Removes comments and string literals from a source file.
 *
 * The result is not valid TypeScript — it is the *code* of the file with the
 * prose taken out. That is exactly what the scan needs: a rule that is only
 * ever stated in words must not read as a rule violation.
 */
function stripProse(source: string): string {
  let result = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    // A line comment.
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }

    // A block comment.
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      result += ' ';
      continue;
    }

    // A string literal — single, double, or template.
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      index += 1;
      while (index < source.length) {
        const current = source[index] as string;
        if (current === '\\') {
          index += 2;
          continue;
        }
        if (current === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      result += ' ';
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/** Every source file under the given roots. */
function collectSourceFiles(): SourceFile[] {
  const appRoot = join(__dirname, '..', '..');
  const files: SourceFile[] = [];

  const walk = (directory: string) => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry)) continue;

      const absolute = join(directory, entry);
      let stats;
      try {
        stats = statSync(absolute);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        walk(absolute);
        continue;
      }

      const path = relative(appRoot, absolute).split(sep).join('/');
      if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) continue;
      // The test files themselves are the rule, not the code under the rule.
      if (path.includes('.test.ts')) continue;

      files.push({ path, code: stripProse(readFileSync(absolute, 'utf8')) });
    }
  };

  for (const root of SCAN_ROOTS) {
    walk(join(appRoot, root));
  }

  return files;
}

const sourceFiles = collectSourceFiles();

describe('the app ships no chart code', () => {
  it('reads a non-trivial number of source files — the scan is not vacuous', () => {
    // A scan that found nothing because it walked the wrong directories would
    // pass every assertion below while protecting nothing.
    expect(sourceFiles.length).toBeGreaterThan(20);
  });

  it('carries no charting library in the dependency tree', () => {
    const manifest = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
    });

    const present = declared.filter((name) => BANNED_DEPENDENCIES.includes(name));

    expect(present).toEqual([]);
  });

  it('names no chart component, in any file', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      for (const { pattern, rule } of BANNED_IDENTIFIERS) {
        const match = file.code.match(pattern);
        if (!match) continue;
        offenders.push(`${file.path} — ${rule}: "${match[0]}"`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('draws no geometry — no SVG primitive appears in any file', () => {
    const offenders = sourceFiles
      .filter((file) => /<\s*(Rect|Polyline|Polygon|Line|Circle)\b/.test(file.code))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('has no chart screen — the prototype Charts screen is never built', () => {
    // The prototype's Charts screen. A file named after it, or a route to it,
    // is the regression this scan exists to catch.
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      if (file.path.toLowerCase().includes('chart')) {
        offenders.push(`${file.path} — a file named after a chart`);
        continue;
      }
      if (/['"`]\/[^'"`]*chart[^'"`]*['"`]/.test(file.code)) {
        offenders.push(`${file.path} — a route to a chart`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has no chart library import, even a local one', () => {
    const offenders = sourceFiles
      .filter((file) => /from\s+['"][^'"]*(chart|graph|plotly|victory|d3)[^'"]*['"]/.test(file.code))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });
});

describe('the distribution is a list of counts', () => {
  it('renders the counts through CountRow — a text label and a number', () => {
    const listRowGroup = readFileSync(
      join(__dirname, '..', 'shared', 'ui', 'ListRowGroup.tsx'),
      'utf8',
    );

    // The count row is a label plus a number in a pill. There is no width
    // computed from the count, which is what a bar would need.
    expect(listRowGroup).toContain('export function CountRow');
    expect(stripProse(listRowGroup)).not.toMatch(/width:\s*[^,}]*count/i);
  });

  it('renders no percentage, rate, or trend in the History screen', () => {
    const historyScreen = readFileSync(join(__dirname, '..', '..', 'app', '(app)', 'history.tsx'), 'utf8');
    const code = stripProse(historyScreen);

    expect(code).not.toMatch(/\bpercentage\b/i);
    expect(code).not.toMatch(/\bpercent\b/i);
    expect(code).not.toMatch(/\btrend\b/i);
    expect(code).not.toMatch(/\bshare\b/i);
    expect(code).not.toMatch(/\brate\b/i);
  });

  it('states the rule in the UI, in words — the ban is visible to the user', () => {
    // The prototype's own copy survives into the shipped app: the distribution
    // tab says plainly that Nagar Shield does not show crime statistics.
    const en = readFileSync(join(__dirname, '..', 'shared', 'i18n', 'en.ts'), 'utf8');

    expect(en).toMatch(/do not show crime statistics/i);
  });
});

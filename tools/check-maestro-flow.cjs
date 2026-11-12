/**
 * Validates the Maestro flows.
 *
 * The nightly build runs `maestro/panic-path.yaml` on an emulator. A typo in
 * that file fails the nightly job — but only after a full APK build, which
 * is slow and burns the free-tier build quota. This checks the file up
 * front, so a malformed flow is caught in seconds.
 *
 * What it checks:
 *   * the file parses as YAML
 *   * the `appId` header is present and matches the EAS package
 *   * every command is a known Maestro command with a valid shape
 *   * every `text:` selector is a valid regex, and the Bengali half of each
 *     alternation is a string that actually exists in `bn.ts`
 *   * every `id:` selector refers to a `testID` that exists in the app
 *
 * The last two are the ones that matter: a selector that matches nothing
 * passes the YAML check and then fails silently on the emulator.
 *
 * Usage: node tools/check-maestro-flow.cjs
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const MAESTRO_DIR = path.join(ROOT, 'maestro');
const MOBILE_DIR = path.join(ROOT, 'apps', 'mobile');

/** The Maestro commands this flow is allowed to use. */
const KNOWN_COMMANDS = new Set([
  'launchApp',
  'tapOn',
  'inputText',
  'hideKeyboard',
  'back',
  'scroll',
  'swipe',
  'assertVisible',
  'assertNotVisible',
  'extendedWaitUntil',
  'waitForAnimationToEnd',
  'pressKey',
  'clearState',
  'openLink',
  'setLocation',
  'travel',
  'copyTextFrom',
  'eraseText',
]);

/** Commands whose argument is a selector. */
const SELECTOR_COMMANDS = new Set(['tapOn', 'assertVisible', 'assertNotVisible', 'extendedWaitUntil']);

/** Commands that take no argument, so YAML parses them as a bare scalar. */
const ARGUMENTLESS_COMMANDS = new Set(['hideKeyboard', 'back', 'waitForAnimationToEnd', 'clearState']);

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

/**
 * Collects the app's `testID` values.
 */
function collectTestIds() {
  const ids = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.expo' || entry.name === '.expo-export-test') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(/testID=["']([^"']+)["']/g)) {
        ids.add(match[1]);
      }
    }
  };
  walk(MOBILE_DIR);
  return ids;
}

/**
 * Collects the Bengali strings from `bn.ts`, so a selector can be checked
 * against the strings the app actually renders.
 */
function collectBengaliStrings() {
  const source = fs.readFileSync(path.join(MOBILE_DIR, 'src', 'shared', 'i18n', 'bn.ts'), 'utf8');
  const strings = new Set();
  for (const match of source.matchAll(/'([^'\\\n]{2,})'/g)) {
    strings.add(match[1]);
  }
  return strings;
}

/**
 * Checks a `text:` selector.
 *
 * Maestro matches `text:` as a regular expression, so `.*` and `|` work. The
 * flow is written as `bengali|english` alternations; the Bengali half must
 * exist in `bn.ts` verbatim, because a typo there is invisible until the
 * emulator runs.
 */
function checkTextSelector(selector, where, bengaliStrings) {
  if (typeof selector !== 'string') {
    fail(`${where}: \`text\` must be a string`);
    return;
  }

  try {
    // eslint-disable-next-line no-new
    new RegExp(selector);
  } catch (error) {
    fail(`${where}: \`text: "${selector}"\` is not a valid regex — ${error.message}`);
    return;
  }

  // A selector that is a plain alternation of two languages: check the
  // Bengali half. `.*` prefixes and escaped `?` are stripped first.
  const halves = selector.split('|').map((h) => h.trim());
  if (halves.length !== 2) return;

  const [bengali] = halves;
  const literal = bengali
    .replace(/^\.\*/, '')
    .replace(/\\\?$/, '?')
    .trim();

  // Only check halves that are plain Bengali literals (no regex metachar).
  if (!literal || /[.*+?^${}()|[\]\\]/.test(literal)) return;

  if (!bengaliStrings.has(literal)) {
    fail(
      `${where}: the Bengali selector "${literal}" is not a string in bn.ts — ` +
        'the flow would never match on a Bengali device',
    );
  }
}

function checkFlow(filePath) {
  const relative = path.relative(ROOT, filePath);
  const source = fs.readFileSync(filePath, 'utf8');

  // Maestro splits the flow on a `---` line: the part before is the header
  // (appId), the part after is the command list.
  const parts = source.split(/^---$/m);
  if (parts.length < 2) {
    fail(`${relative}: no \`---\` separator — Maestro needs a header and a command list`);
    return;
  }

  let header;
  let commands;
  try {
    header = yaml.load(parts[0]);
    commands = yaml.load(parts.slice(1).join('---'));
  } catch (error) {
    fail(`${relative}: YAML parse error — ${error.message}`);
    return;
  }

  if (!header || typeof header !== 'object' || !header.appId) {
    fail(`${relative}: the header must declare \`appId\``);
  } else {
    // The appId must be the package the APK is actually built under.
    const eas = fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8');
    const packages = [...eas.matchAll(/"package":\s*"([^"]+)"/g)].map((m) => m[1]);
    if (!packages.includes(header.appId)) {
      fail(
        `${relative}: appId "${header.appId}" is not one of the EAS packages (${packages.join(', ')})`,
      );
    }
  }

  if (!Array.isArray(commands)) {
    fail(`${relative}: the command list must be a sequence`);
    return;
  }

  notes.push(`${relative}: ${commands.length} commands`);

  const testIds = collectTestIds();
  const bengaliStrings = collectBengaliStrings();

  commands.forEach((command, index) => {
    const where = `${relative}[${index}]`;

    // A command with no argument is written as a bare scalar —
    // `- hideKeyboard`, `- back`. YAML parses those as a string.
    if (typeof command === 'string') {
      if (!ARGUMENTLESS_COMMANDS.has(command)) {
        fail(`${where}: "${command}" is not a command — a bare scalar must be an argumentless command`);
      }
      return;
    }

    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      fail(`${where}: not a command`);
      return;
    }

    const names = Object.keys(command);
    const name = names[0];
    if (!name) {
      fail(`${where}: empty command`);
      return;
    }
    if (!KNOWN_COMMANDS.has(name)) {
      fail(`${where}: unknown Maestro command "${name}"`);
      return;
    }

    if (name === 'extendedWaitUntil') {
      const body = command[name];
      if (!body || typeof body !== 'object' || !('visible' in body)) {
        fail(`${where}: \`extendedWaitUntil\` must have a \`visible\` selector`);
        return;
      }
      if (typeof body.timeout !== 'number') {
        fail(`${where}: \`extendedWaitUntil\` should set a \`timeout\``);
      }
    }

    if (!SELECTOR_COMMANDS.has(name)) return;

    const selector = command[name];
    if (typeof selector === 'string') {
      // A bare string selector is a text match.
      checkTextSelector(selector, where, bengaliStrings);
      return;
    }

    if (!selector || typeof selector !== 'object') {
      fail(`${where}: \`${name}\` needs a selector`);
      return;
    }

    if (selector.text !== undefined) {
      checkTextSelector(selector.text, where, bengaliStrings);
    }

    if (selector.id !== undefined) {
      if (!testIds.has(selector.id)) {
        fail(
          `${where}: the testID "${selector.id}" does not exist in the app — ` +
            'the flow would wait for it until it timed out',
        );
      }
    }
  });
}

function main() {
  if (!fs.existsSync(MAESTRO_DIR)) {
    console.log('No maestro/ directory — nothing to check.');
    return;
  }

  const flows = fs
    .readdirSync(MAESTRO_DIR)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .map((name) => path.join(MAESTRO_DIR, name));

  if (flows.length === 0) {
    console.log('No Maestro flows found.');
    return;
  }

  for (const flow of flows) {
    checkFlow(flow);
  }

  for (const note of notes) {
    console.log(`✓ ${note}`);
  }

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} problem(s):`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ ${flows.length} Maestro flow(s) are valid`);
}

main();

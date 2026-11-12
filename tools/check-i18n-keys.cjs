#!/usr/bin/env node

/**
 * The i18n key audit.
 *
 * The Bangla bundle is the **source of truth** for the key set — `en.ts` is
 * typed as `TranslationSchema`, so a missing English key is a compile error.
 * This script closes the other direction: a key that is **used** in a screen
 * but **never defined** is a runtime `undefined` in the UI, and TypeScript
 * cannot see it because `t()` is a string-keyed function.
 *
 * It is a CI gate (`pnpm i18n:check`).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MOBILE = path.join(ROOT, 'apps', 'mobile');
const BUNDLE = path.join(MOBILE, 'src', 'shared', 'i18n', 'bn.ts');
const EN_BUNDLE = path.join(MOBILE, 'src', 'shared', 'i18n', 'en.ts');

/** Every source file that may call `t('…')`. */
function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.expo', '.next', 'dist', 'coverage'].includes(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Reads the nested key set out of a bundle source file.
 *
 * The bundles are plain object literals, so the nesting is read from the
 * indentation rather than from a parser — no extra dependency, and the shape
 * is stable because the bundles are hand-written in one style.
 */
function readDefinedKeys(source) {
  const keys = new Set();
  const stack = [];

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^(\s*)([A-Za-z0-9_]+):/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2];

    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    keys.add([...stack.map((entry) => entry.key), key].join('.'));
    stack.push({ indent, key });
  }

  return keys;
}

/** Every `t('group.key')` call site in the app. */
function readUsedKeys(files) {
  const used = new Map();

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const pattern = /\bt\(\s*'([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)'/g;

    for (const match of source.matchAll(pattern)) {
      const key = `${match[1]}.${match[2]}`;
      used.set(key, (used.get(key) ?? 0) + 1);
    }
  }

  return used;
}

function main() {
  const defined = readDefinedKeys(fs.readFileSync(BUNDLE, 'utf8'));
  const definedEn = readDefinedKeys(fs.readFileSync(EN_BUNDLE, 'utf8'));
  const used = readUsedKeys(collectSourceFiles(MOBILE));

  const missing = [...used.keys()].filter((key) => !defined.has(key)).sort();
  const missingEn = [...defined].filter((key) => !definedEn.has(key)).sort();
  const unused = [...defined].filter((key) => !used.has(key)).sort();

  console.log(`Defined keys (bn): ${defined.size}`);
  console.log(`Defined keys (en): ${definedEn.size}`);
  console.log(`Used keys:         ${used.size}`);

  let failed = false;

  if (missing.length > 0) {
    failed = true;
    console.error(`\n✗ ${missing.length} key(s) are USED but never DEFINED:`);
    for (const key of missing) {
      console.error(`   ${key}  (${used.get(key)} call site(s))`);
    }
  }

  if (missingEn.length > 0) {
    failed = true;
    console.error(`\n✗ ${missingEn.length} key(s) are defined in bn but MISSING from en:`);
    for (const key of missingEn) {
      console.error(`   ${key}`);
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`\n✓ every used key is defined, and bn/en are in sync`);
  console.log(`  (${unused.length} defined key(s) have no call site — informational)`);
}

main();

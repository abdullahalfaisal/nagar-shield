/**
 * Reconciles the story index against the story files on disk.
 *
 * `memory-bank/story-index.md` carries a Status column, and the header
 * carries a count of the complete stories. Both are **derived** — the
 * authoritative source is each story file's `implemented` frontmatter.
 *
 * A handover once claimed 24 stories were unimplemented and the rest were
 * done. The claim turned out to be materially overstated in both directions:
 * code marked done had real defects, and stories marked done were missing
 * parts of their acceptance criteria. A hand-maintained index drifts.
 *
 * This tool makes the index **checkable**:
 *
 *   * `node tools/reconcile-story-index.cjs` — report the drift and exit
 *     non-zero when the index disagrees with the files;
 *   * `node tools/reconcile-story-index.cjs --write` — rewrite the Status
 *     column and the header count from the files.
 *
 * It never rewrites anything else in the file — the titles, units, bolts and
 * priorities are hand-written and are left alone.
 *
 * Usage: node tools/reconcile-story-index.cjs [--write]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'memory-bank', 'story-index.md');
const INTENTS_ROOT = path.join(ROOT, 'memory-bank', 'intents');

/**
 * The intent directories.
 *
 * `memory-bank/intents/` holds one directory per intent, and each intent
 * holds its own `units/` tree. The intent directory is found by looking for
 * the one that has a `units` child, so the tool does not hard-code the
 * intent's name.
 */
function findIntentDirs() {
  return fs
    .readdirSync(INTENTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(INTENTS_ROOT, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'units')));
}

/** Reads every story file's `id` and `implemented` frontmatter. */
function readStories() {
  const stories = [];

  for (const intentDir of findIntentDirs()) {
    const unitsRoot = path.join(intentDir, 'units');
    const units = fs.readdirSync(unitsRoot, { withFileTypes: true });

    for (const unit of units) {
      if (!unit.isDirectory()) continue;

      const storiesDir = path.join(unitsRoot, unit.name, 'stories');
      if (!fs.existsSync(storiesDir)) continue;

      for (const file of fs.readdirSync(storiesDir)) {
        if (!file.endsWith('.md')) continue;

        const full = path.join(storiesDir, file);
        const text = fs.readFileSync(full, 'utf8');
        // The story files are CRLF on Windows, so the frontmatter is read with
        // the carriage returns stripped — a regex anchored at `$` would never
        // match `implemented: true\r`.
        const frontmatter = text.slice(0, text.indexOf('\n---', 3) + 4).replace(/\r/g, '');

        const id = frontmatter.match(/^id:\s*(.+)$/m);
        const implemented = frontmatter.match(/^implemented:\s*(true|false)$/m);

        if (!id) continue;

        stories.push({
          id: id[1].trim(),
          implemented: implemented ? implemented[1] === 'true' : false,
          unit: unit.name,
          file: path.relative(ROOT, full),
        });
      }
    }
  }

  return stories;
}

/** The index's rows, parsed. */
function readIndexRows() {
  const text = fs.readFileSync(INDEX_PATH, 'utf8');
  const rows = [];

  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
    if (!match) continue;
    // The header and the separator row do not have a sixth column.
    if (match[1] === 'Story' || match[1].startsWith('---')) continue;

    rows.push({
      id: match[1],
      title: match[2],
      unit: match[3],
      bolt: match[4],
      priority: match[5],
      status: match[6],
      line,
    });
  }

  return { text, rows };
}

function main() {
  const write = process.argv.includes('--write');
  const stories = readStories();
  const { text, rows } = readIndexRows();

  const byId = new Map(stories.map((story) => [story.id, story]));
  const drift = [];

  // 1. Every row's status must match its story file.
  for (const row of rows) {
    const story = byId.get(row.id);
    if (!story) {
      drift.push(`the index lists "${row.id}", which has no story file`);
      continue;
    }

    const expected = story.implemented ? 'complete' : 'planned';
    if (row.status !== expected) {
      drift.push(
        `${row.id}: the index says "${row.status}", the story file says "${expected}"`,
      );
    }
  }

  // 2. Every story file must have a row.
  const rowIds = new Set(rows.map((row) => row.id));
  for (const story of stories) {
    if (!rowIds.has(story.id)) {
      drift.push(`${story.id}: the story file has no row in the index`);
    }
  }

  // 3. The header count must match the files.
  const complete = stories.filter((story) => story.implemented).length;
  const planned = stories.length - complete;
  const countPattern = /\*\*(\d+) complete · (\d+) planned\.\*\*/;
  const countMatch = text.match(countPattern);
  if (!countMatch) {
    drift.push('the index header has no "N complete · N planned." count');
  } else if (Number(countMatch[1]) !== complete || Number(countMatch[2]) !== planned) {
    drift.push(
      `the index header says "${countMatch[1]} complete · ${countMatch[2]} planned", the story files say "${complete} complete · ${planned} planned"`,
    );
  }

  if (write && drift.length > 0) {
    let updated = text;

    for (const story of stories) {
      const expected = story.implemented ? 'complete' : 'planned';
      updated = updated.replace(
        new RegExp(`^(\\|\\s*${story.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|[^\\n]*?\\|\\s*)(complete|planned)(\\s*\\|\\s*)$`, 'm'),
        `$1${expected}$3`,
      );
    }

    updated = updated.replace(
      countPattern,
      `**${complete} complete · ${planned} planned.**`,
    );

    fs.writeFileSync(INDEX_PATH, updated, 'utf8');
    console.log(`✓ the index was rewritten from the story files`);
    console.log(`✓ ${complete} complete · ${planned} planned`);
    return;
  }

  if (drift.length === 0) {
    console.log(`✓ the index matches the story files — ${complete} complete · ${planned} planned`);
    return;
  }

  console.log(`✗ the index has drifted from the story files:`);
  for (const item of drift) console.log(`  - ${item}`);
  process.exitCode = 1;
}

main();

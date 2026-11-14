/**
 * Reconciles the story index against the story files on disk.
 *
 * `memory-bank/story-index.md` carries a Status column, and the header
 * carries a count of the stories in each state. Both are **derived** — the
 * authoritative source is each story file's `implemented` frontmatter.
 *
 * A handover once claimed 24 stories were unimplemented and the rest were
 * done. The claim turned out to be materially overstated in both directions:
 * code marked done had real defects, and stories marked done were missing
 * parts of their acceptance criteria. A hand-maintained index drifts.
 *
 * The `implemented` frontmatter has three states, not two:
 *
 *   * `true` → **complete**. Every acceptance criterion is satisfied by
 *     shipped code, including the assertion the criterion names.
 *   * `partial` → **partial**. The feature exists and works, but at least one
 *     criterion's *guard* is missing — the test, boundary check, or reserved
 *     CI job the story names was never built. The story file must carry an
 *     `## Implementation` section naming the exact gaps; this tool enforces
 *     that, because a `partial` state with no record of the gaps is just a
 *     softer way of saying "planned".
 *   * `false` → **planned**. Not built.
 *
 * The third state exists because the binary could not carry the truth. An
 * audit of the stories marked `implemented: false` found that the features
 * had shipped and worked, and only the guards were missing. Recording those
 * as "planned" would have hidden real work; recording them as "complete"
 * would have been a lie about the acceptance criteria.
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

/**
 * The story states.
 *
 * `complete` — every acceptance criterion is satisfied by shipped code,
 * including the assertion the criterion names.
 *
 * `partial` — the feature exists and works, but at least one criterion's
 * *guard* is missing: the test, the boundary check, or the reserved CI job
 * the story names was never built. The story file carries an `## Implementation`
 * section naming the exact gaps. This state exists because a binary flag
 * could not carry the truth — an audit of the stories marked
 * `implemented: false` found that the features had shipped and worked, and
 * only the guards were missing. Recording them as "planned" would have hidden
 * real work; recording them as "complete" would have been a lie about the
 * acceptance criteria.
 *
 * `planned` — not built.
 */
const STATES = ['complete', 'partial', 'planned'];

/** Maps a story's `implemented` frontmatter to its index status. */
function statusFor(story) {
  if (story.implemented === 'true' || story.implemented === 'complete') return 'complete';
  if (story.implemented === 'partial') return 'partial';
  return 'planned';
}

/**
 * The `implemented` values the frontmatter may carry.
 *
 * `planned` and `false` both mean "not built"; `planned` is the explicit
 * spelling, `false` is the original one. Both are accepted so a story can
 * move between them without the tool reporting drift. `complete` and `true`
 * likewise both mean "built".
 */
const IMPLEMENTED_VALUES = ['true', 'false', 'partial', 'planned', 'complete'];

/** Reads every story file's `id` and `implemented` frontmatter. */
function readStories() {
  const stories = [];
  /** Story files whose `implemented:` value is not in the vocabulary. */
  const unknownValues = [];

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
        const implementedRaw = frontmatter.match(/^implemented:\s*(.+)$/m);
        const implemented = implementedRaw
          ? implementedRaw[1].trim()
          : 'false';

        if (!id) continue;

        // An unrecognised value must be a **hard error**, never a silent
        // default. The vocabulary once accepted only `true`/`false`/
        // `partial`/`planned`, so a story written as `implemented: complete`
        // fell through to the default `'false'` and was reported as
        // `planned` — and because the index was derived from the same broken
        // parse, the gate agreed with itself and reported no drift. Five
        // `complete` stories were silently demoted. The lesson: a gate that
        // derives both sides of a comparison from one shared mistake cannot
        // catch the mistake. A value the tool does not understand is a
        // vocabulary gap, and it is reported as one.
        if (!IMPLEMENTED_VALUES.includes(implemented)) {
          unknownValues.push({
            id: id[1].trim(),
            value: implemented,
            file: path.relative(ROOT, full),
          });
        }

        stories.push({
          id: id[1].trim(),
          implemented,
          unit: unit.name,
          file: path.relative(ROOT, full),
        });
      }
    }
  }

  return { stories, unknownValues };
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

/**
 * The bolt files.
 *
 * A bolt's `stories:` list names the stories it delivers, and each one has a
 * checkbox in the body. The checkbox must agree with the story file's state:
 * a `partial` story **is** delivered — it ships and works, and its gaps are
 * named in its own `## Implementation` section — so it is ticked. A `planned`
 * story is not delivered, so it stays unticked. And a bolt is `complete` only
 * when every story it lists is `complete`.
 */
function readBolts() {
  const boltsRoot = path.join(ROOT, 'memory-bank', 'bolts');
  const bolts = [];

  if (!fs.existsSync(boltsRoot)) return bolts;

  for (const dir of fs.readdirSync(boltsRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const boltFile = path.join(boltsRoot, dir.name, 'bolt.md');
    if (!fs.existsSync(boltFile)) continue;

    const text = fs.readFileSync(boltFile, 'utf8');
    const frontmatter = text.slice(0, text.indexOf('\n---', 3) + 4).replace(/\r/g, '');
    const status = (frontmatter.match(/^status:\s*(.+)$/m) || [])[1];
    const storyIds = (frontmatter.match(/^stories:\s*\[(.+)\]$/m) || [])[1];
    if (!storyIds) continue;

    bolts.push({
      id: dir.name,
      status,
      storyIds: storyIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      file: path.relative(ROOT, boltFile),
      text,
    });
  }

  return bolts;
}

function main() {
  const write = process.argv.includes('--write');
  const { stories, unknownValues } = readStories();
  const { text, rows } = readIndexRows();

  const byId = new Map(stories.map((story) => [story.id, story]));
  const drift = [];

  // 0. A story whose `implemented:` value the tool does not understand is a
  //    **vocabulary gap**, not a `planned` story. It is reported first,
  //    because every count below is derived from the same parse and would
  //    be wrong for the same reason.
  for (const unknown of unknownValues) {
    drift.push(
      `${unknown.id}: the story file says "implemented: ${unknown.value}", which is not one of ${IMPLEMENTED_VALUES.join(', ')}`,
    );
  }

  // 1. Every row's status must match its story file.
  for (const row of rows) {
    const story = byId.get(row.id);
    if (!story) {
      drift.push(`the index lists "${row.id}", which has no story file`);
      continue;
    }

    const expected = statusFor(story);
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

  // 3. A `partial` story must record its gaps. The state is only honest if
  //    the story file names what is missing — otherwise "partial" is just a
  //    softer way of saying "planned".
  for (const story of stories) {
    if (story.implemented !== 'partial') continue;

    const body = fs.readFileSync(path.join(ROOT, story.file), 'utf8');
    if (!/^##\s+Implementation\s*$/m.test(body)) {
      drift.push(
        `${story.id}: is marked "partial" but has no "## Implementation" section naming the gaps`,
      );
    }
  }

  // 4. The story's own `status:` must agree with its `implemented:`. The two
  //    fields used to drift apart: a story could say `status: complete` with
  //    `implemented: false`, which is the same lie the index told.
  const storyUpdates = [];

  for (const story of stories) {
    const wantStatus =
      story.implemented === 'true' || story.implemented === 'complete' ? 'complete' : 'ready';
    const body = fs.readFileSync(path.join(ROOT, story.file), 'utf8');
    const frontmatter = body.slice(0, body.indexOf('\n---', 3) + 4).replace(/\r/g, '');
    const currentStatus = (frontmatter.match(/^status:\s*(.+)$/m) || [])[1];

    if (!currentStatus || currentStatus === wantStatus) continue;

    drift.push(
      `${story.id}: the story file says "status: ${currentStatus}" but "implemented: ${story.implemented}"`,
    );

    storyUpdates.push({
      file: path.join(ROOT, story.file),
      text: body.replace(/^status:\s*.+$/m, `status: ${wantStatus}`),
    });
  }

  // 5. The header count must match the files.
  const counts = { complete: 0, partial: 0, planned: 0 };
  for (const story of stories) counts[statusFor(story)] += 1;

  const countPattern = /\*\*(\d+) complete · (\d+) partial · (\d+) planned\.\*\*/;
  const countMatch = text.match(countPattern);
  if (!countMatch) {
    drift.push('the index header has no "N complete · N partial · N planned." count');
  } else if (
    Number(countMatch[1]) !== counts.complete ||
    Number(countMatch[2]) !== counts.partial ||
    Number(countMatch[3]) !== counts.planned
  ) {
    drift.push(
      `the index header says "${countMatch[1]} complete · ${countMatch[2]} partial · ${countMatch[3]} planned", the story files say "${counts.complete} complete · ${counts.partial} partial · ${counts.planned} planned"`,
    );
  }

  // 6. Every bolt's checkbox must agree with its story files, and a bolt may
  //    only claim `complete` when every story it lists is `complete`.
  const bolts = readBolts();
  const boltUpdates = [];

  for (const bolt of bolts) {
    let boltText = bolt.text;
    let touched = false;

    for (const storyId of bolt.storyIds) {
      const story = byId.get(storyId);
      if (!story) {
        drift.push(`the bolt "${bolt.id}" lists "${storyId}", which has no story file`);
        continue;
      }

      const pattern = new RegExp(
        `^(- )\\[( |x)\\]\\s*(\\*\\*${storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*)`,
        'm',
      );
      const match = boltText.match(pattern);
      if (!match) continue;

      const wantChecked = statusFor(story) !== 'planned';
      const hasChecked = match[2] === 'x';

      if (wantChecked !== hasChecked) {
        boltText = boltText.replace(pattern, wantChecked ? '- [x]$3' : '- [ ]$3');
        touched = true;
        drift.push(
          `the bolt "${bolt.id}" ${hasChecked ? 'ticks' : 'does not tick'} "${storyId}", but the story file says "${statusFor(story)}"`,
        );
      }
    }

    const allComplete = bolt.storyIds.every((id) => {
      const story = byId.get(id);
      return story && statusFor(story) === 'complete';
    });
    const wantStatus = allComplete ? 'complete' : 'planned';

    if (bolt.status && bolt.status !== wantStatus) {
      boltText = boltText.replace(/^status:\s*.+$/m, `status: ${wantStatus}`);
      touched = true;
      drift.push(
        `the bolt "${bolt.id}" says "${bolt.status}", but its stories say "${wantStatus}"`,
      );
    }

    if (touched) boltUpdates.push({ file: path.join(ROOT, bolt.file), text: boltText });
  }

  if (write && drift.length > 0) {
    let updated = text;

    for (const story of stories) {
      const expected = statusFor(story);
      updated = updated.replace(
        new RegExp(`^(\\|\\s*${story.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|[^\\n]*?\\|\\s*)(complete|partial|planned)(\\s*\\|\\s*)$`, 'm'),
        `$1${expected}$3`,
      );
    }

    updated = updated.replace(
      countPattern,
      `**${counts.complete} complete · ${counts.partial} partial · ${counts.planned} planned.**`,
    );

    fs.writeFileSync(INDEX_PATH, updated, 'utf8');
    console.log(`✓ the index was rewritten from the story files`);
    console.log(
      `✓ ${counts.complete} complete · ${counts.partial} partial · ${counts.planned} planned`,
    );

    for (const bolt of boltUpdates) {
      fs.writeFileSync(bolt.file, bolt.text, 'utf8');
    }
    if (boltUpdates.length > 0) {
      console.log(`✓ ${boltUpdates.length} bolt file(s) rewritten from the story files`);
    }

    for (const story of storyUpdates) {
      fs.writeFileSync(story.file, story.text, 'utf8');
    }
    if (storyUpdates.length > 0) {
      console.log(`✓ ${storyUpdates.length} story file(s) rewritten from their own state`);
    }
    return;
  }

  if (drift.length === 0) {
    console.log(
      `✓ the index matches the story files — ${counts.complete} complete · ${counts.partial} partial · ${counts.planned} planned`,
    );
    console.log(`✓ every bolt agrees with its stories`);
    return;
  }

  console.log(`✗ the index has drifted from the story files:`);
  for (const item of drift) console.log(`  - ${item}`);
  process.exitCode = 1;
}

main();

// Generates the specsmd AI-DLC bolt plan from the unit briefs + story files.
// Run: node tools/generate-bolt-plan.cjs
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const intentDir = path.join(root, 'memory-bank', 'intents', '001-nagar-shield-mvp1');
const unitsDir = path.join(intentDir, 'units');
const boltsDir = path.join(root, 'memory-bank', 'bolts');

// ---- Read units + stories ----
const unitDirs = fs
  .readdirSync(unitsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const units = unitDirs.map((name) => {
  const storyDir = path.join(unitsDir, name, 'stories');
  const stories = fs.existsSync(storyDir)
    ? fs
        .readdirSync(storyDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => {
          const body = fs.readFileSync(path.join(storyDir, f), 'utf8');
          const priority = (body.match(/^priority:\s*(\w+)/m) || [, 'must'])[1];
          return { id: f.replace(/\.md$/, ''), priority, file: f };
        })
    : [];
  return { name, stories };
});

// ---- Bolt plan (hand-authored grouping) ----
// [unit, boltName, [story ids], complexity]
const PLAN = [
  // 001-foundation
  ['001-foundation', 'workspace-and-contracts', ['001-monorepo-workspace', '002-shared-contracts'], { c: 1, u: 1, d: 1, t: 1 }],
  ['001-foundation', 'design-system', ['003-mobile-design-system'], { c: 2, u: 1, d: 1, t: 2 }],
  ['001-foundation', 'app-shell-and-admin', ['004-mobile-app-shell', '005-admin-skeleton-and-ci'], { c: 2, u: 2, d: 2, t: 2 }],
  // 002-identity
  ['002-identity', 'profile-and-auth-core', ['001-signup-with-email-and-phone', '002-dual-identifier-login'], { c: 2, u: 1, d: 2, t: 2 }],
  ['002-identity', 'reset-and-biometrics', ['003-email-otp-password-reset', '004-biometric-reauth-gate'], { c: 2, u: 2, d: 2, t: 2 }],
  ['002-identity', 'contacts-and-account', ['006-emergency-contacts-crud', '005-remote-account-disable', '007-account-deletion-and-recovery'], { c: 2, u: 1, d: 2, t: 2 }],
  // 003-help-seek
  ['003-help-seek', 'help-alert-grid', ['001-home-and-help-alert-grid', '002-personal-emergency-picker'], { c: 3, u: 1, d: 2, t: 3 }],
  ['003-help-seek', 'curated-dataset', ['003-bundled-station-hotline-dataset'], { c: 1, u: 1, d: 1, t: 1 }],
  ['003-help-seek', 'more-help-surfaces', ['005-more-help-and-hotlines', '006-thana-line-fallback', '008-wrong-number-report'], { c: 2, u: 1, d: 2, t: 2 }],
  ['003-help-seek', 'station-map-and-degradation', ['007-find-a-station-map', '004-graceful-degradation'], { c: 3, u: 3, d: 3, t: 3 }],
  // 004-capture
  ['004-capture', 'capture-screen', ['001-capture-screen'], { c: 3, u: 2, d: 3, t: 3 }],
  ['004-capture', 'media-pipeline', ['004-exif-strip-and-media-caps', '007-storage-upload-and-finalize'], { c: 3, u: 2, d: 3, t: 3 }],
  ['004-capture', 'geocode-and-report', ['002-area-hierarchy-extraction', '003-report-detail-and-category-edit'], { c: 2, u: 2, d: 2, t: 2 }],
  ['004-capture', 'offline-queue', ['005-offline-upload-queue', '006-capture-permission-degradation'], { c: 3, u: 2, d: 2, t: 3 }],
  // 005-location
  ['005-location', 'share-screen', ['001-location-sharing-screen'], { c: 2, u: 1, d: 2, t: 3 }],
  ['005-location', 'share-channels', ['002-os-share-sheet-fallback', '003-share-with-all-primary-contacts'], { c: 2, u: 1, d: 2, t: 3 }],
  ['005-location', 'payload-and-degradation', ['004-snapshot-payload-and-telemetry', '005-location-permission-degradation'], { c: 2, u: 2, d: 2, t: 2 }],
  // 006-alerts
  ['006-alerts', 'feed', ['001-alerts-feed-list', '003-area-filter-chips'], { c: 2, u: 1, d: 2, t: 3 }],
  ['006-alerts', 'refresh-and-flagging', ['002-auto-refresh-and-pull-to-refresh', '004-flag-an-alert', '005-author-auto-hide'], { c: 3, u: 2, d: 3, t: 3 }],
  ['006-alerts', 'history', ['006-history-list', '007-history-filters'], { c: 2, u: 1, d: 2, t: 2 }],
  ['006-alerts', 'history-map-and-detail', ['008-history-map', '009-alert-detail-screen'], { c: 2, u: 2, d: 2, t: 3 }],
  // 007-moderation
  ['007-moderation', 'queue', ['001-moderator-login-and-queue', '002-report-review-detail'], { c: 2, u: 1, d: 3, t: 3 }],
  ['007-moderation', 'decisions', ['003-restore-remove-decision', '004-disable-a-user'], { c: 2, u: 1, d: 3, t: 3 }],
  ['007-moderation', 'audit-and-auto-hide', ['005-author-auto-hide-queue', '006-moderator-action-audit-log'], { c: 2, u: 2, d: 2, t: 2 }],
  // 008-jobs-operations
  ['008-jobs-operations', 'purge-jobs', ['001-media-purge-job', '002-deleted-account-pii-purge', '003-geocode-cache-cleanup'], { c: 2, u: 1, d: 2, t: 2 }],
  ['008-jobs-operations', 'build-and-ci', ['004-eas-build-profiles', '005-ci-pipeline'], { c: 2, u: 1, d: 3, t: 2 }],
  ['008-jobs-operations', 'runbook-and-secrets', ['006-release-runbook', '007-secrets-and-environments'], { c: 1, u: 1, d: 2, t: 1 }],
];

// ---- Validate coverage ----
const covered = new Set(PLAN.flatMap(([, , s]) => s));
const allStories = units.flatMap((u) => u.stories.map((s) => s.id));
const missing = allStories.filter((s) => !covered.has(s));
const unknown = [...covered].filter((s) => !allStories.includes(s));
if (missing.length) throw new Error(`Stories not assigned to a bolt: ${missing.join(', ')}`);
if (unknown.length) throw new Error(`Unknown story ids in plan: ${unknown.join(', ')}`);

for (const [, , stories] of PLAN) {
  if (stories.length > 6) throw new Error(`Bolt too large: ${stories.length} stories`);
}

// ---- Bolt types ----
// Backend/domain units -> ddd; frontend/ui units -> simple.
const DDD_UNITS = new Set(['002-identity', '003-help-seek', '004-capture', '005-location', '006-alerts', '007-moderation']);
const SIMPLE_UNITS = new Set(['001-foundation', '008-jobs-operations']);
const boltType = (unit) => (DDD_UNITS.has(unit) ? 'ddd-construction-bolt' : 'simple-construction-bolt');

// ---- Build the global sequence ----
// Unit folder names carry their own numeric prefix (e.g. `001-foundation`).
// The bolt suffix uses the unit name WITHOUT that prefix, so bolt ids read
// `001-foundation`, `004-identity`, ... and stay globally unique.
const unitSlug = (unit) => unit.replace(/^\d+-/, '');

const bolts = [];
let n = 0;
for (const [unit, name, stories, cx] of PLAN) {
  n += 1;
  bolts.push({
    id: `${String(n).padStart(3, '0')}-${unitSlug(unit)}`,
    unit,
    name,
    stories,
    cx,
    type: boltType(unit),
  });
}

// ---- Dependency edges (bolt level) ----
const byUnit = new Map();
for (const b of bolts) {
  if (!byUnit.has(b.unit)) byUnit.set(b.unit, []);
  byUnit.get(b.unit).push(b);
}
const unitOrder = [...byUnit.keys()]; // dependency order follows the unit order

const requiresBolts = new Map();
const enablesBolts = new Map();
for (const b of bolts) {
  requiresBolts.set(b.id, []);
  enablesBolts.set(b.id, []);
}

// Same-unit: a bolt requires the previous bolt of the same unit.
for (const [unit, list] of byUnit) {
  for (let i = 1; i < list.length; i++) {
    requiresBolts.get(list[i].id).push(list[i - 1].id);
    enablesBolts.get(list[i - 1].id).push(list[i].id);
  }
}

// Cross-unit: a unit's first bolt requires the LAST bolt of every unit it depends on.
const UNIT_DEPS = {
  '001-foundation': [],
  '002-identity': ['001-foundation'],
  '003-help-seek': ['001-foundation', '002-identity'],
  '004-capture': ['001-foundation', '002-identity'],
  '005-location': ['001-foundation', '002-identity', '004-capture'],
  '006-alerts': ['001-foundation', '002-identity', '004-capture'],
  '007-moderation': ['001-foundation', '002-identity', '004-capture', '006-alerts'],
  '008-jobs-operations': ['001-foundation', '002-identity', '003-help-seek', '004-capture', '005-location', '006-alerts', '007-moderation'],
};
for (const [unit, deps] of Object.entries(UNIT_DEPS)) {
  const first = byUnit.get(unit)[0];
  for (const dep of deps) {
    const depLast = byUnit.get(dep).at(-1);
    if (!requiresBolts.get(first.id).includes(depLast.id)) requiresBolts.get(first.id).push(depLast.id);
    if (!enablesBolts.get(depLast.id).includes(first.id)) enablesBolts.get(depLast.id).push(first.id);
  }
}

// ---- Write bolt.md files ----
const storiesByUnit = new Map(units.map((u) => [u.name, u.stories]));
fs.mkdirSync(boltsDir, { recursive: true });

const written = [];
for (const b of bolts) {
  const dir = path.join(boltsDir, b.id);
  fs.mkdirSync(dir, { recursive: true });
  const unitStories = storiesByUnit.get(b.unit);
  const storyMeta = b.stories.map((sid) => {
    const s = unitStories.find((x) => x.id === sid);
    return { id: sid, priority: s ? s.priority : 'must' };
  });

  const body = [];
  body.push('---');
  body.push(`id: ${b.id}`);
  body.push(`unit: ${b.unit}`);
  body.push('intent: 001-nagar-shield-mvp1');
  body.push(`type: ${b.type}`);
  body.push('status: planned');
  body.push(`stories: [${b.stories.join(', ')}]`);
  body.push('created: 2026-11-04T00:00:00Z');
  body.push('');
  body.push('# Dependency Tracking');
  body.push(`requires_bolts: [${requiresBolts.get(b.id).join(', ')}]`);
  body.push(`enables_bolts: [${enablesBolts.get(b.id).join(', ')}]`);
  body.push(`requires_units: [${UNIT_DEPS[b.unit].join(', ')}]`);
  body.push('blocks: false');
  body.push('');
  body.push('# Complexity Assessment');
  body.push('complexity:');
  body.push(`  avg_complexity: ${b.cx.c}`);
  body.push(`  avg_uncertainty: ${b.cx.u}`);
  body.push(`  max_dependencies: ${b.cx.d}`);
  body.push(`  testing_scope: ${b.cx.t}`);
  body.push('---');
  body.push('');
  body.push(`## Bolt: ${b.id}`);
  body.push('');
  body.push(`### Objective`);
  body.push(
    `Deliver **${b.name.replace(/-/g, ' ')}** for unit \`${b.unit}\`. ` +
      `Stories: ${b.stories.length}. Bolt type: \`${b.type}\`.`
  );
  body.push('');
  body.push('### Stories Included');
  body.push('');
  for (const s of storyMeta) {
    body.push(`- [ ] **${s.id}** — Priority: ${s.priority}`);
  }
  body.push('');
  body.push('### Expected Outputs');
  body.push('');
  if (b.type === 'ddd-construction-bolt') {
    body.push('- `ddd-01-domain-model.md` — entities, aggregates, invariants');
    body.push('- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition');
    body.push('- `ddd-03-test-report.md` — verification evidence per acceptance criterion');
  } else {
    body.push('- `implementation-plan.md` — the change plan and file map');
    body.push('- `test-report.md` — verification evidence per acceptance criterion');
  }
  body.push('- Working implementation for every story listed above');
  body.push('');
  body.push('### Dependencies');
  body.push('');
  body.push('#### Bolt Dependencies (within intent)');
  body.push('');
  const rb = requiresBolts.get(b.id);
  body.push(rb.length ? rb.map((x) => `- **${x}** (Required): must complete first`).join('\n') : '- None — this is a root bolt.');
  body.push('');
  body.push('#### Unit Dependencies (cross-unit)');
  body.push('');
  const ru = UNIT_DEPS[b.unit];
  body.push(ru.length ? ru.map((x) => `- **${x}**: unit must be complete`).join('\n') : '- None.');
  body.push('');
  body.push('#### Enables (other bolts waiting on this)');
  body.push('');
  const eb = enablesBolts.get(b.id);
  body.push(eb.length ? eb.map((x) => `- ${x}`).join('\n') : '- None.');
  body.push('');

  fs.writeFileSync(path.join(dir, 'bolt.md'), body.join('\n'), 'utf8');
  written.push(b.id);
}

// ---- Write the bolt plan index ----
const idx = [];
idx.push('---');
idx.push('intent: 001-nagar-shield-mvp1');
idx.push('phase: inception');
idx.push('status: complete');
idx.push('created: 2026-11-04T00:00:00Z');
idx.push('updated: 2026-11-04T00:00:00Z');
idx.push('---');
idx.push('');
idx.push('# Bolt Plan — Nagar Shield MVP Phase 1');
idx.push('');
idx.push(`**${bolts.length} bolts** covering **${allStories.length} stories** across ${units.length} units.`);
idx.push('Bolt ids use a **global** 3-digit sequence in `memory-bank/bolts/`.');
idx.push('');
idx.push('## Bolts');
idx.push('');
idx.push('| Bolt | Unit | Type | Stories |');
idx.push('|---|---|---|---|');
for (const b of bolts) {
  idx.push(`| \`${b.id}\` | ${b.unit} | ${b.type} | ${b.stories.length} |`);
}
idx.push('');
idx.push('## Dependency Graph');
idx.push('');
idx.push('```text');
for (const [unit, list] of byUnit) {
  const label = unit.replace(/^\d+-/, '');
  idx.push(`${label}:`);
  idx.push(`  ${list.map((b) => b.id.split('-')[0]).join(' → ')}`);
}
idx.push('```');
idx.push('');
idx.push('## Execution Order');
idx.push('');
idx.push('1. `001`–`003` — **001-foundation** (workspace, contracts, design system, shell)');
idx.push('2. `004`–`006` — **002-identity** (profile, auth, biometrics, contacts)');
idx.push('3. `007`–`010` — **003-help-seek** (Help Alert, dataset, More Help, station map)');
idx.push('4. `011`–`014` — **004-capture** (Capture screen, media pipeline, geocode, offline queue)');
idx.push('5. `015`–`017` — **005-location** (share screen, channels, payload)');
idx.push('6. `018`–`021` — **006-alerts** (feed, flagging, history, map)');
idx.push('7. `022`–`024` — **007-moderation** (queue, decisions, audit)');
idx.push('8. `025`–`027` — **008-jobs-operations** (purge jobs, build + CI, runbook)');
idx.push('');
idx.push('## Story Coverage');
idx.push('');
idx.push('| Unit | Stories | Bolts |');
idx.push('|---|---|---|');
for (const u of units) {
  idx.push(`| ${u.name} | ${u.stories.length} | ${byUnit.get(u.name).length} |`);
}
idx.push('');
idx.push('Every story in every unit is assigned to exactly one bolt. Validation runs at generation time.');
idx.push('');
fs.writeFileSync(path.join(intentDir, 'bolt-plan.md'), idx.join('\n'), 'utf8');

console.log(`wrote ${written.length} bolts + bolt-plan.md`);
console.log(written.join('\n'));

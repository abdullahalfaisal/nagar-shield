// Extracts the story table (ID, title, priority) from each unit brief.
// Usage: node tools/extract-stories.cjs
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const unitsDir = path.join(root, 'memory-bank', 'intents', '001-nagar-shield-mvp1', 'units');

const out = {};
for (const dir of fs.readdirSync(unitsDir)) {
  const briefPath = path.join(unitsDir, dir, 'unit-brief.md');
  if (!fs.existsSync(briefPath)) continue;
  const md = fs.readFileSync(briefPath, 'utf8');

  // The "### Stories" section table
  const section = md.split('### Stories')[1]?.split('\n---')[0] ?? '';
  const rows = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\| US-[A-Z]+-\d+/.test(l))
    .map((l) => {
      const cells = l.split('|').map((c) => c.trim()).filter((c) => c !== '');
      return { id: cells[0], title: cells[1], priority: cells[2] };
    });

  const boltRows = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\| bolt-/.test(l))
    .map((l) => {
      const cells = l.split('|').map((c) => c.trim()).filter((c) => c !== '');
      return { bolt: cells[0], type: cells[1], stories: cells[2], objective: cells[3] };
    });

  out[dir] = { stories: rows, bolts: boltRows };
}

console.log(JSON.stringify(out, null, 2));

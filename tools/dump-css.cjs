// Extracts a named CSS rule (or all rules whose selector matches) from
// `prototype ui.html`. Usage: node tools/dump-css.cjs ".btn" ".input-field"
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'prototype ui.html'), 'utf8');
const styleBlock = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));

function splitTopLevel(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const chunk = css.slice(start, i + 1);
        const selector = css.slice(css.lastIndexOf('}', start) + 1, start).trim();
        rules.push({ selector, body: chunk.slice(chunk.indexOf('{') + 1, chunk.lastIndexOf('}')) });
      }
    }
  }
  return rules;
}

const rules = splitTopLevel(styleBlock);
const needles = process.argv.slice(2);

for (const rule of rules) {
  const selectors = rule.selector.split(',').map((s) => s.trim());
  const hit = needles.length === 0
    ? true
    : needles.some((n) => selectors.some((s) => s === n || s.includes(n)));
  if (!hit) continue;
  console.log(`${rule.selector} {`);
  for (const decl of rule.body.split(';')) {
    const d = decl.trim();
    if (d) console.log(`  ${d};`);
  }
  console.log('}');
  console.log('');
}

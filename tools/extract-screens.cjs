// Extracts a screen-by-screen port contract from `prototype ui.html`
// into docs/design/screen-spec.md. Run: node tools/extract-screens.cjs
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'prototype ui.html'), 'utf8');

const lines = [];
const push = (s = '') => lines.push(s);

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isBangla(s) {
  return /[\u0980-\u09FF]/.test(s);
}

// --- Locate each .screen block by scanning for the opening tag and matching braces ---
const screens = [];
const screenRe = /<div\s+class="([^"]*\bscreen\b[^"]*)"\s+data-screen="(\d+)"\s+data-name="([^"]*)"\s*>/g;
let m;
while ((m = screenRe.exec(src)) !== null) {
  const openIdx = m.index;
  // Walk forward counting <div and </div>
  let i = src.indexOf('>', openIdx) + 1;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const nextOpen = src.indexOf('<div', i);
    const nextClose = src.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = src.indexOf('>', nextOpen) + 1;
    } else {
      depth--;
      i = nextClose + 6;
    }
  }
  screens.push({
    classes: m[1],
    id: m[2],
    name: m[3],
    html: src.slice(openIdx, i),
  });
}

// --- Navigation edges ---
const navEdges = [];
const navRe = /data-nav="(\d+)"/g;
for (const s of screens) {
  let nm;
  const seen = new Set();
  while ((nm = navRe.exec(s.html)) !== null) {
    if (seen.has(nm[1])) continue;
    seen.add(nm[1]);
    navEdges.push({ from: s.id, fromName: s.name, to: nm[1] });
  }
}
navRe.lastIndex = 0;

// --- Scripts ---
const scripts = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((s) => s[1]);

// --- Inline styles (tokens that only exist inline) ---
const inlineStyles = [...src.matchAll(/style="([^"]*)"/g)].map((s) => s[1]);
const inlineGradientCount = inlineStyles.filter((s) => s.includes('gradient')).length;

push('# Nagar Shield — Screen Port Contract');
push();
push('> Generated from `prototype ui.html` by `tools/extract-screens.cjs`.');
push('> Every screen in the prototype is listed here with its exact copy, layout order, and controls.');
push('> The React Native build must reproduce these screens 1:1.');
push();
push('---');
push();
push('## Screen index');
push();
push('| # | data-screen | Name |');
push('|---|---|---|');
for (const s of screens) push(`| ${s.id} | ${s.id} | ${s.name} |`);
push();
push('---');
push();
push('## Screen specifications');
push();

for (const s of screens) {
  push(`### ${s.id} — ${s.name}`);
  push();

  // Structure: headings by class
  const classHeadings = [...s.html.matchAll(/<div class="(section-title|app-bar-title|card-title|title|subtitle|label|help-header|header-title)[^"]*"[^>]*>([\s\S]{0,200}?)<\/div>/g)];
  const textNodes = [...s.html.matchAll(/>([^<>{}]{2,120})</g)].map((x) => x[1].trim()).filter(Boolean);

  // Unique visible strings, preserving order
  const strings = [];
  const seen = new Set();
  for (const t of textNodes) {
    const clean = t.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(clean)) continue;
    if (/^[\d\s:.,%°–—\-]+$/.test(clean)) continue;
    seen.add(clean);
    strings.push(clean);
  }

  push('**Copy** (Bangla strings marked 🇧🇩):');
  push();
  for (const t of strings) push(`- ${isBangla(t) ? '🇧🇩 ' : ''}\`${t}\``);
  push();

  // Buttons / controls
  const controls = [...s.html.matchAll(/<(button|a)\b([^>]*)>([\s\S]{0,300}?)<\/\1>/g)].map((c) => ({
    tag: c[1],
    attrs: c[2],
    label: textOf(c[3]).trim(),
  }));
  if (controls.length) {
    push('**Controls**');
    push();
    push('| Label | Tag | Class | Icon | data-nav |');
    push('|---|---|---|---|---|');
    for (const c of controls) {
      const cls = (c.attrs.match(/class="([^"]*)"/) || [, ''])[1];
      const icon = (c.attrs.match(/material-symbols-[a-z-]+">([^<]*)</) || [, ''])[1];
      const nav = (c.attrs.match(/data-nav="(\d+)"/) || [, ''])[1];
      push(`| ${c.label ? (isBangla(c.label) ? '🇧🇩 ' : '') + c.label : '—'} | ${c.tag} | \`${cls}\` | ${icon ? `\`${icon}\`` : '—'} | ${nav || '—'} |`);
    }
    push();
  }

  // Icons
  const icons = [...new Set([...s.html.matchAll(/material-symbols-[a-z-]+">([^<]+)</g)].map((x) => x[1].trim()))];
  if (icons.length) {
    push(`**Icons**: ${icons.map((i) => `\`${i}\``).join(', ')}`);
    push();
  }

  // Inputs
  const inputs = [...s.html.matchAll(/<input\b([^>]*)>/g)].map((c) => c[1]);
  if (inputs.length) {
    push('**Inputs**');
    push();
    for (const inp of inputs) {
      push(`- \`${inp.trim()}\``);
    }
    push();
  }

  // Data attributes / state hooks
  const toggles = [...s.html.matchAll(/class="([^"]*toggle[^"]*)"/g)].map((x) => x[1]);
  if (toggles.length) {
    push(`**Toggle/state classes**: ${[...new Set(toggles)].map((t) => `\`${t}\``).join(', ')}`);
    push();
  }

  // Key structural blocks
  const structural = [...s.html.matchAll(/<div class="([^"]+)">/g)].map((x) => x[1]);
  const structuralCounts = new Map();
  for (const c of structural) structuralCounts.set(c, (structuralCounts.get(c) || 0) + 1);
  const topStructural = [...structuralCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  push('**Layout classes used** (count):');
  push();
  for (const [c, n] of topStructural) push(`- \`${c}\` ×${n}`);
  push();

  push('---');
  push();
}

push('## Navigation graph');
push();
push('| From | Screen | → data-nav target |');
push('|---|---|---|');
for (const e of navEdges) push(`| ${e.from} | ${e.fromName} | ${e.to} |`);
push();
push('Targets not present as a screen (modals / sheets / dead ends):');
push();
const screenIds = new Set(screens.map((s) => s.id));
const unknownTargets = [...new Set(navEdges.filter((e) => !screenIds.has(e.to)).map((e) => e.to))];
push(unknownTargets.length ? unknownTargets.map((t) => `- \`${t}\``).join('\n') : '- (none)');
push();
push('---');
push();
push('## JavaScript behaviour');
push();
for (const [i, code] of scripts.entries()) {
  push(`### Script block ${i + 1}`);
  push();
  push('```js');
  push(code.trim());
  push('```');
  push();
}
push('---');
push();
push('## Inline-style census');
push();
push(`Total inline \`style="..."\` attributes: ${inlineStyles.length}`);
push(`Of which contain a gradient: ${inlineGradientCount}`);
push();
push('Inline styles are **not** covered by the `:root` token block — each one must be copied verbatim into the RN implementation.');
push();
push('| Inline style |');
push('|---|');
for (const st of [...new Set(inlineStyles)].sort()) push(`| \`${st.replace(/\|/g, '\\|')}\` |`);
push();

const outPath = path.join(root, 'docs', 'design', 'screen-spec.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`wrote ${outPath} (${lines.length} lines, ${screens.length} screens, ${navEdges.length} nav edges, ${scripts.length} script blocks)`);

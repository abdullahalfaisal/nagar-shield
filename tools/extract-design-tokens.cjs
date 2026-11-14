// Extracts the design-token + component contract from `prototype ui.html`
// into docs/design/design-tokens.md. Run: node tools/extract-design-tokens.cjs
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(root, 'prototype ui.html'), 'utf8')

const styleBlock = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'))

// --- Split into top-level rules (naive but fine for this hand-written CSS) ---
function splitTopLevel(css) {
  const rules = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const chunk = css.slice(start, i + 1)
        const selector = css.slice(css.lastIndexOf('}', start) + 1, start).trim()
        rules.push({ selector, body: chunk.slice(chunk.indexOf('{') + 1, chunk.lastIndexOf('}')) })
      }
    }
  }
  return rules
}

const rules = splitTopLevel(styleBlock)

function parseDecls(body) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      out.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out.filter(Boolean).map((d) => {
    const i = d.indexOf(':')
    if (i === -1) return { prop: d.trim(), value: '' }
    return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() }
  })
}

// --- Token extraction ---
const tokenSource = {}
for (const rule of rules) {
  if (rule.selector.startsWith(':root')) {
    for (const d of parseDecls(rule.body)) {
      if (d.prop.startsWith('--')) tokenSource[d.prop] = d.value
    }
  }
}

const darkOverrides = {}
for (const rule of rules) {
  if (rule.selector.includes('[data-theme="dark"]')) {
    for (const d of parseDecls(rule.body)) {
      if (d.prop.startsWith('--')) darkOverrides[d.prop] = d.value
    }
  }
}

// --- Component extraction ---
const componentRules = rules.filter(
  (r) => !r.selector.startsWith(':root') && !r.selector.startsWith('@'),
)
const mediaBlocks = rules.filter((r) => r.selector.startsWith('@'))

const lines = []
const push = (s = '') => lines.push(s)

push('# Nagar Shield — Design Tokens & Component Contract')
push()
push('> Generated from `prototype ui.html` by `tools/extract-design-tokens.cjs`.')
push(
  '> This file is the **port contract**: React Native implementation must match these values exactly.',
)
push()
push('---')
push()
push('## 1. Color tokens')
push()
push('### 1.1 Light theme (`:root`)')
push()
push('| Token | Value |')
push('|---|---|')
for (const [k, v] of Object.entries(tokenSource)) {
  if (k.includes('radius') || k.startsWith('--r-')) continue
  push(`| \`${k}\` | \`${v}\` |`)
}
push()
push('### 1.2 Dark theme overrides (`:root[data-theme="dark"]`)')
push()
push(
  'Dark is the **default** theme in the prototype (`restoreTheme()` sets `data-theme="dark"` on load).',
)
push()
push('| Token | Dark value | Light value |')
push('|---|---|---|')
for (const [k, v] of Object.entries(darkOverrides)) {
  push(`| \`${k}\` | \`${v}\` | \`${tokenSource[k] ?? '(not defined in :root)'}\` |`)
}
push()
push('### 1.3 Legacy alias resolution')
push()
push('`--blue-*` and `--purple-*` are back-compat aliases that resolve onto the violet ramp.')
push(
  'They are **not** re-declared in the dark theme, so they keep their light violet values in dark mode.',
)
push()
push('| Alias | Resolves to | Effective hex | Dark theme |')
push('|---|---|---|---|')
for (const [k, v] of Object.entries(tokenSource)) {
  if (!/^--(blue|purple)-/.test(k)) continue
  const target = v.replace(/var\((--[a-z0-9-]+)\)/, '$1').trim()
  const resolved = tokenSource[target] ?? target
  push(
    `| \`${k}\` | \`${target}\` | \`${resolved}\` | ${darkOverrides[target] ? 'overridden via target' : 'not overridden'} |`,
  )
}
push()
push('---')
push()
push('## 2. Radius, shadow, motion')
push()
for (const family of [
  ['--r-', 'Radius'],
  ['--shadow-', 'Shadow'],
  ['--ease-', 'Easing'],
  ['--dur-', 'Duration'],
  ['--grad-', 'Gradient'],
]) {
  const [prefix, label] = family
  const entries = Object.entries(tokenSource).filter(([k]) => k.startsWith(prefix))
  if (!entries.length) continue
  push(`### ${label}`)
  push()
  push('| Token | Value |')
  push('|---|---|')
  for (const [k, v] of entries) push(`| \`${k}\` | \`${v}\` |`)
  push()
}
push('---')
push()
push('## 3. Component inventory')
push()
push(
  'Each entry lists the class, its declared box model / typography / color, and any pseudo-element rules.',
)
push()

const pseudoBySelector = new Map()
for (const rule of componentRules) {
  const sels = rule.selector.split(',').map((s) => s.trim())
  for (const sel of sels) {
    if (!pseudoBySelector.has(sel)) pseudoBySelector.set(sel, [])
    pseudoBySelector.get(sel).push(rule.body)
  }
}

for (const rule of componentRules) {
  const decls = parseDecls(rule.body)
  if (!decls.length) continue
  push(`#### \`${rule.selector}\``)
  push()
  push('```css')
  push(`${rule.selector} {`)
  for (const d of decls) push(`  ${d.prop}: ${d.value};`)
  push('}')
  push('```')
  push()
}

push('---')
push()
push('## 4. Media queries / responsive blocks')
push()
for (const m of mediaBlocks) {
  push(`- \`${m.selector}\` — ${parseDecls(m.body).length} declaration(s)`)
  push()
  push('```css')
  push(m.body.trim())
  push('```')
  push()
}

const outPath = path.join(root, 'docs', 'design', 'design-tokens.md')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
console.log(
  `wrote ${outPath} (${lines.length} lines, ${componentRules.length} component rules, ${Object.keys(tokenSource).length} tokens)`,
)

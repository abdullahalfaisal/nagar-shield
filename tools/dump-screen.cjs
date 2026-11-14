// Dumps a named screen's markup from prototype ui.html for inspection.
// Usage: node tools/dump-screen.cjs "Help Alert"
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(root, 'prototype ui.html'), 'utf8')
const name = process.argv[2]

const marker = `data-name="${name}"`
const idx = src.indexOf(marker)
if (idx === -1) {
  console.error(`screen not found: ${name}`)
  process.exit(1)
}
const openIdx = src.lastIndexOf('<div', idx)
let i = src.indexOf('>', openIdx) + 1
let depth = 1
while (i < src.length && depth > 0) {
  const nextOpen = src.indexOf('<div', i)
  const nextClose = src.indexOf('</div>', i)
  if (nextClose === -1) break
  if (nextOpen !== -1 && nextOpen < nextClose) {
    depth++
    i = src.indexOf('>', nextOpen) + 1
  } else {
    depth--
    i = nextClose + 6
  }
}
const out = src.slice(openIdx, i)
const outPath = path.join(
  root,
  'docs',
  'design',
  `screen-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`,
)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, out, 'utf8')
console.log(`wrote ${outPath} (${out.split('\n').length} lines)`)

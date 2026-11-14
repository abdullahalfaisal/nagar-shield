// One-off cleanup of the Expo template leftovers.
// Run: node tools/clean-mobile-template.cjs
const fs = require('fs')
const path = require('path')

const mobile = path.resolve(__dirname, '..', 'apps', 'mobile')
const targets = ['App.tsx', 'index.ts', 'AGENTS.md', 'LICENSE', '.gitignore']
const dirs = ['.git', '.claude']

for (const file of targets) {
  const full = path.join(mobile, file)
  if (fs.existsSync(full)) {
    fs.rmSync(full, { force: true })
    console.log(`removed file ${file}`)
  }
}
for (const dir of dirs) {
  const full = path.join(mobile, dir)
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true })
    console.log(`removed dir  ${dir}`)
  }
}
console.log('remaining:', fs.readdirSync(mobile).join(', '))

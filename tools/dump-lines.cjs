const fs = require('node:fs');
const file = process.argv[2];
const start = Number(process.argv[3] ?? 1);
const end = Number(process.argv[4] ?? 40);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
for (let i = start - 1; i < Math.min(end, lines.length); i += 1) {
  console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
}

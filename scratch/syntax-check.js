/** Parse every app JS file and report syntax errors. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const roots = [path.join(__dirname, '..', 'js')];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
}
roots.forEach(walk);

let failed = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    new vm.Script(src, { filename: f });
  } catch (err) {
    failed++;
    console.log(`SYNTAX ERROR  ${path.relative(path.join(__dirname, '..'), f)}`);
    console.log(`   ${err.message}`);
  }
}

console.log(`\nChecked ${files.length} files — ${failed} with syntax errors.`);
process.exit(failed ? 1 : 0);

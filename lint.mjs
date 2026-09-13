/* Lints the application the way the browser loads it: the four scripts, in
   index.html order, as one program in one global scope. Line numbers in the
   report are mapped back to the file they came from. Exits non-zero on any
   error; warnings are printed and do not fail. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILES = ['reveal-data.js', 'narrative-templates.js', 'storage-migration.js', 'app.js'];
const map = [];
let offset = 0, out = '';
for (const f of FILES){
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n').length;
  map.push({ file: f, from: offset + 1, to: offset + lines });
  out += src + '\n';
  offset += lines;
}
/* The bundle is written beside the sources, because eslint will not read a
   file outside the config's base path, and removed again on the way out. */
const bundle = '.lint-bundle.js';
writeFileSync(bundle, out);

let report = [];
try {
  const raw = execFileSync('/opt/node-tools/node_modules/.bin/eslint',
    ['--no-config-lookup', '-c', 'eslint.config.mjs', '-f', 'json', bundle],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  report = JSON.parse(raw);
} catch (e) {
  try { report = JSON.parse(e.stdout || '[]'); }
  catch (_) { console.error('eslint did not return JSON:\n' + String(e.stderr || e.message)); process.exit(2); }
}
unlinkSync(bundle);
const msgs = (report[0] || {}).messages || [];
const where = (l) => {
  const m = map.find(x => l >= x.from && l <= x.to);
  return m ? `${m.file}:${l - m.from + 1}` : `bundle:${l}`;
};
let errors = 0;
for (const m of msgs){
  if (m.severity === 2) errors++;
  console.log(`${m.severity === 2 ? 'ERROR' : 'warn '}  ${where(m.line)}  ${m.message}  (${m.ruleId})`);
}
console.log(`\n${msgs.length} finding(s): ${errors} error(s), ${msgs.length - errors} warning(s).`);
process.exit(errors ? 1 : 0);

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'assets/vendor/knowledge/site.bundle.js');
const check = process.argv.includes('--check');
const normalize = text => text.replace(/\r\n/g, '\n');
const result = await build({ absWorkingDir: root, entryPoints: ['src/knowledge-site-entry.js'], bundle: true,
  format: 'iife', outfile, minify: true, legalComments: 'linked', write: false });
const bundle = result.outputFiles.find(file => file.path === outfile);
const version = createHash('sha256').update(normalize(bundle.text)).digest('hex').slice(0, 12);
const indexPath = path.join(root, 'index.html');
const original = await readFile(indexPath, 'utf8');
const updated = original.replace(/assets\/vendor\/knowledge\/site\.bundle\.js\?v=[^"\s]+/, 'assets/vendor/knowledge/site.bundle.js?v=' + version);
if (updated === original && !original.includes('site.bundle.js?v=' + version)) throw new Error('Missing homepage bundle reference');
const stale = [];
for (const file of result.outputFiles) {
  if (check) {
    const existing = await readFile(file.path, 'utf8').catch(() => '');
    if (normalize(existing) !== normalize(file.text)) stale.push(path.relative(root, file.path));
  } else {
    await mkdir(path.dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents);
  }
}
if (check) {
  if (updated !== original) stale.push('index.html bundle version');
  if (stale.length) throw new Error('Build artifacts are stale: ' + stale.join(', ') + '. Run npm run build:knowledge-site and commit the result.');
} else if (updated !== original) await writeFile(indexPath, updated);
console.log(`Knowledge bundle ${version}: ${check ? 'verified' : 'built'}`);

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const check = process.argv.includes('--check');
const normalize = text => text.replace(/\r\n/g, '\n');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stale = [];
// Cloudflare's zero-build deployment does not install npm dependencies.
// Commit the official parser with Functions and keep it tied to package-lock.
for (const [source, target] of [
  ['node_modules/acorn/dist/acorn.mjs', 'functions/lib/vendor/acorn.mjs'],
  ['node_modules/acorn/LICENSE', 'functions/lib/vendor/acorn.LICENSE'],
  ['node_modules/acorn/LICENSE', 'assets/vendor/knowledge/acorn.LICENSE']
]) {
  const content = await readFile(path.join(root, source), 'utf8');
  if (check) {
    const committed = await readFile(path.join(root, target), 'utf8').catch(() => '');
    if (normalize(content) !== normalize(committed)) stale.push(target);
  } else {
    await mkdir(path.dirname(path.join(root, target)), { recursive: true });
    await writeFile(path.join(root, target), content);
  }
}

const indexPath = path.join(root, 'index.html');
const original = await readFile(indexPath, 'utf8');
let updated = original;
for (const [entry, name] of [['src/knowledge-site-entry.js', 'site'], ['src/knowledge-article-layout-entry.mjs', 'article-layout']]) {
  const relative = 'assets/vendor/knowledge/' + name + '.bundle.js';
  const outfile = path.join(root, relative);

  const result = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true,
    format: 'iife', outfile, minify: true, legalComments: 'linked', write: false,
    banner: name === 'article-layout' ? { js: '/* Includes Acorn (MIT). See acorn.LICENSE. */' } : undefined });
  const bundle = result.outputFiles.find(file => file.path === outfile);
  const version = createHash('sha256').update(normalize(bundle.text)).digest('hex').slice(0, 12);
  const reference = new RegExp(relative.replaceAll('.', '\\.') + '\\?v=[^"\\s]+');
  if (!reference.test(updated)) throw new Error('Missing bundle reference: ' + relative);
  updated = updated.replace(reference, relative + '?v=' + version);
  for (const file of result.outputFiles) {
    if (check) {
      const existing = await readFile(file.path, 'utf8').catch(() => '');
      if (normalize(existing) !== normalize(file.text)) stale.push(path.relative(root, file.path));
    } else {
      await mkdir(path.dirname(file.path), { recursive: true });
      await writeFile(file.path, file.contents);
    }
  }
  console.log(`Knowledge ${name} bundle ${version}: ${check ? 'verified' : 'built'}`);
}
if (check) {
  if (updated !== original) stale.push('index.html bundle version');
  if (stale.length) throw new Error('Build artifacts are stale: ' + stale.join(', ') + '. Run npm run build:knowledge-site and commit the result.');
} else if (updated !== original) await writeFile(indexPath, updated);

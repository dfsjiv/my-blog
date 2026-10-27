import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../knowledge-feature-loader.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(html.match(/id="knowledgeFeatureManifest">([\s\S]*?)<\/script>/)[1]);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture({ fail, hang } = {}) {
  const window = {}, added = [], timers = new Map();
  let nextTimer = 0;
  const document = {
    getElementById: () => ({ textContent: JSON.stringify(manifest) }),
    createElement: tag => ({ tag, remove() { this.removed = true; } }),
    head: { appendChild(node) {
      added.push(node);
      Promise.resolve().then(() => {
        const path = node.src || node.href;
        if (hang?.(path)) return;
        if (fail?.(path)) return node.onerror?.();
        for (const group of Object.values(manifest)) {
          if (group.scripts.at(-1) === path) window[group.ready] = {};
        }
        node.onload?.();
      });
    } }
  };
  vm.runInNewContext(source, { window, document, setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) });
  return { window, added, timers, ensure: window.KnowledgeFeatures.ensure };
}
test('initial page does not request optional code or styles; manifest retains all features', () => {
  const { added } = fixture();
  assert.equal(added.length, 0);
  const eager = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  for (const group of Object.values(manifest)) for (const path of [...group.scripts, ...group.styles || []]) assert.ok(!eager.includes(path), path);
});
test('concurrent features deduplicate resources and execute dependencies in order', async () => {
  const f = fixture();
  await Promise.all([f.ensure('writer'), f.ensure('math'), f.ensure('writer')]);
  const paths = f.added.map(n => n.src || n.href);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.indexOf(manifest.math.scripts[0]) < paths.indexOf(manifest.math.scripts[1]));
  assert.ok(paths.indexOf(manifest.math.scripts[1]) < paths.indexOf(manifest.writer.scripts[0]));
  assert.ok(paths.indexOf(manifest.writer.scripts[0]) < paths.indexOf(manifest.writer.scripts[1]));
  assert.equal(f.timers.size, 0);
});
test('a failed script can retry without re-downloading initialized dependencies', async () => {
  let failed = false;
  const target = manifest.writer.scripts[1];
  const f = fixture({ fail: path => { if (path === target && !failed) { failed = true; return true; } return false; } });
  await assert.rejects(f.ensure('writer'), /failed to load/);
  await f.ensure('writer');
  assert.equal(f.added.filter(n => n.src === target).length, 2);
  assert.equal(f.added.filter(n => n.src === manifest.writer.scripts[0]).length, 1);
  assert.ok(f.added.find(n => n.src === target).removed);
});
test('timed-out styles are removed and recover on retry; unknown groups never fetch', async () => {
  let hanging = true;
  const f = fixture({ hang: () => hanging });
  const pending = f.ensure('math');
  const rejected = assert.rejects(pending, /timed out/);
  await flush();
  for (const fn of [...f.timers.values()]) fn();
  await rejected;
  assert.ok(f.added[0].removed);
  hanging = false;
  await f.ensure('math');
  const count = f.added.length;
  await assert.rejects(f.ensure('unknown'), /Unknown feature/);
  assert.equal(f.added.length, count);
});

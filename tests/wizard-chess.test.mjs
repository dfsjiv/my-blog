import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('supplied chess game scripts parse and gallery embeds it on demand in a sandbox', () => {
  const html = fs.readFileSync(new URL('../assets/games/wizard-chess/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter(m => m[1].trim());
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script[1]));
  const site = fs.readFileSync(new URL('../knowledge-site-v4.js', import.meta.url), 'utf8');
  assert.match(site, /type: 'wizard-chess'/);
  assert.match(site, /start\.addEventListener\('click'[\s\S]*?frame\.src = 'assets\/games\/wizard-chess\/index\.html'/);
  assert.match(site, /setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.match(site, /previousCleanup\?\.\(\); stop\(\)/);
});

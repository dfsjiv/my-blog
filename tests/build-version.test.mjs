import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

test('homepage cache version matches the content of the deployed bundle', () => {
  const bundle = fs.readFileSync(new URL('../assets/vendor/knowledge/site.bundle.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('assets/vendor/knowledge/site.bundle.js?v=' + hash));
});

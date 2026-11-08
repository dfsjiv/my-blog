import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../static/js/knowledge-quick-search.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Date, Set, Number, JSON });

test('recent searches are bounded, deduplicated, expire and never retain malformed entries', () => {
  const now = Date.now();
  const entries = [{ q: '  动态规划\u0000 ', at: now }, { q: '动态规划', at: now - 10 }, { q: 'EXPIRED', at: now - 31 * 86400000 }, { q: 'future', at: now + 500000 }, { q: '', at: now }, null, { q: 'bad', at: 'date' }];
  for (let i = 0; i < 12; i++) entries.push({ q: 'query-' + i, at: now });
  const normalized = window.KnowledgeQuickSearch.normalizeQueries(entries);
  assert.equal(normalized.length, 8); assert.equal(normalized[0].q, '动态规划');
  assert.ok(!normalized.some(item => ['EXPIRED', 'future', 'bad'].includes(item.q)));
  assert.equal(window.KnowledgeQuickSearch.normalizeQueries(null).length, 0);
});

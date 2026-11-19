import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildMetadata } from '../functions/lib/page-metadata.mjs';

const source = fs.readFileSync(new URL('../static/js/knowledge-announcements.js', import.meta.url), 'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../assets/knowledge/announcements.json', import.meta.url), 'utf8'));
function fixture() {
  const window = {}; let fetched = 0;
  vm.runInNewContext(source, { window, URL, location: { origin: 'https://lilinzheng.top' }, fetch: () => { fetched++; } });
  return { api: window.KnowledgeAnnouncements, fetched: () => fetched };
}
test('release records sort newest first without mutating input, and content is bilingual', () => {
  const { api, fetched } = fixture(); assert.equal(fetched(), 0, 'module evaluation must not fetch announcement data');
  const unsorted = { version: 1, items: [...data.items].reverse() };
  const before = JSON.stringify(unsorted); const sorted = api.records(unsorted);
  assert.equal(JSON.stringify(unsorted), before);
  assert.equal(sorted[0].id, '2026-11-20-page-studio');
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].date >= sorted[i].date);
  for (const item of sorted) for (const language of ['zh', 'en']) {
    assert.ok(item.title[language]); assert.ok(item.summary[language]);
    for (const field of ['changes', 'steps', 'notes']) assert.ok(item[field][language].every(value => typeof value === 'string' && value.length));
    for (const link of item.links) { assert.ok(link.label[language]); assert.ok(api.safeLink(link.url)); }
  }
});
test('bad release dates, duplicate IDs and invalid schemas are rejected before rendering', () => {
  const { api } = fixture(), first = data.items[0];
  for (const change of [{ date: '2026-02-30' }, { date: 'invalid' }, { id: '<script>' }, { type: 'future' }]) {
    assert.throws(() => api.records({ version: 1, items: [{ ...first, ...change }] }));
  }
  assert.throws(() => api.records({ version: 1, items: [first, first] }));
  assert.throws(() => api.records({ version: 3, items: [] }));
});
test('guide links reject active protocols and embedded credentials', () => {
  const { api } = fixture();
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/x', 'https://name:secret@example.com', '', null]) assert.equal(api.safeLink(url), null);
  assert.equal(api.safeLink('/?knowledge=page-designer').origin, 'https://lilinzheng.top');
});
test('announcement route has a public, distinct canonical title', () => {
  const meta = buildMetadata(new URL('https://lilinzheng.top/?knowledge=announcements'));
  assert.equal(meta.title, '公告 | 臻写代码');
  assert.equal(meta.url, 'https://lilinzheng.top/?knowledge=announcements');
  assert.equal(meta.robots, 'index,follow');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../knowledge-reading.js', import.meta.url), 'utf8');
function setup() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const window = { location: { origin: 'https://lilinzheng.top' }, localStorage: storage };
  vm.runInNewContext(source, { window, URL, TextEncoder, Date, Map, Set, Number, JSON });
  return { ...window.KnowledgeReading, values, storage };
}
const post = { slug: 'algorithm-notes', title: '算法笔记 <img onerror=alert(1)>', summary: 'A useful article', type: 'note', coverUrl: 'javascript:alert(1)' };

test('reading history, saved items and progress stay isolated per account and omit secrets/content', () => {
  const { createStore, storage, values } = setup();
  const guest = createStore(storage, 'guest'), user = createStore(storage, 'user-12');
  guest.visit({ ...post, contentMarkdown: 'PRIVATE BODY', password: 'SECRET', token: 'TOKEN' });
  guest.save(post, true); guest.progress(post.slug, 62, 'dynamic-programming'); guest.progress(post.slug, 20, 'earlier');
  assert.equal(guest.get(post.slug).progress, 62);
  assert.equal(guest.get(post.slug).heading, 'dynamic-programming');
  assert.equal(guest.get(post.slug).saved, true);
  assert.equal(guest.get(post.slug).coverUrl, '');
  assert.equal(user.list().length, 0);
  assert.doesNotMatch(values.get(guest.key), /PRIVATE BODY|SECRET|TOKEN/);
  guest.unread(post.slug); assert.equal(guest.get(post.slug).progress, 0);
  guest.clearHistory(); assert.equal(guest.list().length, 1); assert.equal(guest.get(post.slug).visitedAt, 0);
  guest.save(post, false); guest.clearHistory(); assert.equal(guest.list().length, 0);
});

test('reading backups roundtrip, merge without overwriting newer records and reject invalid/oversize input atomically', () => {
  const { createStore, storage } = setup();
  const original = createStore(storage, 'guest'); original.visit(post); original.save(post, true); original.progress(post.slug, 50, 'heading');
  const backup = original.export();
  const target = createStore(storage, 'user-1'); assert.equal(target.import(backup), 1);
  assert.equal(target.get(post.slug).title, post.title);
  assert.equal(target.get(post.slug).progress, 50);
  for (const value of ['not-json', '{"items":[]}', 'x'.repeat(513 * 1024)]) {
    assert.throws(() => target.import(value)); assert.equal(target.list().length, 1);
  }
  const mixed = JSON.parse(backup);
  mixed.items.push({ slug: 'bad?knowledge=writer', title: 'bad', saved: true });
  mixed.items.push({ slug: 'safe', title: 'Safe', coverUrl: 'https://user:password@example.com/image.png', progress: 1000, saved: true });
  target.import(JSON.stringify(mixed));
  assert.equal(target.get('bad?knowledge=writer'), null);
  assert.equal(target.get('safe').coverUrl, '');
  assert.equal(target.get('safe').progress, 100);
});

test('storage failure degrades to useful in-memory state, never reverts to an old persisted snapshot', () => {
  const { createStore } = setup();
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_, value) => { if (raw) throw Error('quota'); raw = value; } };
  const store = createStore(storage, 'guest'); store.visit(post); store.save(post, true);
  assert.equal(store.persistent, false);
  assert.equal(store.get(post.slug).saved, true);
  store.progress(post.slug, 85, 'section'); assert.equal(store.get(post.slug).progress, 85);
  assert.ok(JSON.parse(store.export()).items[0].saved);
});

test('bounded storage keeps saved entries ahead of old history and respects external removal', () => {
  const { createStore, storage, values } = setup();
  const store = createStore(storage, 'guest'); store.save(post, true);
  for (let i = 0; i < 250; i++) store.visit({ ...post, slug: 'post-' + i });
  assert.equal(store.list().length, 200); assert.equal(store.get(post.slug).saved, true);
  values.delete(store.key); assert.equal(store.list().length, 0);
});

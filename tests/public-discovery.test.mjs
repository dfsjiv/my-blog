import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleDiscovery, postUrl } from '../functions/lib/public-discovery.mjs';
import { addPageMetadata, buildMetadata, metadataTags } from '../functions/lib/page-metadata.mjs';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT); INSERT INTO users VALUES(1,'作者');
    CREATE TABLE articles(id INTEGER PRIMARY KEY, title TEXT, summary TEXT, content TEXT, category TEXT, author_id INTEGER, created_at TEXT, updated_at TEXT);`);
  for (const name of ['0002_add_knowledge_content.sql', '0003_add_knowledge_migration_map.sql']) db.exec(fs.readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  const insert = db.prepare(`INSERT INTO knowledge_posts(author_user_id,slug,type,title,summary,status,created_at,updated_at,published_at,deleted_at)
    VALUES(1,?,'article',?,?,?,'2026-10-20 00:00:00','2026-10-21 00:00:00','2026-10-20 00:00:00',?)`);
  for (let i = 0; i < 55; i++) insert.run('post-' + i, i ? '文章 ' + i : '<script>题目 & 标题</script>', '摘要 & 内容', 'published', null);
  for (const status of ['draft','archived','deleted']) insert.run(status, 'PRIVATE ' + status, 'secret', status, status === 'deleted' ? '2026-10-22' : null);
  insert.run('soft-deleted', 'PRIVATE soft-deleted', 'secret', 'published', '2026-10-22');
  db.exec(`INSERT INTO articles VALUES(88,'旧版文章','旧版摘要','## 正文','algorithm',1,'2025-01-01','2025-01-01')`);
  const queries = [];
  function statement(sql, bindings = []) {
    assert.match(sql, /^\s*SELECT/i, 'discovery must never mutate the database');
    queries.push(sql);
    return { bind: (...values) => statement(sql, values), first: () => db.prepare(sql).get(...bindings) || null,
      all: () => ({ results: db.prepare(sql).all(...bindings) }) };
  }
  return { env: { DB: { prepare: statement, batch: statements => statements.map(s => s.all()) } }, queries, db };
}
const request = (env, path, method = 'GET') => handleDiscovery({ env, request: new Request('https://lilinzheng.top' + path, { method }) });

test('sitemap is paginated, includes legacy posts and never exports drafts/archived/deleted content', async () => {
  const { env, db } = database();
  try {
    const index = await request(env, '/sitemap.xml');
    assert.equal(index.status, 200);
    assert.equal((await index.text()).match(/<sitemap>/g).length, 2);
    const pages = await Promise.all([1,2].map(async page => (await request(env, '/sitemap-posts.xml?page=' + page)).text()));
    const combined = pages.join('');
    assert.equal((combined.match(/<url>/g) || []).length, 57); // 56 public posts + home
    assert.match(combined, /legacy-article-88/);
    assert.doesNotMatch(combined, /draft|archived|soft-deleted|PRIVATE/);
    assert.match(combined, /&amp;slug=/);
    assert.match(combined, /2026-10-21T00:00:00.000Z/);
    assert.equal((await request(env, '/sitemap-posts.xml?page=3')).status, 404);
    assert.equal((await request(env, '/sitemap-posts.xml?page=99999')).status, 400);
    assert.equal((await request(env, '/sitemap-posts.xml?page=1 OR 1=1')).status, 400);
  } finally { db.close(); }
});
test('RSS summaries are escaped, bounded and have stable permalinks; HEAD and method controls work', async () => {
  const { env, db } = database();
  try {
    const response = await request(env, '/feed.xml');
    const body = await response.text();
    assert.match(response.headers.get('Content-Type'), /application\/rss\+xml/);
    assert.equal((body.match(/<item>/g) || []).length, 50);
    assert.match(body, /摘要 &amp; 内容/);
    assert.match(body, /<guid isPermaLink="true">/);
    assert.doesNotMatch(body, /<script>|PRIVATE|secret/);
    assert.equal((await request(env, '/rss.xml')).status, 200);
    assert.equal(await (await request(env, '/feed.xml', 'HEAD')).text(), '');
    assert.equal((await request(env, '/feed.xml', 'POST')).status, 405);
  } finally { db.close(); }
});
test('database outage returns uncached 503, not a misleading empty sitemap', async () => {
  const response = await request({}, '/sitemap.xml');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await response.text(), /SELECT|sqlite|TypeError/);
});
test('metadata canonical URLs ignore tracking/private parameters and reject unsafe cover URLs', () => {
  const url = new URL('https://attacker.test/?knowledge=post&slug=post-0&token=secret');
  const meta = buildMetadata(url, { title: '"><script>alert(1)</script>', summary: 'A & B', slug: 'post-0', coverUrl: 'javascript:alert(1)' });
  assert.equal(meta.url, postUrl('post-0'));
  assert.match(meta.image, /^https:\/\/lilinzheng.top\//);
  assert.doesNotMatch(metadataTags(meta), /<script>|token=secret|attacker\.test/);
  assert.equal(buildMetadata(new URL('https://lilinzheng.top/?knowledge=writer')).robots, 'noindex,follow');
  assert.equal(buildMetadata(url).robots, 'noindex,follow');
});
test('server-side sharing metadata uses only published posts and does not change visible markup', async () => {
  const { env, db } = database();
  const visible = '<main id="original">原始设计</main>';
  const original = '<html><head><title>旧标题</title><meta name="description" content="old" /><link rel="canonical" href="https://old/" /></head><body>' + visible + '</body></html>';
  const render = slug => addPageMetadata({ env, request: new Request('https://lilinzheng.top/?knowledge=post&slug=' + slug),
    next: async () => new Response(original, { headers: { 'Content-Type': 'text/html', ETag: 'old' } }) });
  try {
    const response = await render('post-0');
    const body = await response.text();
    assert.match(body, /<title>&lt;script&gt;题目 &amp; 标题&lt;\/script&gt; \| 阿臻的 Blog<\/title>/);
    assert.ok(body.includes(visible));
    assert.equal((body.match(/name="description"/g) || []).length, 1);
    assert.equal(response.headers.get('ETag'), null);
    const privateBody = await (await render('draft')).text();
    assert.doesNotMatch(privateBody, /PRIVATE|secret/);
    assert.match(privateBody, /noindex,follow/);
    const next = new Response('asset');
    assert.equal(await addPageMetadata({ request: new Request('https://lilinzheng.top/assets/test.js'), next: () => next }), next);
  } finally { db.close(); }
});

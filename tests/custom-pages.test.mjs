import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleCustomPageRequest, isCustomPagePath, validatePage, PAGE_LIMITS } from '../functions/lib/custom-pages.mjs';

const migration = fs.readFileSync(new URL('../migrations/0014_add_custom_pages.sql', import.meta.url), 'utf8');
class Statement {
    constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.db, this.sql, values); }
    first() { return this.db.prepare(this.sql).get(...this.values) || null; }
    all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
    run() { const row = this.db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(row.changes), last_row_id: Number(row.lastInsertRowid) } }; }
}
function fixture(migrated = true) {
    const db = new DatabaseSync(':memory:');
    db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,role TEXT);
        INSERT INTO users VALUES(1,'admin','admin'),(2,'reader','user'),(3,'other','user');
        CREATE TABLE existing_articles(id INTEGER PRIMARY KEY, content TEXT); INSERT INTO existing_articles VALUES(1,'keep');`);
    if (migrated) { db.exec(migration); db.exec(migration); }
    const env = { DB: { prepare: sql => new Statement(db, sql), batch: async statements => {
        db.exec('BEGIN'); try { const result = statements.map(statement => statement.run()); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
    } } };
    const call = async (path, { method = 'GET', body, user = null, raw } = {}) => {
        const request = new Request('https://example.test' + path, { method, body: raw ?? (body ? JSON.stringify(body) : undefined) });
        const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status });
        const response = await handleCustomPageRequest({ request, env, url: new URL(request.url), jsonResponse }, async () => user ? { user } : { response: jsonResponse({ success: false }, 401) });
        return { status: response.status, data: await response.json(), headers: response.headers };
    };
    return { db, env, call };
}
const admin = { id: 1, role: 'admin' }, author = { id: 2, role: 'user' }, other = { id: 3, role: 'user' };
const draft = (slug = 'study-room') => ({ title: '学习空间', slug, html: '<main><h1>{{title}}</h1>{{articles}}{{content}}</main>', css: 'h1{font-weight:400}', markdown: '# 草稿内容', postSlugs: ['binary-search'] });
const ROOT = '/api/knowledge/pages', ADMIN = '/api/knowledge/admin/pages';

test('custom-page migration is additive, idempotent and missing migration does not break default home', async () => {
    const { db, call } = fixture(false);
    assert.equal(isCustomPagePath(ROOT + '/home'), true); assert.equal(isCustomPagePath('/api/knowledge/posts'), false);
    assert.deepEqual((await call(ROOT + '/home')).data.data, { page: null });
    assert.deepEqual((await call(ROOT)).data.data, { items: [] });
    assert.equal((await call(ADMIN, { user: author })).status, 503);
    db.exec(migration); db.exec(migration);
    assert.equal(db.prepare('SELECT content FROM existing_articles').get().content, 'keep');
    db.close();
});

test('draft ownership and published snapshots prevent cross-user reads and draft leakage', async () => {
    const { db, call } = fixture();
    assert.equal((await call(ADMIN)).status, 401);
    let result = await call(ADMIN, { method: 'POST', user: author, body: draft() });
    assert.equal(result.status, 201); const id = result.data.data.page.id;
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
    assert.equal((await call(ADMIN + '/' + id, { user: other })).status, 404);
    assert.equal((await call(ADMIN + '/' + id, { method: 'PATCH', user: admin, body: { ...draft(), version: 1 } })).status, 404);
    assert.equal((await call(ROOT + '/study-room')).status, 404);
    assert.equal((await call(ROOT)).data.data.items.length, 0);
    result = await call(ADMIN + '/' + id + '/publish', { method: 'POST', user: author, body: { version: 1 } });
    assert.equal(result.status, 200);
    const published = (await call(ROOT + '/study-room')).data.data.page;
    assert.equal(published.markdown, '# 草稿内容'); assert.equal(published.author, 'reader');
    assert.equal(Object.hasOwn(published, 'draft'), false); assert.equal(Object.hasOwn(published, 'ownerUserId'), false);
    result = await call(ADMIN + '/' + id, { method: 'PATCH', user: author, body: { ...draft(), title: '新草稿', markdown: 'secret unpublished text', version: 2 } });
    assert.equal(result.status, 200);
    assert.equal((await call(ROOT + '/study-room')).data.data.page.title, '学习空间');
    assert.equal((await call(ROOT + '/study-room')).data.data.page.markdown, '# 草稿内容');
    assert.equal((await call(ROOT)).data.data.items[0].title, '学习空间');
    assert.equal((await call(ADMIN + '/' + id, { method: 'PATCH', user: author, body: { ...draft(), version: 2 } })).status, 409);
    assert.equal((await call(ADMIN + '/' + id + '/publish', { method: 'POST', user: author, body: { version: 2 } })).status, 409);
    assert.equal((await call(ADMIN + '/' + id, { method: 'PATCH', user: author, body: { ...draft('changed'), version: 3 } })).status, 400);
    db.close();
});

test('only administrators can opt into a homepage and unpublishing or trashing restores default', async () => {
    const { db, call } = fixture();
    const create = async (user, slug) => {
        const page = (await call(ADMIN, { method: 'POST', user, body: draft(slug) })).data.data.page;
        await call(ADMIN + '/' + page.id + '/publish', { method: 'POST', user, body: { version: 1 } }); return page.id;
    };
    const authorId = await create(author, 'reader-space');
    assert.equal((await call(ADMIN + '/' + authorId + '/homepage', { method: 'POST', user: author, body: { version: 2 } })).status, 403);
    const id = await create(admin, 'admin-space');
    assert.equal((await call(ROOT + '/home')).data.data.page, null);
    assert.equal((await call(ADMIN + '/' + id + '/homepage', { method: 'POST', user: admin, body: { version: 2 } })).status, 200);
    assert.equal((await call(ROOT + '/home')).data.data.page.slug, 'admin-space');
    const second = await create(admin, 'another-space');
    assert.equal((await call(ADMIN + '/' + second + '/homepage', { method: 'POST', user: admin, body: { version: 2 } })).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM custom_pages WHERE is_homepage=1').get().n, 1);
    await call(ADMIN + '/' + second + '/unpublish', { method: 'POST', user: admin, body: { version: 3 } });
    assert.equal((await call(ROOT + '/home')).data.data.page, null);
    await call(ADMIN + '/' + id + '/trash', { method: 'POST', user: admin, body: { version: 3 } });
    assert.equal((await call(ROOT + '/admin-space')).status, 404);
    assert.equal((await call(ADMIN + '/' + id, { method: 'PATCH', user: admin, body: { ...draft('admin-space'), version: 4 } })).status, 400);
    await call(ADMIN + '/' + id + '/restore', { method: 'POST', user: admin, body: { version: 4 } });
    const restored = (await call(ADMIN + '/' + id, { user: admin })).data.data.page;
    assert.equal(restored.deletedAt, null); assert.equal(restored.isPublished, false); assert.ok(restored.draft.html);
    db.close();
});

test('bounded storage validates UTF-8 bytes, slugs, duplicate paths, malformed input, and total page quota', async () => {
    assert.throws(() => validatePage({ ...draft(), markdown: '喵'.repeat(100000) }), /上限/);
    assert.doesNotThrow(() => validatePage({ ...draft(), markdown: '喵'.repeat(100000) }, PAGE_LIMITS.admin));
    for (const slug of ['home', '../test', 'a?x=1', 'UPPER', 'a'.repeat(65)]) assert.throws(() => validatePage(draft(slug)));
    assert.throws(() => validatePage({ ...draft(), postSlugs: Array(13).fill('x') }));
    assert.deepEqual(validatePage({ ...draft(), postSlugs: ['x', 'x'] }).postSlugs, ['x']);
    const { db, call } = fixture();
    assert.equal((await call(ADMIN, { method: 'POST', user: author, raw: 'bad JSON' })).status, 400);
    await call(ADMIN, { method: 'POST', user: author, body: draft() });
    assert.equal((await call(ADMIN, { method: 'POST', user: other, body: draft() })).status, 409);
    for (let i = 1; i < 8; i++) assert.equal((await call(ADMIN, { method: 'POST', user: author, body: draft('page-' + i) })).status, 201);
    assert.equal((await call(ADMIN, { method: 'POST', user: author, body: draft('page-too-many') })).status, 400);
    assert.equal((await call(ROOT + '/home', { method: 'POST', body: {} })).status, 405);
    assert.equal((await call(ADMIN + '/unknown', { user: author })).status, 404);
    db.close();
});

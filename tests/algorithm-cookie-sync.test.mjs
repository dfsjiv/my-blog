import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleAlgorithmRequest } from '../functions/lib/algorithm-center.mjs';
import { fetchExternalSnapshot, normalizeOneTimeCookie, normalizeExternalHandle } from '../functions/lib/algorithm/external-providers.mjs';

const migration = fs.readFileSync(new URL('../migrations/0011_add_algorithm_external_snapshots.sql', import.meta.url), 'utf8');
const json = body => new Response(JSON.stringify(body));
const lcPayload = (overrides = {}) => ({ data: {
  userStatus: { isSignedIn: true, userSlug: 'demo' },
  userProfilePublicProfile: { profile: { userSlug: 'demo' } },
  userProfileUserQuestionProgress: {
    numAcceptedQuestions: [{ difficulty: 'EASY', count: 20 }, { difficulty: 'MEDIUM', count: 12 }, { difficulty: 'HARD', count: 3 }],
    numFailedQuestions: [{ difficulty: 'EASY', count: 2 }, { difficulty: 'MEDIUM', count: 5 }, { difficulty: 'HARD', count: 2 }]
  }, ...overrides
} });
class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  run() { const r = this.db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
}
function fixture(applyMigration = true) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT); INSERT INTO users VALUES(1,'user'),(2,'admin');");
  sqlite.exec(fs.readFileSync(new URL('../migrations/0010_add_algorithm_center.sql', import.meta.url), 'utf8'));
  if (applyMigration) sqlite.exec(migration);
  const db = { prepare: sql => new Statement(sqlite, sql), batch: statements => statements.map(s => s.run()) };
  let now = Date.parse('2026-10-11T00:00:00Z');
  async function request(path, method = 'GET', body, userId = 1, fetchImpl = async () => json(lcPayload()), rawBody) {
    const req = new Request('https://example.com/api/algorithm/' + path, { method,
      headers: userId ? { Authorization: 'Bearer test' } : {}, body: rawBody ?? (body ? JSON.stringify(body) : undefined) });
    return handleAlgorithmRequest({ request: req, url: new URL(req.url), env: { DB: db }, now: () => now,
      getBearerToken: r => r.headers.get('Authorization'), getAuthenticatedUser: async () => ({ id: userId, role: userId === 2 ? 'admin' : userId === 3 ? 'guest' : 'user' }),
      jsonResponse: (body, status = 200) => new Response(JSON.stringify(body), { status }), fetch: fetchImpl });
  }
  return { sqlite, request, advance: () => { now += 31000; } };
}

test('additive migration is idempotent, contains no credential columns, leaves existing accounts untouched', () => {
  const f = fixture(); f.sqlite.exec(migration);
  const columns = f.sqlite.prepare('PRAGMA table_info(algorithm_external_accounts)').all().map(c => c.name);
  assert.ok(!columns.some(name => /cookie|token|secret|password/.test(name)));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM algorithm_accounts').get().n, 0);
  assert.ok(!/DROP TABLE|ALTER TABLE/i.test(migration));
});
test('strict handles and cookies cannot inject destinations or header lines', () => {
  assert.equal(normalizeExternalHandle('luogu', ' 42 '), '42');
  assert.equal(normalizeOneTimeCookie('a=one; b=two'), 'a=one; b=two');
  for (const value of ['a=b\r\nHost:evil', 'cookie:a=b', 'password', 'a=' + 'x'.repeat(8192), 'a=中文']) assert.throws(() => normalizeOneTimeCookie(value));
  for (const value of ['../1', 'https://evil.com', 'demo?a=b']) assert.throws(() => normalizeExternalHandle('vjudge', value));
  assert.throws(() => normalizeExternalHandle('luogu', 'name'));
});
test('one-time cookie is sent only to selected fixed HTTPS provider; output whitelists numeric statistics', async () => {
  let called = 0;
  const secret = 'LEETCODE_SESSION=not-a-real-secret; csrftoken=csrf-demo';
  const snapshot = await fetchExternalSnapshot('leetcode', 'demo', secret, async (url, init) => {
    called++; assert.equal(url, 'https://leetcode.cn/graphql/'); assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store'); assert.equal(init.headers.Cookie, secret); assert.equal(init.headers['X-CSRFToken'], 'csrf-demo');
    assert.ok(!init.body.includes(secret));
    return json({ ...lcPayload(), cookie: secret, email: 'not-to-be-saved' });
  });
  assert.equal(called, 1); assert.equal(snapshot.solved, 35); assert.equal(snapshot.attempted, 44);
  assert.equal(snapshot.submissions, null); assert.equal(snapshot.difficulty[2].solved, 3);
  assert.ok(!JSON.stringify(snapshot).includes(secret)); assert.ok(!JSON.stringify(snapshot).includes('email'));
});
test('redirect never follows or forwards cookies; cookie mismatch and expired session rejected', async () => {
  let called = 0;
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', 'a=b', async () => {
    called++; return new Response('', { status: 302, headers: { Location: 'https://evil.com/' } });
  }), /PROVIDER_REDIRECT/);
  assert.equal(called, 1);
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', 'a=b', async () => json(lcPayload({ userStatus: { isSignedIn: true, userSlug: 'other' } }))), /COOKIE_MISMATCH/);
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', 'a=b', async () => json(lcPayload({ userStatus: { isSignedIn: false } }))), /COOKIE_EXPIRED/);
});
test('VJudge deduplicates OJ problem IDs and keeps attempts distinct from submissions', async () => {
  const snapshot = await fetchExternalSnapshot('vjudge', 'demo', '', async url => url.includes('solveDetail')
    ? json({ acRecords: { CF: ['1A', '1A'], UVA: ['100'] }, failRecords: { CF: ['1A', '2B'] } })
    : new Response('<script id="profile-header-data" type="application/json">{"username":"demo","counts":{"acAll":2,"attAll":3}}</script>'));
  assert.equal(snapshot.solved, 2); assert.equal(snapshot.attempted, 3); assert.equal(snapshot.submissions, null);
  assert.equal(snapshot.origins.find(o => o.name === 'CF').attempted, 2);
  await assert.rejects(fetchExternalSnapshot('vjudge', 'demo', '', async url => url.includes('solveDetail')
    ? json({ acRecords: {}, failRecords: {} })
    : new Response('<script id="profile-header-data">{"username":"demo","counts":{"acAll":2,"attAll":3}}</script>')), /PROVIDER_FORMAT_CHANGED/);
});
test('Luogu uses current page context and Nowcoder uses explicitly labelled practice statistics', async () => {
  const s = await fetchExternalSnapshot('luogu', '2', '', async () => new Response('<script type="application/json" id="lentille-context">{"data":{"user":{"uid":2,"passedProblemCount":40,"submittedProblemCount":45,"privateInfo":"ignored"}}}</script>'));
  assert.equal(s.solved, 40); assert.equal(s.attempted, 45); assert.equal(s.submissions, null);
  await assert.rejects(fetchExternalSnapshot('luogu', '2', '', async () => new Response('<script id="lentille-context">{"data":{"user":{"uid":2,"passedProblemCount":null,"submittedProblemCount":null}}}</script>')), /PROVIDER_FORMAT_CHANGED/);
  const nc = await fetchExternalSnapshot('nowcoder', '123', '', async () => new Response('<div class="state-num">436</div><span>题已挑战</span><div class="state-num">398</div><span>题已通过</span><div class="state-num">1546</div><span>次提交</span>'));
  assert.equal(nc.solved, 398); assert.equal(nc.attempted, 436); assert.equal(nc.submissions, 1546);
});
test('reject changed difficulty schema, huge responses and upstream errors without exposing reflected credentials', async () => {
  const payload = lcPayload(); payload.data.userProfileUserQuestionProgress.numAcceptedQuestions.pop();
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', '', async () => json(payload)), /PROVIDER_FORMAT_CHANGED/);
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', 'a=secret', async () => { throw new Error('a=secret'); }), /^Error: PROVIDER_UNAVAILABLE$/);
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', '', async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))), /PROVIDER_FORMAT_CHANGED/);
});
test('authenticated members can sync; guests and cross-user admins cannot read, sync or unlink records', async () => {
  const f = fixture(); const body = { platform: 'leetcode', handle: 'demo', cookie: 'a=secret' };
  assert.equal((await f.request('external/sync', 'POST', body, 0)).status, 401);
  assert.equal((await f.request('external/sync', 'POST', body, 3)).status, 401);
  assert.equal((await f.request('external/sync', 'POST', body)).status, 200);
  assert.equal((await f.request('external/accounts/1', 'DELETE', null, 2)).status, 409);
  const dash = await f.request('external/dashboard', 'GET', null, 2);
  assert.equal(dash.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await dash.json()).data.accounts.length, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM algorithm_external_accounts WHERE user_id=1').get().n, 1);
});
test('sync only persists whitelisted stats; failures preserve last snapshot, release lock and never log cookies', async () => {
  const f = fixture(), secret = 'a=COOKIE_SHOULD_NOT_BE_SAVED';
  const body = { platform: 'leetcode', handle: 'demo', cookie: secret };
  assert.equal((await f.request('external/sync', 'POST', body)).status, 200);
  const saved = f.sqlite.prepare('SELECT * FROM algorithm_external_accounts').get();
  assert.ok(!JSON.stringify(saved).includes(secret));
  assert.equal((await f.request('external/sync', 'POST', body)).status, 429);
  f.advance(); const logs = [], old = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const failed = await f.request('external/sync', 'POST', body, 1, async () => { throw new Error(secret); });
    assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes(secret));
  } finally { console.error = old; }
  assert.equal(logs.length, 0);
  const current = f.sqlite.prepare('SELECT * FROM algorithm_external_accounts').get();
  assert.equal(current.snapshot_json, saved.snapshot_json); assert.equal(current.last_synced_at, saved.last_synced_at); assert.equal(current.sync_lock_until, 0);
  assert.ok(!(await (await f.request('external/dashboard')).text()).includes(secret));
  assert.equal((await f.request('external/accounts/1', 'DELETE')).status, 200);
});
test('cooldown/atomic lock stop concurrent syncs; switching handles requires explicit unlink; request size enforced without Content-Length', async () => {
  const f = fixture(), body = { platform: 'leetcode', handle: 'demo' };
  await f.request('external/sync', 'POST', body);
  assert.equal((await f.request('external/sync', 'POST', { ...body, handle: 'other' })).status, 409);
  f.advance(); f.sqlite.exec('UPDATE algorithm_external_accounts SET sync_lock_until=9999999999');
  let calls = 0;
  assert.equal((await f.request('external/sync', 'POST', body, 1, async () => { calls++; return json(lcPayload()); })).status, 409);
  assert.equal(calls, 0); assert.equal((await f.request('external/accounts/1', 'DELETE')).status, 409);
  assert.equal((await f.request('external/sync', 'POST', null, 1, undefined, 'x'.repeat(13000))).status, 400);
  assert.equal((await f.request('external/sync', 'POST', null, 1, undefined, 'null')).status, 400);
});
test('missing new migration does not break original algorithm dashboard', async () => {
  const f = fixture(false);
  assert.equal((await f.request('external/dashboard')).status, 503);
  assert.equal((await f.request('dashboard')).status, 200);
});
test('frontend never uses browser storage for cookies and integrates cleanup into route/auth teardown', () => {
  const source = fs.readFileSync(new URL('../algorithm-cookie-sync.js', import.meta.url), 'utf8');
  assert.ok(!/localStorage|sessionStorage|document\.cookie|console\./.test(source));
  assert.match(source, /cookie\.type = 'password'/); assert.match(source, /cookie\.autocomplete = 'off'/);
  assert.match(source, /event\.preventDefault\(\);[\s\S]*?clear\(\);/);
  assert.match(source, /finally \{ clear\(\)/); assert.match(source, /function cleanup\(\) \{ clear\(\); controller\.abort\(\)/);
  const integration = fs.readFileSync(new URL('../algorithm-center.js', import.meta.url), 'utf8');
  assert.match(integration, /identityChanged = true;\s*extraCleanup\(\)/);
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(index.indexOf('algorithm-cookie-sync.js') < index.indexOf('algorithm-center.js'));
});

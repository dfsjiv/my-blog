import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { Script } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { handleAlgorithmRequest } from '../functions/lib/algorithm-center.mjs';
import { fetchExternalSnapshot, normalizeOneTimeCookie, normalizeExternalHandle, buildPlatformCookie, resolveExternalIdentity } from '../functions/lib/algorithm/external-providers.mjs';
import { aggregatePlatforms } from '../functions/lib/algorithm/aggregate.mjs';

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
  const nc = await fetchExternalSnapshot('nowcoder', '123', '', async url => url.includes('/tracker/')
    ? json({ code: 0, data: { ranks: [{ uid: 123, count: 166 }] } })
    : new Response('<div class="state-num">436</div><span>题已挑战</span><div class="state-num">398</div><span>题已通过</span><div class="state-num">1546</div><span>次提交</span>'));
  assert.equal(nc.solved, 564); assert.equal(nc.attempted, null); assert.equal(nc.submissions, null);
  assert.equal(nc.sources[0].submissions, 1546); assert.equal(nc.sources[1].solved, 166);
  assert.equal(nc.deduplication, 'not-available');
});
test('Luogu uses the selected cookie origin only, rejects arbitrary domains, and reports blocked access precisely', async () => {
  const html = '<script id="lentille-context">{"user":{"uid":42},"data":{"user":{"uid":42,"passedProblemCount":12,"submittedProblemCount":15}}}</script>';
  for (const domain of ['www.luogu.com.cn', 'www.luogu.com']) {
    let calls = 0;
    const snapshot = await fetchExternalSnapshot('luogu', '42', '_uid=42; __client_id=synthetic', async (url, init) => {
      calls++; assert.equal(url, 'https://' + domain + '/user/42'); assert.equal(init.redirect, 'manual');
      assert.equal(init.headers['User-Agent'], 'KnowledgeAlgorithmCenter/1.0');
      return new Response(html);
    }, { luoguDomain: domain });
    assert.equal(calls, 1); assert.equal(snapshot.solved, 12);
  }
  await assert.rejects(fetchExternalSnapshot('luogu', '42', '', async () => { throw new Error('must not fetch'); }, { luoguDomain: 'evil.com' }), /INVALID_REQUEST/);
  await assert.rejects(fetchExternalSnapshot('luogu', '42', '', async () => new Response('', { status: 403 })), /PROVIDER_ACCESS_BLOCKED/);
  const f = fixture();
  const blocked = await f.request('external/sync', 'POST', { platform:'luogu', handle:'42' }, 1, async () => new Response('', { status:403 }));
  assert.equal((await blocked.json()).code, 'PROVIDER_ACCESS_BLOCKED');
});
test('Tracker missing rank is not silently zero, wrong-user rows are rejected, real zero is accepted', async () => {
  const html = '<div class="state-num">3</div><span>题已挑战</span><div class="state-num">2</div><span>题已通过</span><div class="state-num">5</div><span>次提交</span>';
  const snapshot = await fetchExternalSnapshot('nowcoder', '123', '', async url => {
    if (url.includes('ranks/problem')) return json({ code:0, data:{ ranks:[] } });
    if (url.includes('user-info')) return json({ code:0, data:{user:{uid:123,count:0}} });
    return new Response(html);
  });
  assert.equal(snapshot.solved, 2); assert.equal(snapshot.sources[1].solved, 0);
  await assert.rejects(fetchExternalSnapshot('nowcoder', '123', '', async () => json({ code:0,data:{ranks:[],user:{uid:999,count:25}} })), /PROVIDER_FORMAT_CHANGED/);
});
test('reject changed difficulty schema, huge responses and upstream errors without exposing reflected credentials', async () => {
  const payload = lcPayload(); payload.data.userProfileUserQuestionProgress.numAcceptedQuestions.pop();
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', '', async () => json(payload)), /PROVIDER_FORMAT_CHANGED/);
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', 'a=secret', async () => { throw new Error('a=secret'); }), /^Error: PROVIDER_UNAVAILABLE$/);
  await assert.rejects(fetchExternalSnapshot('leetcode', 'demo', '', async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))), /PROVIDER_FORMAT_CHANGED/);
});
test('authenticated members can sync; guests and cross-user admins cannot read, sync or unlink records', async () => {
  const f = fixture(); const body = { platform: 'leetcode', credentials: { LEETCODE_SESSION: 'synthetic-session', csrftoken: 'synthetic-csrf' } };
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
  const f = fixture(), secret = 'LEETCODE_SESSION=COOKIE_SHOULD_NOT_BE_SAVED; csrftoken=synthetic-csrf';
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
  assert.doesNotThrow(() => new Script(source));
  assert.ok(!/localStorage|sessionStorage|document\.cookie|console\./.test(source));
  assert.match(source, /input\.type = 'password'/); assert.match(source, /input\.autocomplete = 'off'/);
  assert.match(source, /event\.preventDefault\(\);[\s\S]*?clear\(\);/);
  assert.match(source, /finally \{ clear\(\)/); assert.match(source, /function cleanup\(\) \{ clear\(\); controller\.abort\(\)/);
  const integration = fs.readFileSync(new URL('../algorithm-center.js', import.meta.url), 'utf8');
  assert.match(integration, /identityChanged = true;\s*extraCleanup\(\)/);
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(index.indexOf('algorithm-cookie-sync.js') < index.indexOf('algorithm-center.js'));
});

test('explicit platform credential whitelist rejects missing values and ignores unrelated cookies', () => {
  assert.equal(buildPlatformCookie('nowcoder', { t: 'session', NOWCODERUID: 'device', analytics: 'ignored' }), 't=session');
  assert.equal(buildPlatformCookie('luogu', { _uid: '42', __client_id: 'session' }), '_uid=42; __client_id=session');
  assert.throws(() => buildPlatformCookie('leetcode', { LEETCODE_SESSION: 'session' }), /INVALID_COOKIE/);
  assert.throws(() => buildPlatformCookie('nowcoder', { t: 'x;host=evil' }), /INVALID_COOKIE/);
});
test('all four sessions identify their own account without an extra handle; device ID and profile links are never used', async () => {
  assert.equal(await resolveExternalIdentity('luogu', '_uid=42; __client_id=synthetic'), '42');
  assert.equal(await resolveExternalIdentity('leetcode', 'LEETCODE_SESSION=synthetic; csrftoken=csrf', async () => json(lcPayload())), 'demo');
  assert.equal(await resolveExternalIdentity('nowcoder', 't=synthetic', async () => new Response('window.globalInfo = { ownerId: "123" };')), '123');
  await assert.rejects(resolveExternalIdentity('nowcoder', 't=synthetic; NOWCODERUID=999', async () => new Response('window.globalInfo={}; <a href="/profile/999">other</a>')), /COOKIE_EXPIRED/);
  assert.equal(await resolveExternalIdentity('vjudge', 'JSESSIONID=synthetic', async (url, init) => {
    assert.equal(url, 'https://vjudge.net/user/changeUsernameInfo'); assert.equal(init.method, 'GET'); return json({ currentUsername: 'demo' });
  }), 'demo');
});
test('automatic identity ignores submitted handle, preserves ownership and never persists credential values', async () => {
  const f = fixture(), credentials = { LEETCODE_SESSION: 'DO_NOT_STORE', csrftoken: 'csrf', analytics: 'DROP_ME' };
  assert.equal((await f.request('external/sync', 'POST', { platform: 'leetcode', handle: 'wrong', credentials })).status, 200);
  const row = f.sqlite.prepare('SELECT * FROM algorithm_external_accounts').get();
  assert.equal(row.handle, 'demo'); assert.ok(!JSON.stringify(row).includes('DO_NOT_STORE'));
  f.advance();
  const changed = lcPayload({ userStatus: { isSignedIn: true, userSlug: 'other' } });
  assert.equal((await f.request('external/sync', 'POST', { platform: 'leetcode', credentials }, 1, async () => json(changed))).status, 409);
  const dashboard = (await (await f.request('dashboard')).json()).data;
  assert.equal(dashboard.aggregate.solved, 35); assert.equal(dashboard.aggregate.platforms.length, 1);
});
test('aggregation weights completion by problems, retains coverage and excludes unsynced accounts', () => {
  const result = aggregatePlatforms({ platforms: [{ platform: 'codeforces', lastSyncedAt: 'now', solved: 90, attempted: 100, submissions: 200 }] },
    [{ platform: 'leetcode', last_synced_at: 'now', snapshot_json: JSON.stringify({ solved: 1, attempted: 10, submissions: null }) },
     { platform: 'luogu', last_synced_at: null, snapshot_json: '{}' }]);
  assert.equal(result.solved, 91); assert.equal(result.completionRate, 82.7); assert.equal(result.unresolved, 19);
  assert.equal(result.submissions, 200); assert.equal(result.submissionSources, 1); assert.equal(result.recordSources, 1);
});
test('five active sources feed a single total; disabled VJudge is excluded without deleting cached data', () => {
  const analysis = { platforms: ['codeforces', 'atcoder'].map(platform => ({ platform, solved: 10, attempted: 15, submissions: 30, lastSyncedAt: 'now' })) };
  const rows = ['luogu', 'nowcoder', 'leetcode', 'vjudge'].map(platform => ({ platform, last_synced_at: 'now', snapshot_json: JSON.stringify({ solved: 20, attempted: 25, submissions: platform === 'nowcoder' ? 100 : null }) }));
  const total = aggregatePlatforms(analysis, rows);
  assert.equal(total.platforms.length, 5); assert.equal(total.solved, 80); assert.equal(total.attempted, 105);
  assert.equal(total.submissions, 160); assert.equal(total.submissionSources, 3); assert.equal(total.completionRate, 76.2);
  const noAttempts = aggregatePlatforms({ platforms: [] }, [{ platform: 'demo', last_synced_at: 'now', snapshot_json: '{"solved":12,"attempted":null,"submissions":null}' }]);
  assert.equal(noAttempts.completionRate, null); assert.equal(noAttempts.attemptedSources, 0);
});
test('VJudge binding is disabled and old rows are preserved but not exposed or aggregated', async()=>{
  const f=fixture();f.sqlite.exec("INSERT INTO algorithm_external_accounts(user_id,platform,handle,snapshot_json,last_synced_at) VALUES(1,'vjudge','demo','{\"solved\":100,\"attempted\":100}','2026-10-10');");
  assert.equal((await f.request('external/sync','POST',{platform:'vjudge',handle:'demo'})).status,400);
  assert.equal((await (await f.request('external/dashboard')).json()).data.accounts.length,0);
  assert.equal((await (await f.request('dashboard')).json()).data.aggregate.solved,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM algorithm_external_accounts WHERE platform='vjudge'").get().n,1);
});

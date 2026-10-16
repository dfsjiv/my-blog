import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { handleProfileRequest, validateNickname } from '../functions/lib/user-profile.mjs';

test('nicknames preserve Unicode, emoji, punctuation and HTML as text, rejecting controls and oversized names', () => {
  for (const name of ['阿臻 ✨', '👩‍💻', '日本語・한글', '<b>昵称</b>', 'a_!@#$%^&*()']) assert.equal(validateNickname(name), name);
  assert.equal(validateNickname('   '), '');
  assert.throws(() => validateNickname('a\nadmin'));
  assert.throws(() => validateNickname('a\u202eadmin'));
  assert.throws(() => validateNickname('🚀'.repeat(41)));
  assert.equal(validateNickname('🚀'.repeat(40)), '🚀'.repeat(40));
});

test('profile saves only own nickname and public batches expose no account secrets', async () => {
  const saved = new Map();
  const run = async (path, method = 'GET', body, token = 'user') => {
    const request = new Request('https://site.test' + path, { method, body: body && JSON.stringify(body), headers: token ? { Authorization: token } : {} });
    return handleProfileRequest({ request, url: new URL(request.url), env: { KNOWLEDGE_IMAGES: {
      put: async (key, value) => saved.set(key, value),
      get: async key => saved.has(key) ? { text: async () => saved.get(key) } : null
    } }, jsonResponse: (data, status = 200) => Response.json(data, { status }),
      getBearerToken: r => r.headers.get('Authorization'),
      getAuthenticatedUser: async t => t === 'user' ? { id: 7, role: 'user' } : t === 'admin' ? { id: 1, role: 'admin' } : null });
  };
  assert.equal((await run('/api/profile', 'PATCH', { nickname: '阿臻 🚀', id: 1 })).status, 200);
  assert.ok(saved.has('profiles/7')); assert.equal(saved.has('profiles/1'), false);
  assert.equal((await run('/api/profile', 'PATCH', { nickname: '管理员' }, 'admin')).status, 200);
  const response = await run('/api/profile/public?ids=7,1', 'GET', undefined, null);
  assert.deepEqual((await response.json()).data.profiles, [{ id: 7, nickname: '阿臻 🚀' }, { id: 1, nickname: '管理员' }]);
  assert.equal((await run('/api/profile', 'PATCH', { nickname: 'test' }, null)).status, 401);
  assert.equal((await run('/api/profile', 'PATCH', { nickname: 'x'.repeat(5000) })).status, 413);
  assert.equal((await run('/api/profile/public?ids=../1')).status, 400);
  await run('/api/profile', 'PATCH', { nickname: '' });
  assert.equal(JSON.parse(saved.get('profiles/7')).nickname, '');
});

test('rectangular cover crop stays bounded and preserves avatar crop geometry', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-user-profile.js', import.meta.url), 'utf8'), { window });
  for (const [w, h] of [[1000, 500], [500, 1000], [400, 400], [10, 5000]]) {
    for (const zoom of [1, 1.5, 3]) for (const x of [-10000, 0, 10000]) for (const y of [-10000, 0, 10000]) {
      const r = window.KnowledgeUserProfile.cropRegion(w, h, 480, 320, zoom, x, y);
      assert.ok(r.sx >= -1e-8 && r.sy >= -1e-8);
      assert.ok(r.sx + r.sw <= w + 1e-8 && r.sy + r.sh <= h + 1e-8);
      assert.ok(Math.abs(r.sw / r.sh - 1.5) < 1e-8);
      const square = window.KnowledgeUserProfile.cropRegion(w, h, 320, 320, zoom, x, y);
      const old = window.KnowledgeUserProfile.cropRect(w, h, 320, zoom, x, y);
      assert.ok(Math.abs(square.sx - old.sx) < 1e-8 && Math.abs(square.sy - old.sy) < 1e-8);
      assert.ok(Math.abs(square.sw - old.side) < 1e-8);
    }
  }
});

test('square crop stays inside portrait/landscape images at every zoom and drag extreme', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-user-profile.js', import.meta.url), 'utf8'), { window });
  for (const [w, h] of [[1000, 500], [500, 1000], [400, 400]]) for (const zoom of [1, 1.5, 3]) {
    for (const x of [-10000, 0, 10000]) for (const y of [-10000, 0, 10000]) {
      const r = window.KnowledgeUserProfile.cropRect(w, h, 320, zoom, x, y);
      assert.ok(r.sx >= -.001 && r.sy >= -.001);
      assert.ok(r.sx + r.side <= w + .001 && r.sy + r.side <= h + .001);
    }
  }
  assert.equal(window.KnowledgeUserProfile.cropRect(1000, 500, 320, 1, 0, 0).side, 500);
});

test('profile lookups batch authors, reuse in-flight results and cache them', async () => {
  const window = {}, calls = [];
  let resolveFetch;
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-user-profile.js', import.meta.url), 'utf8'), {
    window, queueMicrotask, AbortController, setTimeout, clearTimeout,
    fetch: url => { calls.push(url); return new Promise(resolve => { resolveFetch = resolve; }); }
  });
  const p = window.KnowledgeUserProfile;
  const first = p.get(1), second = p.get(2);
  await Promise.resolve();
  const again = p.get(1);
  assert.equal(again, first);
  resolveFetch({ ok: true, json: async () => ({ success: true, data: { profiles: [{ id: 1, nickname: '用户 🚀' }, { id: 2, nickname: '<b>纯文本</b>' }] } }) });
  assert.equal((await first).nickname, '用户 🚀');
  assert.equal((await second).nickname, '<b>纯文本</b>');
  assert.equal((await p.get(1)).nickname, '用户 🚀');
  assert.equal(calls.length, 1); assert.match(calls[0], /ids=1,2/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { handleBackgroundDisplay, validateDisplay } from '../functions/lib/background-display.mjs';
test('display positions are finite and bounded and preview uses exactly the hero transform', () => {
  const display = { x: 10, y: 80, zoom: 1.5 };
  assert.deepEqual(validateDisplay(display), display);
  for (const bad of [{ ...display, x: -1 }, { ...display, y: NaN }, { ...display, zoom: 4 }, { ...display, x: '10' }]) assert.throws(() => validateDisplay(bad));
  const window = {}; vm.runInNewContext(fs.readFileSync(new URL('../knowledge-background-display.js', import.meta.url), 'utf8'), { window });
  const preview = { style: {} }, hero = { style: {} };
  window.KnowledgeBackgroundDisplay.apply(preview, display, true);
  window.KnowledgeBackgroundDisplay.apply(hero, display);
  assert.equal(preview.style.objectPosition, hero.style.backgroundPosition);
  assert.equal(preview.style.transform, hero.style.transform);
  assert.equal(hero.style.transformOrigin, '10% 80%');
});
test('admins persist default and custom display settings; public read is safe and additive', async () => {
  const objects = new Map();
  const run = async (method, query, body, role = 'admin') => {
    const request = new Request('https://blog.test/api/background-display' + query, { method,
      body: body ? JSON.stringify(body) : undefined, headers: role ? { Authorization: role } : {} });
    return handleBackgroundDisplay({ request, url: new URL(request.url), env: {
      DB: { prepare: () => ({ bind: id => ({ first: async () => id === 7 ? { id } : null }) }) },
      KNOWLEDGE_IMAGES: { get: async key => objects.has(key) ? { text: async () => objects.get(key) } : null,
        put: async (key, data) => objects.set(key, data) } },
      jsonResponse: (data, status = 200) => Response.json(data, { status }),
      getBearerToken: r => r.headers.get('Authorization'), getAuthenticatedUser: async role => ({ id: 1, role }) });
  };
  const display = { x: 20, y: 70, zoom: 2 };
  assert.equal((await run('PATCH', '', { key: 'builtin-1', display })).status, 200);
  assert.equal((await run('PATCH', '', { key: '7', display })).status, 200);
  assert.equal((await run('PATCH', '', { key: '99', display })).status, 404);
  assert.equal((await run('PATCH', '', { key: '../7', display })).status, 400);
  assert.equal((await run('PATCH', '', { key: '7', display }, 'user')).status, 403);
  assert.equal((await run('PATCH', '', { key: '7', display }, null)).status, 401);
  const result = await run('GET', '?ids=builtin-1,7,builtin-4', null, null);
  assert.deepEqual((await result.json()).data.settings, [{ key: 'builtin-1', display }, { key: '7', display }, { key: 'builtin-4', display: null }]);
  assert.equal((await run('GET', '?ids=../../x', null, null)).status, 400);
});

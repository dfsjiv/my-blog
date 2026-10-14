import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAvatarRequest } from '../functions/lib/profile-avatar.mjs';

function setup() {
  const objects = new Map();
  const bucket = {
    async put(key, bytes, options) { objects.set(key, { bytes, type: options.httpMetadata.contentType, etag: '"etag"' }); },
    async delete(key) { objects.delete(key); },
    async get(key) { const o = objects.get(key); return o && { body: o.bytes, httpEtag: o.etag,
      writeHttpMetadata(headers) { headers.set('Content-Type', o.type); } }; }
  };
  const run = async (path, method = 'GET', body, token = 'user', headers = {}) => {
    const request = new Request('https://blog.test' + path, { method, body,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers } });
    return handleAvatarRequest({ request, url: new URL(request.url), env: { KNOWLEDGE_IMAGES: bucket },
      jsonResponse: (data, status = 200) => Response.json(data, { status }),
      getBearerToken: r => r.headers.get('Authorization')?.slice(7),
      getAuthenticatedUser: async t => t === 'user' ? { id: 7, role: 'user' } : t === 'admin' ? { id: 1, role: 'admin' } : null });
  };
  return { objects, run };
}
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
test('avatar upload persists per user, validates signature and public cache revalidates', async () => {
  const s = setup();
  const response = await s.run('/api/profile/avatar', 'POST', png);
  assert.equal(response.status, 200);
  assert.match((await response.json()).data.url, /^\/api\/profile\/avatar\/7\?v=/);
  const publicImage = await s.run('/api/profile/avatar/7', 'GET', undefined, null);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get('Content-Type'), 'image/png');
  assert.match(publicImage.headers.get('Cache-Control'), /must-revalidate/);
  assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()), png);
  assert.equal((await s.run('/api/profile/avatar/7', 'GET', undefined, null, { 'If-None-Match': '"etag"' })).status, 304);
  await s.run('/api/profile/avatar', 'POST', png, 'admin');
  assert.equal(s.objects.size, 2);
  await s.run('/api/profile/avatar', 'POST', png);
  assert.equal(s.objects.size, 2);
  assert.equal((await s.run('/api/profile/avatar', 'DELETE')).status, 200);
  assert.equal((await s.run('/api/profile/avatar/7')).status, 404);
  assert.ok(s.objects.has('avatars/1'));
});
test('guests, cross-user writes, SVG, oversized bodies and missing storage are rejected', async () => {
  const s = setup();
  assert.equal((await s.run('/api/profile/avatar', 'POST', png, null)).status, 401);
  assert.equal((await s.run('/api/profile/avatar/1', 'POST', png)).status, 404);
  assert.equal((await s.run('/api/profile/avatar', 'POST', '<svg></svg>')).status, 400);
  assert.equal((await s.run('/api/profile/avatar', 'POST', new Uint8Array(2 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await s.run('/api/profile/avatar/../1')).status, 404);
  const request = new Request('https://blog.test/api/profile/avatar/7');
  assert.equal((await handleAvatarRequest({ request, url: new URL(request.url), env: {},
    jsonResponse: (data, status) => Response.json(data, { status }) })).status, 503);
});

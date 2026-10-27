import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../auth.js', import.meta.url), 'utf8');
for (const stage of ['headers', 'body']) test('authentication times out during ' + stage + ' with actionable errors and no automatic retry', async () => {
  const timers = new Map(); let sequence = 0, requests = 0;
  const document = { readyState: 'loading', addEventListener() {} };
  const window = { document, setTimeout: fn => { timers.set(++sequence, fn); return sequence; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(source, { window, document, AbortController });
  const manager = window.BlogAuth.createAuthManager({ storage: null, fetch: async (_, options) => {
    requests++;
    const stalled = () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    if (stage === 'headers') return stalled();
    return { ok: true, status: 200, json: stalled };
  } });
  const pending = manager.login('test-user', 'not-a-real-password');
  const rejected = assert.rejects(pending, error => error.code === 'timeout');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(timers.size, 1);
  [...timers.values()][0](); await rejected;
  assert.equal(timers.size, 0);
  assert.equal(requests, 1);
  assert.match(window.BlogAuth.formatAuthError({ code: 'timeout' }, 'register'), /timed out/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../knowledge-repository.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture({ failFetch, invalidJson, success } = {}) {
  const timers = new Map(); let sequence = 0, signal;
  const window = { location: { origin: 'https://test.local' }, setTimeout: (fn, ms) => { timers.set(++sequence, { fn, ms }); return sequence; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(source, { window, URL, URLSearchParams, AbortController, DOMException, FormData, Blob,
    fetch: async (_, options) => {
      signal = options.signal;
      if (failFetch) throw new TypeError('offline');
      return { ok: true, status: 200, json: () => {
        if (invalidJson) return Promise.reject(new SyntaxError('bad JSON'));
        if (success) return Promise.resolve({ success: true, data: { items: [], pagination: {}, image: { url: '/image.png' }, background: { id: 1 } } });
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      } };
    }
  });
  return { repository: window.KnowledgeRepository, timers };
}
const calls = {
  read: repository => repository.getPosts({}),
  image: repository => repository.uploadImage(new Blob(['test'], { type: 'image/png' }), {}),
  background: repository => repository.uploadBackground(new Blob(['test'], { type: 'image/png' }), {}, {})
};
for (const [name, call] of Object.entries(calls)) {
  test(name + ' timeout covers response body, not only response headers', async () => {
    const f = fixture(); const result = call(f.repository);
    const failed = assert.rejects(result, error => error.name === 'TimeoutError');
    await flush();
    assert.equal(f.timers.size, 1);
    const timer = [...f.timers.values()][0];
    assert.equal(timer.ms, name === 'read' ? 12000 : 60000);
    timer.fn(); await failed;
    assert.equal(f.timers.size, 0);
  });
  test(name + ' cleans up timers on success, malformed JSON and network failure', async () => {
    for (const options of [{ success: true }, { invalidJson: true }, { failFetch: true }]) {
      const f = fixture(options);
      if (options.success) await call(f.repository);
      else await assert.rejects(call(f.repository), error => error.code === (options.invalidJson ? 'INVALID_RESPONSE' : 'NETWORK_ERROR'));
      assert.equal(f.timers.size, 0);
    }
  });
}

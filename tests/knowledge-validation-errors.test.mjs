import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('repository preserves backend field errors and displays actionable messages', async () => {
  const window = { setTimeout, clearTimeout, location: { origin: 'https://example.com' } };
  const fields = { category: '发布前必须填写分类', 'solutionMeta.problemUrl': '必须为 HTTP/HTTPS 链接' };
  vm.runInNewContext(fs.readFileSync(new URL('../knowledge-repository.js', import.meta.url), 'utf8'), {
    window, URL, URLSearchParams, AbortController, DOMException,
    fetch: async () => ({ ok: false, status: 400, json: async () => ({ success: false,
      error: { code: 'VALIDATION_ERROR', message: '请求数据不合法', fields } }) })
  });
  await assert.rejects(window.KnowledgeRepository.createPost({}, { token: 'test' }), error => {
    assert.match(error.message, /发布前必须填写分类/);
    assert.match(error.message, /HTTP\/HTTPS/);
    assert.equal(error.fields, fields);
    return true;
  });
});

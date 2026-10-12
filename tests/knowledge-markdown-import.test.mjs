import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { TextDecoder, window: { KnowledgeEditorVendor: { Editor() {} } } };
vm.runInNewContext(fs.readFileSync(new URL('../knowledge-editor-adapter.js', import.meta.url), 'utf8'), context);
const read = context.window.KnowledgeEditorAdapter.readMarkdownFile;
const file = (name, text) => {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
};

test('Markdown import preserves source, Unicode, code, HTML and derives title without executing content', async () => {
  const source = '# 树状数组\r\n\r\n```cpp\r\n#include <iostream>\r\n```\r\n<script>alert(1)</script>\r\n![图](./image.png)';
  const result = await read(file('notes.MD', '\uFEFF' + source), 2048);
  assert.equal(result.markdown, source);
  assert.equal(result.title, '树状数组');
  assert.equal((await read(file('我的文章.markdown', '正文'), 2048)).title, '我的文章');
});

test('Markdown import rejects unsupported, oversized, empty, binary and non-UTF8 files', async () => {
  await assert.rejects(read(file('bad.html', 'text'), 1024), /\.md/);
  await assert.rejects(read(file('large.md', '中文'), 5), /大小限制/);
  await assert.rejects(read(file('empty.md', ' \n'), 1024), /为空/);
  await assert.rejects(read(file('binary.md', 'a\0b'), 1024), /有效/);
  await assert.rejects(read({ name: 'bad.md', size: 1, arrayBuffer: async () => new Uint8Array([255]).buffer }, 1024), /UTF-8/);
  const misleading = file('large.md', 'too large');
  misleading.size = 1;
  await assert.rejects(read(misleading, 3), /大小限制/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function parser() {
  const context = vm.createContext({ window: { DOMPurify: {} }, document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(new URL('../assets/vendor/knowledge/marked.umd.js', import.meta.url), 'utf8'), context);
  context.window.marked = context.marked;
  vm.runInContext(fs.readFileSync(new URL('../knowledge-markdown.js', import.meta.url), 'utf8'), context);
  return context.marked;
}

test('real Markdown parser preserves TeX delimiters and content before deferred math rendering', () => {
  const marked = parser();
  for (const formula of [String.raw`\[ c_i=a_i-mid\cdot b_i \]`, String.raw`\[ i_1<i_2<\cdots<i_m \]`, String.raw`\(a_i*b_i\)`, '$a_i*b_i$', '$$\na_i | b_i\n\nx<y\n$$']) {
    const html = marked.parse(formula);
    assert.ok(html.includes('knowledge-math-source'), html);
    assert.ok(html.includes(formula.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), html);
    assert.ok(!html.includes('<em>'), html);
  }
});

test('code examples, escaped currency and ordinary links keep Markdown behavior', () => {
  const marked = parser();
  for (const source of ['`\\[ x_i \\]`', '```tex\n\\[ x_i \\]\n```', '    \\[ x_i \\]', String.raw`\$10 and \$20`]) {
    assert.ok(!marked.parse(source).includes('knowledge-math-source'), source);
  }
  assert.match(marked.parse('[example](https://example.com)'), /<a href="https:\/\/example.com">example<\/a>/);
  assert.match(marked.parse(String.raw`\[<img src=x onerror=alert(1)>\]`), /&lt;img/);
});

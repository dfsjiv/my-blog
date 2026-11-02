import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import katex from 'katex';

function parser() {
  const context = vm.createContext({ window: { DOMPurify: {} }, document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(new URL('../assets/vendor/knowledge/marked.umd.js', import.meta.url), 'utf8'), context);
  context.window.marked = context.marked;
  vm.runInContext(fs.readFileSync(new URL('../knowledge-markdown.js', import.meta.url), 'utf8'), context);
  context.marked.normalizeLegacyMath = context.window.KnowledgeMarkdown.normalizeLegacyMath;
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

test('legacy rich-text escaping renders as fractions, sums, inequality and boxed math rather than command letters', () => {
  const marked = parser();
  const escaped = String.raw`\[\\frac{\\sum a\_i x\_i}{\\sum b\_i x\_i}\\ge mid\]`;
  const expected = String.raw`\[\frac{\sum a_i x_i}{\sum b_i x_i}\ge mid\]`;
  assert.equal(marked.normalizeLegacyMath(escaped), expected);
  assert.ok(marked.parse(escaped).includes(expected));
  const html = katex.renderToString(marked.normalizeLegacyMath(escaped).slice(2, -2), { displayMode: true, throwOnError: true, trust: false });
  assert.match(html, /class="mfrac"/);
  assert.ok(html.includes('∑'));
  assert.ok(html.includes('≥'));
  assert.ok(!html.includes('katex-error'));
  const boxed = marked.normalizeLegacyMath(String.raw`\[\\boxed{c\_i=a\_i-mid\\cdot b\_i}\]`);
  assert.equal(boxed, String.raw`\[\boxed{c_i=a_i-mid\cdot b_i}\]`);
  assert.match(katex.renderToString(boxed.slice(2, -2)), /class="boxpad"/);
  const sumBoxed = marked.normalizeLegacyMath(String.raw`\[\\boxed{\\sum(a\_i-mid\\cdot b\_i)x\_i\\ge0}\]`);
  assert.equal(sumBoxed, String.raw`\[\boxed{\sum(a_i-mid\cdot b_i)x_i\ge0}\]`);
  assert.ok(katex.renderToString(sumBoxed.slice(2, -2)).includes('≥'));
});

test('legacy recovery preserves genuine matrix rows and valid TeX literal underscores', () => {
  const { normalizeLegacyMath: normalize } = parser();
  const matrix = String.raw`\[\begin{bmatrix}a&b\\c&d\end{bmatrix}\]`;
  assert.equal(normalize(matrix), matrix);
  const rowsWithWord = String.raw`\[\begin{aligned}a&=b\\sum&=c\end{aligned}\]`;
  assert.equal(normalize(rowsWithWord), rowsWithWord);
  const escapedMatrix = String.raw`\[\\begin{bmatrix}a&amp;b\\c&amp;d\\end{bmatrix}\]`;
  assert.equal(normalize(escapedMatrix), matrix);
  assert.equal(normalize(String.raw`$\text{file\_name}$`), String.raw`$\text{file\_name}$`);
  assert.equal(normalize(normalize(escapedMatrix)), matrix);
  const code = markedCode => parser().parse(markedCode);
  assert.ok(code('```tex\n' + escapedMatrix + '\n```').includes('\\\\begin'));
});

test('code examples, escaped currency and ordinary links keep Markdown behavior', () => {
  const marked = parser();
  for (const source of ['`\\[ x_i \\]`', '```tex\n\\[ x_i \\]\n```', '    \\[ x_i \\]', String.raw`\$10 and \$20`]) {
    assert.ok(!marked.parse(source).includes('knowledge-math-source'), source);
  }
  assert.match(marked.parse('[example](https://example.com)'), /<a href="https:\/\/example.com">example<\/a>/);
  assert.match(marked.parse(String.raw`\[<img src=x onerror=alert(1)>\]`), /&lt;img/);
});

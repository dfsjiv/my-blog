import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownManager } from '@tiptap/markdown';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { KnowledgeMathInline, KnowledgeMathDisplay } from '../src/knowledge-editor-math.mjs';

const manager = new MarkdownManager({ extensions: [StarterKit, KnowledgeMathInline, KnowledgeMathDisplay] });
const schema = getSchema([StarterKit, KnowledgeMathInline, KnowledgeMathDisplay]);
function nodes(doc) {
  return (doc.content || []).flatMap(node => [node, ...nodes(node)]);
}

test('rich-text Markdown roundtrips preserve formula commands, delimiters and matrix rows twice', () => {
  for (const source of [
    String.raw`\[\frac{\sum a_i x_i}{\sum b_i x_i}\ge mid\]`,
    String.raw`\[\boxed{\sum (a_i-mid\cdot b_i)x_i\ge0}\]`,
    String.raw`$$\frac{\sum a_i x_i}{\sum b_i x_i}\ge mid$$`,
    String.raw`\(\boxed{c_i=a_i-mid\cdot b_i}\)`,
    String.raw`$\frac{a_i}{b_i}\ge0$`,
    String.raw`\[\begin{bmatrix}a&b\\c&d\end{bmatrix}\]`,
    '$$\n\\begin{aligned}\nx_i&=a_i\\\\\ny_i&=b_i\n\\end{aligned}\n$$',
    '$$\na_i\n\n+b_i\n$$',
  ]) {
    const first = manager.parse(source);
    schema.nodeFromJSON(first).check();
    const formulas = nodes(first).filter(node => node.type.startsWith('knowledgeMath'));
    assert.equal(formulas.length, 1, source);
    assert.equal(formulas[0].attrs.source, source);
    const once = manager.serialize(first);
    assert.equal(once, source);
    assert.equal(manager.serialize(manager.parse(once)), source);
  }
});

test('formulas in prose and styled paragraphs retain independent raw source', () => {
  const source = String.raw`Before $a_i+b_i$ and \(\frac{c_i}{d_i}\) after.`;
  assert.equal(manager.serialize(manager.parse(source)), source);
  const doc = manager.parse(String.raw`**Before** $\sum_i a_i$ **after**`);
  assert.equal(nodes(doc).find(node => node.type === 'knowledgeMathInline').attrs.source, String.raw`$\sum_i a_i$`);
  for (const source of [String.raw`**$x_i$**`, String.raw`# \(\frac{a}{b}\)`, String.raw`> \[x_i\]`]) {
    schema.nodeFromJSON(manager.parse(source)).check();
  }
});

test('code, indented code, escaped currency and ordinary links are not math atoms', () => {
  for (const source of [String.raw`\$10 and \$20`, '`\\[ x_i \\]`', '```tex\n\\[ x_i \\]\n```', '    \\[ x_i \\]', '[example](https://example.com)']) {
    assert.equal(nodes(manager.parse(source)).some(node => node.type.startsWith('knowledgeMath')), false, source);
  }
});

test('serialized editor HTML emits literal math text for safe preview, not attributes or HTML execution', () => {
  for (const extension of [KnowledgeMathInline, KnowledgeMathDisplay]) {
    const source = String.raw`\[\text{<img src=x onerror=alert(1)>}\]`;
    const spec = extension.config.renderHTML({ node: { attrs: { source } } });
    assert.equal(spec[2], source);
    assert.equal(spec[1].source, undefined);
    const parse = extension.config.parseHTML()[0].getAttrs;
    assert.deepEqual(parse({ textContent: source }), { source });
    assert.equal(parse({ textContent: '<img src=x>' }), false);
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'knowledge-editor-adapter.js'), 'utf8');
const context = {
  URL,
  window: {
    location: { origin: 'https://example.com' },
    KnowledgeEditorVendor: { Editor: function Editor() {} },
    DOMPurify: { sanitize: (value) => value },
  },
};
vm.runInNewContext(source, context);

const adapter = context.window.KnowledgeEditorAdapter;
const cpp = [
  '#include <vector>',
  'int find_parent(int element_one) {',
  '  return parent[element_one];',
  '}',
].join('\n');

assert.equal(adapter.looksLikeSourceCode(cpp), true);
assert.equal(adapter.detectCodeLanguage(cpp), 'cpp');
const escapedCpp = [
  'bool erase(vector&lt;Node&gt;&amp; trie, string s) {',
  '  for (int i = 0; i &lt; s.size(); i++) {',
  '    trie\\[i\\].count--;',
  '  }',
  '}',
].join('\n');
assert.equal(adapter.looksLikeSourceCode(escapedCpp), true);
assert.equal(adapter.detectCodeLanguage(escapedCpp), 'cpp');
assert.equal(
  adapter.restoreEscapedCode(escapedCpp),
  [
    'bool erase(vector<Node>& trie, string s) {',
    '  for (int i = 0; i < s.size(); i++) {',
    '    trie[i].count--;',
    '  }',
    '}',
  ].join('\n')
);
assert.equal(adapter.looksLikeSourceCode('这是普通文章。\n这里有多行文字。\n不应该自动变成代码。'), false);

let inserted = null;
const codeEditor = fakeEditor(cpp, (content) => { inserted = content; });
assert.equal(adapter.selectionToCodeBlock(codeEditor, 'cpp'), true);
assert.equal(inserted.type, 'codeBlock');
assert.equal(inserted.attrs.language, 'cpp');
assert.equal(inserted.content[0].text, cpp);
assert.equal(inserted.content[0].text.includes('element\\_one'), false);

let restoredCode = null;
const escapedCodeEditor = fakeEditor(escapedCpp, (content) => { restoredCode = content; });
assert.equal(adapter.selectionToCodeBlock(escapedCodeEditor, 'cpp'), true);
assert.equal(restoredCode.content[0].text.includes('&lt;'), false);
assert.equal(restoredCode.content[0].text.includes('\\['), false);
assert.equal(restoredCode.content[0].text.includes('vector<Node>& trie'), true);

let paragraphs = null;
const textEditor = fakeEditor('first_line\nsecond_line', (content) => { paragraphs = content; });
assert.equal(adapter.selectionToText(textEditor), true);
assert.deepEqual(
  JSON.parse(JSON.stringify(paragraphs)),
  [
    { type: 'paragraph', content: [{ type: 'text', text: 'first_line' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'second_line' }] },
  ]
);

function fakeEditor(text, capture) {
  const chain = {
    focus() { return chain; },
    deleteSelection() { return chain; },
    insertContent(content) { capture(content); return chain; },
    run() { return true; },
  };
  return {
    state: {
      selection: { empty: false, from: 1, to: text.length + 1 },
      doc: { textBetween: () => text },
    },
    chain: () => chain,
  };
}

console.log('knowledge editor adapter tests passed');

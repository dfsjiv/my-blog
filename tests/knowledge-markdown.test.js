const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'knowledge-markdown.js'), 'utf8');
const context = {
  URL,
  window: {
    location: { href: 'https://example.com/', origin: 'https://example.com' },
    marked: { parse() { return ''; }, parseInline(value) { return value; } },
    DOMPurify: {},
  },
  document: { addEventListener() {} },
};
vm.runInNewContext(source, context);

const markdown = context.window.KnowledgeMarkdown;
const legacy = [
  '```text',
  '        Vector&lt;0,P&gt; = ( x , y )',
  '',
  '        Vector&lt;0,A&gt; = ( Ax , Ay )',
  '',
  '        Vector&lt;0,B&gt; = ( Bx , By )',
  '```',
].join('\n');
assert.equal(
  markdown.expandLegacyCenteredTextBlocks(legacy),
  [
    '{center} Vector<0,P> = ( x , y )',
    '',
    '{center} Vector<0,A> = ( Ax , Ay )',
    '',
    '{center} Vector<0,B> = ( Bx , By )',
  ].join('\n')
);

const realCode = ['```text', '  value &lt; limit;', '  count++;', '```'].join('\n');
assert.equal(markdown.expandLegacyCenteredTextBlocks(realCode), realCode);

console.log('knowledge markdown tests passed');

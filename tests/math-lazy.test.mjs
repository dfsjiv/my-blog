import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../knowledge-markdown.js', import.meta.url), 'utf8');
function fixture(nodes) {
  const window = { marked: {}, DOMPurify: {} };
  const document = { addEventListener() {}, createTreeWalker() {
    let index = 0;
    return { nextNode: () => nodes[index++] || null };
  } };
  vm.runInNewContext(source, { window, document, URL, WeakSet });
  return { window, api: window.KnowledgeMarkdown };
}
const text = (value, ignored = false) => ({ nodeValue: value, parentElement: { closest: () => ignored } });

test('formula detection ignores code and already-rendered math, and leaves plain text/one price alone', () => {
  assert.equal(fixture([text('plain article, $10'), text('$$not math$$', true)]).api.hasMath({}), false);
  for (const value of ['$x+y$', '$$\na+b\n$$', String.raw`\[a+b\]`, String.raw`\(a+b\)`]) assert.equal(fixture([text(value)]).api.hasMath({}), true);
});

test('formula loading is nonblocking and deduplicated per container; disconnected articles are not changed', async () => {
  const { window, api } = fixture([text('$x+y$')]);
  let ready, requests = 0, renders = 0;
  window.KnowledgeFeatures = { ensure: () => { requests++; return new Promise(resolve => { ready = resolve; }); } };
  const container = { isConnected: true };
  assert.equal(api.enhanceMath(container), undefined);
  api.enhanceMath(container); assert.equal(requests, 1);
  container.isConnected = false;
  window.renderMathInElement = () => renders++;
  ready(); await Promise.resolve(); await Promise.resolve();
  assert.equal(renders, 0);
});

test('deferred formulas retain the existing safe rendering options', async () => {
  const { window, api } = fixture([text('$x$')]);
  let options;
  window.KnowledgeFeatures = { ensure: async () => { window.renderMathInElement = (_, value) => { options = value; }; } };
  api.enhanceMath({ isConnected: true }); await Promise.resolve(); await Promise.resolve();
  assert.equal(options.trust, false); assert.equal(options.throwOnError, false);
});

test('a loaded resource without its expected API cannot create an infinite retry loop', async () => {
  const { window, api } = fixture([text('$x$')]);
  let requests = 0;
  window.KnowledgeFeatures = { ensure: async () => { requests++; } };
  api.enhanceMath({ isConnected: true }); await Promise.resolve(); await Promise.resolve();
  assert.equal(requests, 1);
});

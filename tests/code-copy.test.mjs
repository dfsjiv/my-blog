import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../knowledge-markdown.js', import.meta.url), 'utf8');
for (const mode of ['success','denied','unsupported']) test('code copy handles clipboard ' + mode, async () => {
  let copied, selected, reset;
  const code = { textContent: '<script>literal code</script>\nreturn 0;' };
  const button = { isConnected: true, closest: () => ({ querySelector: () => code }) };
  const window = { marked: {}, DOMPurify: {}, setTimeout: fn => { reset = fn; }, getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
  const navigator = mode === 'unsupported' ? {} : { clipboard: { async writeText(value) { if (mode === 'denied') throw new Error('denied'); copied = value; } } };
  vm.runInNewContext(source, { window, navigator, document: { addEventListener() {}, createRange: () => ({ selectNodeContents: node => { selected = node; } }) } });
  const result = await window.KnowledgeMarkdown.copyCode(button);
  assert.equal(result, mode === 'success');
  if (mode === 'success') { assert.equal(copied, code.textContent); assert.equal(button.textContent, '已复制'); }
  else { assert.equal(selected, code); assert.equal(button.textContent, '请手动复制'); }
  reset(); assert.equal(button.textContent, '复制');
});

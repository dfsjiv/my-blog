import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script = fs.readFileSync(new URL('../assets/vendor/katex/katex.min.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context); vm.runInContext(script, context);

test('vendored formula engine matches the pinned patched dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies.katex, '0.18.2');
  assert.equal(context.katex.version, pkg.dependencies.katex);
});
test('common formulas and invalid input keep working without enabling trusted HTML', () => {
  for (const formula of [String.raw`\frac{a+b}{c}`, String.raw`\sum_{i=1}^{n} i`, String.raw`\int_0^1 x^2 dx`,
    String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`, String.raw`O(n\log n)`, String.raw`\sqrt{x^2+y^2}`]) {
    const rendered = context.katex.renderToString(formula, { throwOnError: false, trust: false });
    assert.match(rendered, /class="katex/);
    assert.doesNotMatch(rendered, /katex-error/);
  }
  assert.match(context.katex.renderToString(String.raw`\frac{1}{`, { throwOnError: false }), /katex-error/);
});
test('inherited trust cannot enable javascript links (GHSA-238p-pmpm-9mq7)', () => {
  const isolated = {};
  vm.createContext(isolated); vm.runInContext(script, isolated);
  vm.runInContext(String.raw`Object.prototype.trust = true;
    globalThis.rendered = katex.renderToString('\\href{javascript:alert(1)}{x}', {throwOnError:false});`, isolated);
  assert.doesNotMatch(isolated.rendered, /<a[^>]*href\s*=\s*["']javascript:/i);
  assert.equal(Object.prototype.trust, undefined);
});

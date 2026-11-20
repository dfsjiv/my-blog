import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectArticleScript, normalizeArticleLayout } from '../functions/lib/article-layout-policy.mjs';

test('article effects accept DOM interactions and instrument every user callback', () => {
  const source = 'const nodes=document.querySelectorAll("button"); nodes.forEach(n=>{n.addEventListener("click",()=>{n.classList.toggle("active");n.style.setProperty("opacity","0.5");});});';
  const result = inspectArticleScript(source);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  assert.equal(result.instrumented.match(/__zhenGuard\(\);/g).length,2);
  assert.ok(inspectArticleScript('const f=x=>x+1; f(2);').instrumented.includes('return (x+1)'));
});

test('article effects reject credential access, execution, navigation and capability aliases', () => {
  for (const code of [
    'fetch("https://example.com")', 'window.parent.document.body.remove()',
    'document.cookie', 'localStorage.getItem("token")', 'window.location="https://example.com"',
    'document["co"+"okie"]', 'document["cookie"]', 'document["\\u0063ookie"]',
    '[].constructor.constructor("return this")()', 'eval("x")', 'new Image()',
    'import("https://example.com")', 'const f=document.body.setAttribute;f("src","https://example.com");',
    'document.body.setAttribute("onclick","alert(1)")', 'document.body.innerHTML="<img>"',
    'document.querySelector("meta").setAttribute("content","0;url=https://example.com")',
    'setTimeout("fetch(1)",0)', 'while(true){}', 'for(;;){}', 'this.location="x"',
    'const x={get x(){return 1}};', 'const __zhenGuard=()=>{};', 'Object.assign(document,{})'
  ]) {
    assert.equal(inspectArticleScript(code).ok,false,code);
  }
});

test('article layout validation requires the current article content and bounds storage', () => {
  const base={mode:'custom',html:'<main>{{content}}</main>',css:'',js:''};
  assert.deepEqual(normalizeArticleLayout(base),base);
  for(const extra of [{html:'<main>missing body</main>'},{html:'<script>x</script>{{content}}'},{html:'<img onerror="x">{{content}}'},{css:'@import "https://x";'},{js:'navigator.sendBeacon("x")'},{css:'x'.repeat(100*1024)}]) assert.throws(()=>normalizeArticleLayout({...base,...extra}));
  assert.equal(normalizeArticleLayout({...base,mode:'default',js:'fetch(1)'}).mode,'default','inactive design source is preserved as text, never executed');
});

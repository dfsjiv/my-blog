import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inspectArticleScript, normalizeArticleLayout, articleHtmlText } from '../functions/lib/article-layout-policy.mjs';

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
    'setTimeout("fetch(1)",0)', 'this.location="x"',
    'document.createElement("script")', 'document.createElement("iframe")', 'document.createElement("img")',
    'document.createElement("di"+"v")', 'const create=document.createElement;create("div")',
    'const x={get x(){return 1}};', 'const __zhenGuard=()=>{};', 'Object.assign(document,{})'
  ]) {
    assert.equal(inspectArticleScript(code).ok,false,code);
  }
});

test('ordinary loops and display elements work while every loop has a runtime budget', () => {
  for (const source of [
    'let n=0;for(let i=0;i<4;i++) n+=i;',
    'let n=0;while(n<4){n++;}',
    'let n=0;do n++;while(n<4);',
    'let n=0;for(const value of [1,2,3]) n+=value;',
    'let n=0;for(const key in {a:1,b:2}) n++;',
    'let n=0;for(let i=0;i<2;i++) for(let j=0;j<2;j++) n++;'
  ]) {
    const result=inspectArticleScript(source);assert.equal(result.ok,true,result.issues.join(';'));
    let calls=0;vm.runInNewContext(result.instrumented,{__zhenGuard:()=>{calls++;}},{timeout:100});assert.ok(calls>0);
  }
  for(const source of ['while(true){}','for(;;);','do{}while(true);','for(;;){try{}catch(e){}}']) {
    const result=inspectArticleScript(source);let calls=0;
    assert.equal(result.ok,true);
    assert.throws(()=>vm.runInNewContext(result.instrumented,{__zhenGuard:()=>{if(++calls>100)throw Error('Budget reached');}},{timeout:100}),/Budget reached/);
  }
  assert.equal(inspectArticleScript('for(let i=0;i<3;i++){const node=document.createElement("span");node.textContent=String(i);document.body.appendChild(node);}').ok,true);
});

test('canvas width and base styles are optional, validated, and preserve old designs', () => {
  const base={mode:'custom',html:'{{content}}',css:'',js:''};
  assert.deepEqual(normalizeArticleLayout(base),base);
  const design=normalizeArticleLayout({...base,width:'full',baseStyles:'minimal'});
  assert.equal(design.width,'full');assert.equal(design.baseStyles,'minimal');
  for(const extra of [{width:'javascript:x'},{baseStyles:'unrestricted'}]) assert.throws(()=>normalizeArticleLayout({...base,...extra}));
});

test('article layout validation requires the current article content and bounds storage', () => {
  const base={mode:'custom',html:'<main>{{content}}</main>',css:'',js:''};
  assert.deepEqual(normalizeArticleLayout(base),base);
  for(const extra of [{html:'<main>missing body</main>'},{html:'<script>x</script>{{content}}'},{html:'<img onerror="x">{{content}}'},{css:'@import "https://x";'},{js:'navigator.sendBeacon("x")'},{css:'x'.repeat(100*1024)}]) assert.throws(()=>normalizeArticleLayout({...base,...extra}));
  assert.equal(normalizeArticleLayout({...base,mode:'default',js:'fetch(1)'}).mode,'default','inactive design source is preserved as text, never executed');
});

test('free HTML uses its own body, extracts inline code idempotently and retains safety checks',()=>{
 const source='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Metadata</title><style>body.free{color:teal}</style></head><body class="free"><h1>HTML 正文</h1><p>A &amp; B &#x4E2D;</p><script>document.body.classList.add("ready");</script></body></html>';
 const layout=normalizeArticleLayout({mode:'free',html:source,css:'',js:''});
 assert.equal(layout.width,'full');assert.equal(layout.baseStyles,'minimal');
 assert.match(layout.css,/body.free/);assert.match(layout.js,/classList/);
 assert.doesNotMatch(layout.html,/<script|<style|<meta/i);assert.doesNotMatch(layout.html,/content}}/);
 assert.deepEqual(normalizeArticleLayout(layout),layout);
 assert.equal(articleHtmlText(layout.html),'HTML 正文\nA & B 中');
 for(const html of ['<script src="https://x"></script><p>x</p>','<script>fetch("https://x")</script><p>x</p>','<p onclick="alert(1)">x</p>','']) assert.throws(()=>normalizeArticleLayout({mode:'free',html}));
 assert.throws(()=>normalizeArticleLayout({mode:'custom',html:'<p>HTML 正文</p>'}),/content/);
});

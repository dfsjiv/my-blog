import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../static/js/site-entry-loader.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture({visited=true,reduced=false}={}){
  let now=0,id=0;const timers=new Map(),frames=new Map(),classes=new Set();
  const loader={hidden:true,classList:{add:(...n)=>n.forEach(x=>classes.add(x)),remove:(...n)=>n.forEach(x=>classes.delete(x)),toggle:(n,on)=>on?classes.add(n):classes.delete(n),contains:n=>classes.has(n)}};
  const label={textContent:''},line={style:{}};
  const window={sessionStorage:{getItem:()=>visited?'1':null,setItem(){}},matchMedia:()=>({matches:reduced}),
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n),
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:n=>timers.delete(n),addEventListener(){},removeEventListener(){}};
  vm.runInNewContext(source,{window,document:{readyState:'complete',getElementById:n=>n==='siteEntryLoader'?loader:n==='siteEntryLoaderProgress'?label:line},performance:{now:()=>now}});
  async function step(){now+=16;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));for(let n=0;n<8;n++)await Promise.resolve();}
  async function advance(ms){for(let n=0;n<Math.ceil(ms/16);n++)await step();}
  return {api:window.siteEntryLoader,loader,classes,label,advance,now:()=>now};
}

test('routes update only after the entry panels cover the old page, and reveal after readiness',async()=>{
  const f=fixture(),ready=deferred();let changed=false,finished=false;
  const transition=f.api.transition(()=>{assert.equal(f.loader.hidden,false);assert.equal(f.classes.has('is-covering'),false);changed=true;return ready.promise;});
  transition.then(()=>finished=true);
  assert.equal(changed,false);await f.advance(128);assert.equal(changed,false);
  await f.advance(800);assert.equal(changed,true);assert.equal(f.classes.has('is-leaving'),false);assert.equal(finished,false);
  ready.resolve('rendered');await f.advance(1600);assert.equal(await transition,'rendered');assert.equal(finished,true);assert.equal(f.loader.hidden,true);
});

test('failed rendering reveals the error page and propagates the render error',async()=>{
  const f=fixture();let error;
  const transition=f.api.transition(()=>{throw Error('Render failed');}).catch(e=>{error=e;});
  await f.advance(2200);await transition;assert.equal(error.message,'Render failed');assert.equal(f.loader.hidden,true);
});

test('a stalled resource cannot trap the reader behind a navigation overlay',async()=>{
  const f=fixture(),ready=deferred();const transition=f.api.transition(()=>ready.promise);
  await f.advance(8500);assert.equal(f.loader.hidden,true);
  ready.resolve();await f.advance(100);await transition;
});

test('reduced motion skips the panel travel and long minimum dwell',async()=>{
  const f=fixture({reduced:true});let done=false;
  const transition=f.api.transition(()=>42).then(value=>{assert.equal(value,42);done=true;});
  await f.advance(320);assert.equal(done,true);assert.equal(f.loader.hidden,true);await transition;
});

test('replaying the entry animation settles the previous run without a stale hide timer',async()=>{
  const f=fixture();let firstDone=false;
  const first=f.api.play({force:true}).then(()=>firstDone=true);await f.advance(100);
  const second=f.api.play({force:true,route:true});await f.advance(100);assert.equal(firstDone,true);assert.equal(f.loader.hidden,false);
  await f.advance(1800);await Promise.all([first,second]);assert.equal(f.loader.hidden,true);
});

test('first entry still waits for held initial rendering before opening',async()=>{
  const f=fixture({visited:false}),ready=deferred();f.api.holdUntil(ready.promise);
  await f.advance(2000);assert.equal(f.loader.hidden,false);assert.equal(f.classes.has('is-leaving'),false);
  ready.resolve();await f.advance(2400);assert.equal(f.loader.hidden,true);
});

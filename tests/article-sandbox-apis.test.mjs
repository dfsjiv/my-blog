import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installFrameEnhancements } from '../src/knowledge-article-enhancements.mjs';

function fixture(active = true, standalone = false) {
  const timers=[],messages=[],listeners={};
  const realStorage={getItem:()=> 'REAL BLOG TOKEN'};
  const parent={postMessage:data=>messages.push(data)};
  const context={parent,TextEncoder,localStorage:realStorage,navigator:{userActivation:{isActive:active}},performance:{now:()=>0},IntersectionObserver:function NativeObserver(){},
    document:{documentElement:{scrollTop:42,clientHeight:800},addEventListener(type,fn){listeners['document:'+type]=fn;}},setTimeout:callback=>{timers.push(callback);},addEventListener:(type,fn)=>{listeners[type]=fn;}};
  context.window=context;
  vm.runInNewContext('('+installFrameEnhancements.toString()+')("article-channel",[["theme","dark"]],'+JSON.stringify(standalone)+')',context);
  return {context,messages,timers,realStorage,listeners,parent};
}

test('article localStorage is a bounded independent namespace, with coalesced writes',()=>{
  const {context,messages,timers,realStorage}=fixture();const storage=context.localStorage;
  assert.equal(realStorage.getItem('token'),'REAL BLOG TOKEN');
  assert.equal(storage.getItem('token'),null);assert.equal(storage.getItem('theme'),'dark');
  for(let i=0;i<50;i++)storage.setItem('theme',String(i));
  assert.equal(timers.length,1);assert.equal(messages.length,0);timers.shift()();
  assert.equal(messages[0].type,'storage');assert.deepEqual(JSON.parse(JSON.stringify(messages[0].entries)),[['theme','49']]);
  assert.throws(()=>storage.setItem('x','a'.repeat(1025)),/超限/);
  storage.setItem('__proto__','safe map key');assert.equal(storage.getItem('__proto__'),'safe map key');
  storage.clear();assert.equal(storage.length,0);
  storage.setItem('one','喵'.repeat(1000));
  assert.throws(()=>storage.setItem('two','喵'.repeat(1000)),/4 KiB/);
  storage.clear();for(let i=0;i<32;i++)storage.setItem(String(i),'x');
  assert.throws(()=>storage.setItem('extra','x'),/32 项/);
});

test('standalone articles keep native scrolling and intersection observation while retaining account isolation',()=>{
  const f=fixture(true,true);
  assert.equal(f.context.document.documentElement.scrollTop,42);
  assert.equal(f.context.document.documentElement.clientHeight,800);
  assert.equal(f.context.IntersectionObserver.name,'NativeObserver');
  assert.equal(f.context.localStorage.getItem('token'),null);
  f.listeners.message({source:f.parent,data:{channel:'article-channel',type:'viewport',scrollTop:100,viewportHeight:10}});
  assert.equal(f.context.document.documentElement.scrollTop,42);
});

test('standalone hash links scroll the current sandbox rather than navigating srcdoc to the blog URL',()=>{
  const f=fixture(true,true);let scrolled=false,prevented=false;
  f.context.document.getElementById=id=>id==='section'?{scrollIntoView(){scrolled=true;}}:null;
  const link={getAttribute:()=> '#section'};
  f.listeners['document:click']({isTrusted:true,target:{closest:selector=>selector.startsWith('a[')?link:null},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(scrolled,true);assert.equal(f.messages.length,0);
  prevented=false;scrolled=false;f.context.document.getElementById=()=>null;
  f.listeners['document:click']({isTrusted:true,target:{closest:selector=>selector.startsWith('a[')?link:null},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(scrolled,false);
});

test('clipboard compatibility requires activation and accepts only verified parent replies',async()=>{
  const inactive=fixture(false);await assert.rejects(inactive.context.navigator.clipboard.writeText('x'),/点击/);
  const f=fixture(),promise=f.context.navigator.clipboard.writeText('article code');
  const request=f.messages[0];assert.equal(request.type,'copy');assert.equal(request.text,'article code');
  let finished=false;promise.then(()=>finished=true);
  f.listeners.message({source:{},data:{channel:'article-channel',type:'copied',copyId:request.copyId,ok:true}});
  await Promise.resolve();assert.equal(finished,false);
  f.listeners.message({source:f.parent,data:{channel:'article-channel',type:'copied',copyId:request.copyId,ok:true}});
  await promise;assert.equal(finished,true);
});

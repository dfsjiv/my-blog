import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installFrameEnhancements } from '../src/knowledge-article-enhancements.mjs';

function fixture(active = true) {
  const timers=[],messages=[],listeners={};
  const realStorage={getItem:()=> 'REAL BLOG TOKEN'};
  const parent={postMessage:data=>messages.push(data)};
  const context={parent,TextEncoder,localStorage:realStorage,navigator:{userActivation:{isActive:active}},performance:{now:()=>0},
    document:{documentElement:{},addEventListener(){}},setTimeout:callback=>{timers.push(callback);},addEventListener:(type,fn)=>{listeners[type]=fn;}};
  context.window=context;
  vm.runInNewContext('('+installFrameEnhancements.toString()+')("article-channel",[["theme","dark"]])',context);
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

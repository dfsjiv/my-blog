import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { handleBackgroundDisplay, validateDisplay } from '../functions/lib/background-display.mjs';
test('display positions are finite and bounded and preview uses exactly the hero transform', () => {
  const display = { x: 10, y: 80, zoom: 1.5 };
  assert.deepEqual(validateDisplay(display), display);
  for (const bad of [{ ...display, x: -1 }, { ...display, y: NaN }, { ...display, zoom: 4 }, { ...display, x: '10' }]) assert.throws(() => validateDisplay(bad));
  const window = {}; vm.runInNewContext(fs.readFileSync(new URL('../static/js/knowledge-background-display.js', import.meta.url), 'utf8'), { window });
  const preview = { style: {} }, hero = { style: {} };
  window.KnowledgeBackgroundDisplay.apply(preview, display, true);
  window.KnowledgeBackgroundDisplay.apply(hero, display);
  assert.equal(preview.style.objectPosition, hero.style.backgroundPosition);
  assert.equal(preview.style.transform, hero.style.transform);
  assert.equal(hero.style.transformOrigin, '10% 80%');
});
function backgroundFixture(){
  const objects = new Map();
  const run = async (method, query, body, role = 'admin') => {
    const request = new Request('https://blog.test/api/background-display' + query, { method,
      body: body ? JSON.stringify(body) : undefined, headers: role ? { Authorization: role } : {} });
    return handleBackgroundDisplay({ request, url: new URL(request.url), env: {
      DB: { prepare: () => ({ bind: id => ({ first: async () => id === 7 ? { id } : null }) }) },
      KNOWLEDGE_IMAGES: { get: async key => objects.has(key) ? { text: async () => objects.get(key) } : null,
        put: async (key, data) => objects.set(key, data) } },
      jsonResponse: (data, status = 200) => Response.json(data, { status }),
      getBearerToken: r => r.headers.get('Authorization'), getAuthenticatedUser: async role => ({ id: 1, role }) });
  };
  return {objects,run};
}
test('admins persist default and custom display settings; public read is safe and additive', async () => {
  const {run}=backgroundFixture();
  const display = { x: 20, y: 70, zoom: 2 };
  assert.equal((await run('PATCH', '', { key: 'builtin-1', display })).status, 200);
  assert.equal((await run('PATCH', '', { key: '7', display })).status, 200);
  assert.equal((await run('PATCH', '', { key: '99', display })).status, 404);
  assert.equal((await run('PATCH', '', { key: '../7', display })).status, 400);
  assert.equal((await run('PATCH', '', { key: '7', display }, 'user')).status, 403);
  assert.equal((await run('PATCH', '', { key: '7', display }, null)).status, 401);
  const result = await run('GET', '?ids=builtin-1,7,builtin-4', null, null);
  assert.deepEqual((await result.json()).data.settings, [{ key: 'builtin-1', display, state:'active' }, { key: '7', display, state:'active' }, { key: 'builtin-4', display: null, state:'active' }]);
  assert.equal((await run('GET', '?ids=../../x', null, null)).status, 400);
});

test('original backgrounds pause, remove and restore persistently without losing crop settings',async()=>{
  const {run,objects}=backgroundFixture(),display={x:25,y:75,zoom:1.5};
  await run('PATCH','',{key:'builtin-1',display});
  for(const state of ['paused','removed','active']){
    assert.equal((await run('PATCH','',{key:'builtin-1',state})).status,200);
    const setting=(await (await run('GET','?ids=builtin-1',null,null)).json()).data.settings[0];
    assert.equal(setting.state,state);assert.deepEqual(setting.display,display);
  }
  await Promise.all([run('PATCH','',{key:'builtin-1',state:'removed'}),run('PATCH','',{key:'builtin-1',display:{x:10,y:20,zoom:2}})]);
  const final=(await (await run('GET','?ids=builtin-1',null,null)).json()).data.settings[0];
  assert.equal(final.state,'removed');assert.equal(final.display.zoom,2);
  assert.ok(objects.has('background-state/builtin-1'));
  for(let n=1;n<=4;n++)await run('PATCH','',{key:'builtin-'+n,state:'removed'});
  const all=(await (await run('GET','?ids=builtin-1,builtin-2,builtin-3,builtin-4',null,null)).json()).data.settings;
  assert.ok(all.every(item=>item.state==='removed'));
});

test('background availability retains admin authority and rejects invalid IDs and states',async()=>{
  const {run,objects}=backgroundFixture();
  for(const role of [null,'user'])assert.equal((await run('PATCH','',{key:'builtin-1',state:'removed'},role)).status,role?403:401);
  for(const body of [{key:'../secret',state:'removed'},{key:'7',state:'removed'},{key:'builtin-1',state:true},{key:'builtin-5',state:'removed'},{key:'builtin-1',state:'other'},{key:'builtin-1'}])assert.equal((await run('PATCH','',body)).status,400);
  assert.equal(objects.size,0);
  objects.set('background-state/builtin-1','corrupt');
  assert.equal((await run('GET','?ids=builtin-1',null,null)).status,503,'unreadable settings cannot silently restore defaults');
});

test('background setting reads batch large paused queues without exceeding the public request limit',async()=>{
  const window={},counts=[];
  vm.runInNewContext(fs.readFileSync(new URL('../static/js/knowledge-background-display.js',import.meta.url),'utf8'),{window,AbortController,setTimeout,clearTimeout,fetch:async input=>{
    const ids=new URL(input,'https://blog.test').searchParams.get('ids').split(',');counts.push(ids.length);
    return Response.json({success:true,data:{settings:ids.map(key=>({key,state:'active',display:null}))}});
  }});
  const settings=await window.KnowledgeBackgroundDisplay.get(Array.from({length:51},(_,n)=>String(n+1)));
  assert.deepEqual(counts,[50,1]);assert.equal(settings.length,51);
});

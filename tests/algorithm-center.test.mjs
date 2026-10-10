import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleAlgorithmRequest } from '../functions/lib/algorithm-center.mjs';
import { analyzeSubmissions } from '../functions/lib/algorithm/analytics.mjs';
import { fetchSubmissionPage, normalizeHandle, atCoderDifficulty, verifyProfile } from '../functions/lib/algorithm/providers.mjs';
import { fetchYukicoderContests, fetchTopcoderContests } from '../functions/lib/contests/extra-platforms.mjs';

class Statement {
  constructor(db, sql, values = []) { this.db=db; this.sql=sql; this.values=values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  all() { return {results:this.db.prepare(this.sql).all(...this.values)}; }
  run() { const r=this.db.prepare(this.sql).run(...this.values); return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}; }
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY, role TEXT); INSERT INTO users VALUES(1,\'user\'),(2,\'admin\');');
  sqlite.exec(fs.readFileSync(new URL('../migrations/0010_add_algorithm_center.sql', import.meta.url), 'utf8'));
  const db = {prepare:sql=>new Statement(sqlite,sql),batch(statements) {
    sqlite.exec('BEGIN'); try { const r=statements.map(s=>s.run()); sqlite.exec('COMMIT'); return r; }
    catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  }};
  let now = Date.parse('2026-10-10T12:00:00Z');
  const request = async (path, method='GET', body, userId=1, fetchImpl) => {
    const req=new Request('https://example.com/api/algorithm/'+path, {method,
      headers:userId ? {Authorization:'Bearer test'} : {}, body:body ? JSON.stringify(body):undefined});
    return handleAlgorithmRequest({request:req,url:new URL(req.url),env:{DB:db},now:()=>now,
      getBearerToken:r=>r.headers.get('Authorization'),getAuthenticatedUser:async()=>({id:userId,role:userId===2?'admin':'user'}),
      jsonResponse:(data,status=200)=>new Response(JSON.stringify(data),{status}),fetch:fetchImpl});
  };
  return {sqlite,db,request,advance:()=>{now+=31000;},now:()=>now};
}
const response = body => new Response(JSON.stringify(body));
const cfSubmission = (id,index='A',verdict='OK',second=1791633500) => ({id,creationTimeSeconds:second,
  verdict,programmingLanguage:'C++17',problem:{contestId:100,index,name:'Test',rating:1200,tags:['dp','math']}});

test('algorithm migration is additive, idempotent and has per-user platform uniqueness', () => {
  const f=fixture();
  f.sqlite.exec(fs.readFileSync(new URL('../migrations/0010_add_algorithm_center.sql',import.meta.url),'utf8'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n,2);
  f.sqlite.exec("INSERT INTO algorithm_accounts(user_id,platform,handle) VALUES(1,'codeforces','test');");
  assert.throws(()=>f.sqlite.exec("INSERT INTO algorithm_accounts(user_id,platform,handle) VALUES(1,'codeforces','other');"));
  assert.throws(()=>f.sqlite.exec("INSERT INTO algorithm_accounts(user_id,platform,handle) VALUES(1,'url','other');"));
});

test('handle validation cannot become arbitrary URL fetching', () => {
  assert.equal(normalizeHandle('codeforces',' tourist '),'tourist');
  for(const value of ['https://example.com','../users','abc?secret=1','']) assert.throws(()=>normalizeHandle('codeforces',value));
  assert.throws(()=>normalizeHandle('unknown','tourist'));
  assert.equal(atCoderDifficulty({difficulty:0}),147);
  assert.equal(atCoderDifficulty({difficulty:800}),800);
  assert.equal(atCoderDifficulty({}),null);
});

test('requires authenticated blog account and isolates accounts even from another admin', async () => {
  const f=fixture();
  assert.equal((await f.request('dashboard','GET',null,0)).status,401);
  f.sqlite.exec("INSERT INTO algorithm_accounts(user_id,platform,handle) VALUES(1,'codeforces','test');");
  assert.equal((await f.request('accounts/1/sync','POST',null,2)).status,404);
  assert.equal((await f.request('accounts/1','DELETE',null,2)).status,404);
  const dash=await f.request('dashboard','GET',null,2);
  assert.equal(dash.headers.get('Cache-Control'),'private, no-store');
  assert.equal((await dash.json()).data.platforms.length,0);
});

test('AtCoder validates actual public profile markup, not empty rating history', async () => {
  const profile=await verifyProfile('atcoder','chokudai',async()=>new Response('<title>chokudai - AtCoder</title><ul id="user-nav-tabs"></ul>'));
  assert.equal(profile.handle,'chokudai');
  await assert.rejects(()=>verifyProfile('atcoder','none',async()=>new Response('<title>Error</title>')),/PROFILE_NOT_FOUND/);
});

test('normal user links profile; duplicate platform is rejected and does not overwrite', async () => {
  const f=fixture(), mock=async()=>response({status:'OK',result:[{handle:'Tourist',rating:3600}]});
  const result=await f.request('accounts','POST',{platform:'codeforces',handle:'tourist'},1,mock);
  assert.equal(result.status,201);
  assert.equal(f.sqlite.prepare('SELECT handle FROM algorithm_accounts').get().handle,'Tourist');
  assert.equal((await f.request('accounts','POST',{platform:'codeforces',handle:'other'},1,mock)).status,409);
  assert.equal((await f.request('accounts','POST',{platform:'atcoder',handle:'http://evil'},1,mock)).status,400);
});

test('sync is idempotent, counts unique solves, throttles and preserves existing records on upstream failure', async () => {
  const f=fixture();
  f.sqlite.exec("INSERT INTO algorithm_accounts(user_id,platform,handle,profile_json) VALUES(1,'codeforces','test','{\"metadataAt\":1791633600}');");
  const mock=async()=>response({status:'OK',result:[cfSubmission(3,'A'),cfSubmission(2,'A'),cfSubmission(1,'B','WRONG_ANSWER')]});
  assert.equal((await f.request('accounts/1/sync','POST',null,1,mock)).status,200);
  assert.equal((await f.request('accounts/1/sync','POST',null,1,mock)).status,429);
  f.advance(); await f.request('accounts/1/sync','POST',null,1,mock);
  const stats=(await (await f.request('dashboard')).json()).data;
  assert.equal(stats.summary.submissions,3); assert.equal(stats.summary.solved,1);
  assert.equal(stats.summary.unresolved,1); assert.equal(stats.summary.acceptanceRate,66.7);
  f.advance();
  const failed=await f.request('accounts/1/sync','POST',null,1,async()=>{throw new Error('offline');});
  assert.equal(failed.status,502);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM algorithm_submissions').get().n,3);
  assert.equal(f.sqlite.prepare('SELECT sync_lock_until FROM algorithm_accounts').get().sync_lock_until,0);
  assert.equal((await f.request('accounts/1','DELETE')).status,200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM algorithm_submissions').get().n,0);
});

test('atomic sync lease rejects concurrent sync and unlink', async () => {
  const f=fixture();
  f.sqlite.exec(`INSERT INTO algorithm_accounts(user_id,platform,handle,sync_lock_until) VALUES(1,'codeforces','test',${f.now()/1000+60});`);
  assert.equal((await f.request('accounts/1/sync','POST')).status,409);
  assert.equal((await f.request('accounts/1','DELETE')).status,409);
});

test('provider pagination imports API offsets, not counts of accepted submissions', async () => {
  let observed;
  await fetchSubmissionPage({platform:'codeforces',handle:'test',history_cursor:1001},'history',async url=>{
    observed=url; return response({status:'OK',result:[cfSubmission(2,'A','WRONG_ANSWER')]});
  });
  assert.match(observed,/from=1001/);
  const page=await fetchSubmissionPage({platform:'atcoder',handle:'test',history_cursor:123},'history',async url=>{
    assert.match(url,/from_second=123/);
    return response([{id:1,epoch_second:124,problem_id:'abc001_a',contest_id:'abc001',result:'AC'}]);
  });
  assert.equal(page.cursor,124); assert.equal(page.complete,true); assert.equal(page.rows[0].verdict,'OK');
  assert.equal(page.rows[0].problem.tags.length,0);
  await assert.rejects(()=>fetchSubmissionPage({platform:'atcoder',handle:'test',history_cursor:123},'history',
    async()=>response(Array.from({length:500},(_,i)=>({id:i+1,epoch_second:123,problem_id:'abc001_a',contest_id:'abc001'})))),/CURSOR_STALLED/);
});

test('large Codeforces refresh gaps reopen history rather than reporting complete coverage', async () => {
  const old=1791633500;
  const page=await fetchSubmissionPage({platform:'codeforces',handle:'test',latest_second:old,history_complete:1},'recent',
    async()=>response({status:'OK',result:Array.from({length:1000},(_,i)=>cfSubmission(i+1,'A','OK',old+1001-i))}));
  assert.equal(page.resetHistory,true);
});

test('AtCoder pending submission can be updated without duplicate accounting or skipping cursor boundaries', async () => {
  const f=fixture();
  f.sqlite.exec(`INSERT INTO algorithm_accounts(user_id,platform,handle,profile_json) VALUES(1,'atcoder','test','{"metadataAt":${f.now()/1000}}');`);
  let verdict='WJ';
  const mock=async url=>url.includes('problem-models') ? response({abc001_a:{difficulty:400}})
    : response([{id:1,epoch_second:Math.floor(f.now()/1000)-60,problem_id:'abc001_a',contest_id:'abc001',result:verdict}]);
  assert.equal((await f.request('accounts/1/sync','POST',null,1,mock)).status,200);
  let stats=(await (await f.request('dashboard')).json()).data;
  assert.equal(stats.summary.judged,0); assert.equal(stats.summary.solved,0);
  f.advance(); verdict='AC';
  await f.request('accounts/1/sync','POST',null,1,mock);
  stats=(await (await f.request('dashboard')).json()).data;
  assert.equal(stats.summary.submissions,1); assert.equal(stats.summary.solved,1);
  assert.equal(stats.platforms[0].medianDifficulty,400);
});

test('storage cap is visible as partial coverage and must not advance history cursor', async () => {
  const f=fixture();
  f.sqlite.exec(`INSERT INTO algorithm_accounts(user_id,platform,handle,history_cursor,profile_json) VALUES(1,'codeforces','test',5,'{"metadataAt":${f.now()/1000}}');`);
  const insert=f.sqlite.prepare("INSERT INTO algorithm_submissions VALUES(1,?, 'old',1791633500,'OK','{\"name\":\"old\"}', 'C++')");
  f.sqlite.exec('BEGIN'); for(let i=0;i<20000;i++) insert.run(String(i+1)); f.sqlite.exec('COMMIT');
  const result=await f.request('accounts/1/sync','POST',null,1,async()=>response({status:'OK',result:[cfSubmission(20001)]}));
  const payload=await result.json();
  assert.equal(result.status,200); assert.deepEqual(payload.data.warnings,['RECORD_LIMIT']);
  assert.equal(payload.data.historyComplete,false);
  assert.equal(f.sqlite.prepare('SELECT history_cursor FROM algorithm_accounts').get().history_cursor,5);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM algorithm_submissions').get().n,20000);
});

test('analytics separates platform identity/scales, rejects weak-topic claims on small samples and uses Shanghai days', () => {
  const now=Date.parse('2026-10-10T00:30:00Z'), second=Math.floor(now/1000);
  const row=(id,platform,key,verdict,time,difficulty,tags=[])=>({account_id:platform==='codeforces'?1:2,submission_id:String(id),platform,problem_key:key,
    submitted_second:time,verdict,language:'C++',problem_json:JSON.stringify({key,name:key,difficulty,tags})});
  const rows=[row(1,'codeforces','a','WRONG_ANSWER',second-86400,1200,['dp']),row(2,'codeforces','a','OK',second,1200,['dp']),
    row(3,'codeforces','a','OK',second,1200,['dp']),row(4,'atcoder','a','OK',second,400),row(5,'atcoder','b','PENDING',second,null)];
  const accounts=[{id:1,platform:'codeforces',handle:'cf',history_complete:1,last_synced_at:'date',profile_json:'{}'},
    {id:2,platform:'atcoder',handle:'ac',history_complete:0,profile_json:'{}'}];
  const data=analyzeSubmissions(rows,accounts,now);
  assert.equal(data.summary.solved,2); assert.equal(data.summary.acceptanceRate,75);
  assert.equal(data.summary.firstTryRate,50); assert.equal(data.summary.historyComplete,false);
  assert.equal(data.platforms[0].medianDifficulty,1200); assert.equal(data.platforms[1].medianDifficulty,400);
  assert.equal(data.heatmap.at(-1).date,'2026-10-10'); assert.equal(data.heatmap.at(-1).solved,2);
  assert.equal(data.summary.streak,2); assert.equal(data.weakTags.length,0);
});

test('new contest adapters normalize times and omit development tasks / expired events', async () => {
  const now=Date.parse('2026-10-10T00:00:00Z');
  const y=await fetchYukicoderContests(async()=>response([{Id:1,Name:'Contest',Date:'2026-10-16T21:20:00+09:00',EndDate:'2026-10-16T23:20:00+09:00'}]),now);
  assert.equal(y[0].durationSeconds,7200); assert.equal(y[0].platform,'yukicoder');
  const top=await fetchTopcoderContests(async()=>response([
    {id:'1',name:'Marathon Match',type:{name:'Marathon Match'},startDate:'2026-10-09T00:00:00Z',endDate:'2026-10-11T00:00:00Z'},
    {id:'2',name:'Development',type:{name:'Challenge'},startDate:'2026-10-09T00:00:00Z',endDate:'2026-10-11T00:00:00Z'},
    {id:'3',name:'Expired Marathon Match',startDate:'2026-10-01T00:00:00Z',endDate:'2026-10-02T00:00:00Z'}]),now);
  assert.equal(top.length,1); assert.equal(top[0].status,'running');
});

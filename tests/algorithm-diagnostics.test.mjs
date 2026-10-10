import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Script } from 'node:vm';
import { analyzeSubmissions } from '../functions/lib/algorithm/analytics.mjs';
const now=Date.parse('2026-10-11T00:00:00Z');
const accounts=[{id:1,platform:'codeforces',handle:'demo',history_complete:1,last_synced_at:'2026-10-10',profile_json:'{}'}];
function row(id,key,verdict,tags=['dp'],difficulty=1200,second=now/1000-86400){return {account_id:1,platform:'codeforces',submission_id:String(id),problem_key:key,verdict,submitted_second:second,language:'C++',problem_json:JSON.stringify({key,name:key,tags,difficulty})};}
test('diagnostics deduplicate topics and problems, distinguish attempts, first-try solves and pending verdicts',()=>{
  const data=analyzeSubmissions([row(1,'A','WA',['dp','dp']),row(2,'A','OK'),row(3,'A','OK'),row(4,'B','TESTING',[],null)],accounts,now);
  const d=data.diagnostics;
  assert.equal(d.coverage.attempted,2);assert.equal(d.coverage.tagged,1);assert.equal(d.coverage.rated,1);
  assert.equal(d.topics[0].attempted,1);assert.equal(d.topics[0].solved,1);assert.equal(d.topics[0].firstTryRate,0);
  assert.equal(d.topics[0].averageAttempts,3);assert.equal(d.topics[0].evidence,'insufficient');
  assert.equal(d.review.length,0);assert.equal(d.difficulty.find(r=>r.bucket==='unrated').attempted,1);
});
test('evidence thresholds are explicit and difficulty scales remain separate across platforms',()=>{
  const rows=Array.from({length:5},(_,i)=>row(i+1,'P'+i,i<2?'OK':'WA'));
  rows.push({...row(7,'AC1','OK',['dp'],800),account_id:2,platform:'atcoder'});
  const d=analyzeSubmissions(rows,[...accounts,{...accounts[0],id:2,platform:'atcoder',history_complete:0}],now).diagnostics;
  assert.equal(d.topics[0].attempted,5);assert.equal(d.topics[0].evidence,'review');assert.equal(d.coverage.tagged,5);
  assert.equal(d.coverage.historyComplete,false);assert.equal(d.difficulty.filter(r=>r.platform==='atcoder').length,1);
  assert.equal(d.review.length,3);assert.equal(d.periods.recent.solved,3);assert.equal(d.periods.previous.solved,0);
});
test('visualization scripts parse and use local theme-aware rendering without remote chart dependencies',()=>{
  for(const file of ['algorithm-charts.js','algorithm-center.js','algorithm-cookie-sync.js'])assert.doesNotThrow(()=>new Script(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')));
  const source=fs.readFileSync(new URL('../algorithm-charts.js',import.meta.url),'utf8');
  assert.ok(!/innerHTML|fetch\(|localStorage|sessionStorage/.test(source));assert.match(source,/aria-label/);
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(index.indexOf('algorithm-charts.js')<index.indexOf('algorithm-center.js'));
});

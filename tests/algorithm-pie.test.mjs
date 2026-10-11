import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Node {
  constructor(tag){this.tag=tag;this.value=tag==='select'?'all':undefined;this.children=[];this.attrs={};this.events={};this.style={};this.dataset={};this.className='';this.textContent='';this.classList={add:name=>{this.className+=' '+name;}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this.attrs[name]=String(value);if(name==='class')this.className=String(value);}
  addEventListener(name,handler){this.events[name]=handler;}
  get childElementCount(){return this.children.length;}
}
function walk(node){return [node,...node.children.flatMap(walk)];}
function mount(topics){
  const window={},root=new Node('root');
  vm.runInNewContext(fs.readFileSync(new URL('../algorithm-charts.js',import.meta.url),'utf8'),{
    window,document:{createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)},
    Option:function(label,value){const n=new Node('option');n.textContent=label;n.value=value;return n;}
  });
  window.KnowledgeAlgorithmCharts.render(root,{aggregate:{platforms:[]},platforms:[],generatedAt:'2026-10-11T00:00:00Z',months:[],heatmap:[],verdicts:[],
    diagnostics:{topics,coverage:{attempted:10,tagged:10,rated:0,historyComplete:true},difficulty:[],periods:{recent:{},previous:{}},review:[]}}, {language:'zh'});
  return root;
}
const topic=(tag,attempted,solved)=>({tag,attempted,solved,completion:Math.round(solved/attempted*1000)/10,evidence:'developing'});
test('pie shares use tag occurrences, includes every category, and legend selection shows exact completion',()=>{
  const root=mount([topic('math',8,6),topic('dp',2,1)]),nodes=walk(root);
  const keys=nodes.filter(n=>n.className==='algorithm-pie-key');
  assert.equal(keys.length,2);assert.match(keys[0].attrs['aria-label'],/数学 · 8 题 · 80.0%/);
  keys[1].events.click();assert.equal(keys[1].attrs['aria-pressed'],'true');assert.equal(keys[0].attrs['aria-pressed'],'false');
  const detail=nodes.find(n=>n.className==='algorithm-topic-detail');assert.ok(walk(detail).some(n=>n.textContent==='动态规划'));
  assert.ok(walk(detail).some(n=>n.textContent==='50%'));
  const filter=nodes.find(n=>n.tag==='select');filter.value='5';filter.events.change();
  const slices=walk(root).filter(n=>n.className==='algorithm-pie-slice');assert.equal(slices.length,1);
  assert.match(slices[0].attrs['aria-label'],/100.0%/);assert.equal((slices[0].attrs.d.match(/A 190/g)||[]).length,2);assert.equal((slices[0].attrs.d.match(/A 130/g)||[]).length,2);
  assert.equal(walk(mount(Array.from({length:20},(_,i)=>topic('tag'+i,1,1)))).filter(n=>n.className==='algorithm-pie-key').length,7);
  const many=walk(mount(Array.from({length:20},(_,i)=>topic('tag'+i,1,1))));
  assert.equal(many.filter(n=>n.className==='algorithm-pie-label').length,0);
  assert.equal(many.filter(n=>n.className==='algorithm-topic-detail-key').length,20);
  const other=many.find(n=>n.className==='algorithm-pie-key'&&n.attrs['aria-label'].includes('其他'));other.events.click();
  assert.equal(many.find(n=>n.className==='algorithm-topic-full').open,true);
});
test('empty filter and keyboard activation are supported without NaN slices',()=>{
  const root=mount([topic('math',3,1)]),nodes=walk(root),slice=nodes.find(n=>n.className==='algorithm-pie-slice');let prevented=false;
  slice.events.keydown({key:' ',preventDefault(){prevented=true;}});assert.equal(prevented,true);
  const filter=nodes.find(n=>n.tag==='select');filter.value='5';filter.events.change();
  assert.equal(walk(root).filter(n=>n.className==='algorithm-pie-slice').length,0);
  assert.ok(walk(root).some(n=>n.textContent==='当前筛选下暂无题型数据'));
});

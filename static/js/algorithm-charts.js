(function () {
  'use strict';
  window.KnowledgeAlgorithmCharts = { render };
  function render(root, data, options) {
    const t = (zh,en) => options.language === 'zh' ? zh : en;
    const el = (tag,cls,text) => { const n=document.createElement(tag); n.className=cls||''; if(text!=null)n.textContent=text; return n; };
    const names={codeforces:'Codeforces',atcoder:'AtCoder',luogu:t('洛谷','Luogu'),nowcoder:t('牛客','Nowcoder'),leetcode:t('力扣','LeetCode')};
    const section=(title,note)=>{const n=el('section','algorithm-panel algorithm-chart-panel');n.append(el('h2','',title),el('p','algorithm-note',note));return n;};
    const grid=el('div','algorithm-grid algorithm-visuals');root.append(grid);
    function bars(node,rows,unit,stack=false){
      const max=Math.max(1,...rows.map(r=>r.value));
      if(!rows.length)node.append(el('p','algorithm-note',t('暂无可分析数据','No analyzable data yet')));
      for(const r of rows){
        const row=el('div','algorithm-chart-row'),label=el('div','algorithm-chart-label');
        label.append(el('span','',r.name),el('strong','',r.value+' '+unit));
        const track=el('div','algorithm-chart-track'); track.setAttribute('role','img');
        track.setAttribute('aria-label',r.name+': '+r.value+' '+unit+(stack?' · '+r.solved+' '+t('已解决','solved'):''));
        const fill=el('span','algorithm-chart-fill');fill.style.width=(stack?r.solved:r.value)/max*100+'%';track.append(fill);
        if(stack){const rest=el('span','algorithm-chart-rest');rest.style.width=(r.value-r.solved)/max*100+'%';track.append(rest);}
        row.append(label,track);if(r.note)row.append(el('small','algorithm-note',r.note));node.append(row);
      }
    }
    function table(node,headers,rows){
      const wrap=el('div','algorithm-table-wrap'),table=el('table'),head=el('thead'),h=el('tr'),body=el('tbody');
      headers.forEach(v=>h.append(el('th','',v)));head.append(h);
      rows.forEach(values=>{const row=el('tr');values.forEach(v=>row.append(el('td','',v??'—')));body.append(row);});table.append(head,body);wrap.append(table);node.append(wrap);
    }
    const platform=section(t('过题量 · 平台分布','Solve volume · platform distribution'),t('平台合计，不是跨站去重；牛客包含 ACM 与 Tracker 分区合计。','Platform sums, not cross-site deduplication. Nowcoder sums ACM and Tracker sections.'));
    bars(platform,(data.aggregate?.platforms||[]).map(p=>({name:names[p.platform]||p.platform,value:p.solved})),t('题','problems'));grid.append(platform);
    const d=data.diagnostics;
    const coverage=section(t('分析覆盖与可信范围','Analysis coverage & limitations'),t('下列详细分析来自 CF / AtCoder 已导入的提交，不代表所有平台的完整能力。','Detailed analysis uses imported CF / AtCoder submissions, not full ability across all platforms.'));
    if(d){
      table(coverage,[t('项目','Measure'),t('已知样本','Known samples')],[
        [t('尝试过的题目','Attempted problems'),d.coverage.attempted],
        [t('有题型标签（仅 CF）','Topic-labelled (CF only)'),d.coverage.tagged+' / '+d.coverage.attempted],
        [t('有难度信息','Difficulty known'),d.coverage.rated+' / '+d.coverage.attempted],
        [t('历史导入状态','History import'),d.coverage.historyComplete?t('可获取历史已补齐','Available history imported'):t('不完整，结论仅代表当前样本','Incomplete; conclusions reflect current samples')]
      ]);
    }
    grid.append(coverage);
    const trend=section(t('近 12 个月 · 首次过题趋势','12 months · first-solve trend'),t('CF / AtCoder；重复 AC 不重复计数。缺失历史不能当作真实没有训练。','CF / AtCoder; repeated ACs are not counted again. Missing history does not prove no practice.'));
    const end=new Date(Date.parse(data.generatedAt)+8*3600000),series=[];
    for(let i=11;i>=0;i--){const date=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-i,1));const key=date.toISOString().slice(0,7);series.push({label:key,value:data.months.find(m=>m.month===key)?.count||0});}
    line(trend,series);grid.append(trend);
    const activity=section(t('近 91 天 · 训练日历','91 days · practice calendar'),t('CF / AtCoder；按提交次数着色。悬停或键盘聚焦查看日期、提交及首次过题数，时区为上海。','CF / AtCoder; color shows submissions. Hover or focus for date, submissions and first solves. Shanghai time.'));
    const calendar=el('div','algorithm-heatmap');const maxDay=Math.max(1,...data.heatmap.map(day=>day.submissions));
    data.heatmap.forEach(day=>{const n=el('button','algorithm-day');n.type='button';n.dataset.level=day.submissions?String(Math.min(4,Math.ceil(day.submissions/maxDay*4))):'0';
      const label=day.date+' · '+day.submissions+' '+t('次提交','submissions')+' · '+day.solved+' '+t('首次过题','first solves');n.title=label;n.setAttribute('aria-label',label);calendar.append(n);});
    activity.append(calendar,el('p','algorithm-note',t('浅 → 深：少 → 多。无已导入记录不代表当天没有训练。','Light → dark: fewer → more. No imported records does not prove no practice.')));grid.append(activity);
    const topicNames={math:'数学',greedy:'贪心',implementation:'模拟与实现','brute force':'暴力枚举','constructive algorithms':'构造','number theory':'数论',sortings:'排序',strings:'字符串','data structures':'数据结构',dp:'动态规划',graphs:'图论',trees:'树',geometry:'几何','binary search':'二分查找','two pointers':'双指针','dfs and similar':'搜索','shortest paths':'最短路',dsu:'并查集',combinatorics:'组合数学',probabilities:'概率',bitmasks:'位运算',games:'博弈','divide and conquer':'分治','meet-in-the-middle':'折半搜索',hashing:'哈希',flows:'网络流','graph matchings':'图匹配','string suffix structures':'后缀结构',fft:'快速傅里叶变换','2-sat':'2-SAT',matrices:'矩阵',ternary:'三分查找','expression parsing':'表达式解析','chinese remainder theorem':'中国剩余定理',schedules:'调度',interactive:'交互题'};
    const topicName=tag=>options.language==='zh'?(topicNames[tag]||tag):tag;
    const topics=section(t('题型分布','Problem topic distribution'),t('仅 CF 官方标签；占比按当前筛选的标签次数计算。一题可有多个标签，不是去重题数，也不是能力评分。点击扇区或图例查看完成情况。','CF official tags only. Shares use tag occurrences in the current filter, not unique problems or ability scores. Click a slice or legend for completion details.'));
    topics.classList.add('algorithm-topics-panel');
    const filter=el('select');filter.setAttribute('aria-label',t('题型样本筛选','Topic sample filter'));
    filter.append(new Option(t('显示全部题型','All topics'),'all'),new Option(t('只看至少 5 题的样本','At least 5 problems'),'5'));
    const topicBody=el('div');topics.append(filter,topicBody);
    const refreshTopics=()=>{
      topicBody.replaceChildren();
      let rows=(d?.topics||[]).filter(r=>r.attempted>0&&(filter.value==='all'||r.attempted>=5)).sort((a,b)=>b.attempted-a.attempted);
      if(!rows.length){topicBody.append(el('p','algorithm-note',t('当前筛选下暂无题型数据','No topics in this filter')));return;}
      const total=rows.reduce((n,r)=>n+r.attempted,0),ns='http://www.w3.org/2000/svg';
      const allRows=rows;
      if(rows.length>7){
        const main=rows.filter(r=>r.attempted/total>=0.05).slice(0,6),members=rows.filter(r=>!main.includes(r));
        const attempted=members.reduce((n,r)=>n+r.attempted,0),solved=members.reduce((n,r)=>n+r.solved,0);
        rows=[...main,{tag:'__other',attempted,solved,completion:Math.round(solved/attempted*1000)/10,members}];
      }
      const displayName=r=>r.members?t('其他题型','Other topics'):topicName(r.tag);
      topicBody.append(el('p','algorithm-note',allRows.length+' '+t('种题型 · ',' topics · ')+total+' '+t('次标签记录 · 小占比归入其他，完整明细在下方','tag occurrences · Smaller categories grouped; full details below')));
      const layout=el('div','algorithm-pie-layout'),svg=document.createElementNS(ns,'svg'),legend=el('div','algorithm-pie-legend'),detail=el('div','algorithm-topic-detail');
      svg.setAttribute('viewBox','0 0 440 440');svg.setAttribute('class','algorithm-topic-pie');svg.setAttribute('role','group');svg.setAttribute('aria-label',t('题型分布饼图','Problem topic pie chart'));detail.setAttribute('aria-live','polite');
      const centerTitle=document.createElementNS(ns,'text'),centerValue=document.createElementNS(ns,'text'),centerCaption=document.createElementNS(ns,'text');
      [[centerTitle,198,'algorithm-donut-title'],[centerValue,240,'algorithm-donut-value'],[centerCaption,270,'algorithm-donut-caption']].forEach(([n,y,cls])=>{n.setAttribute('x','220');n.setAttribute('y',y);n.setAttribute('text-anchor','middle');n.setAttribute('class',cls);});
      const controls=[];let angle=-Math.PI/2;
      const polar=(a,r=190)=>[220+r*Math.cos(a),220+r*Math.sin(a)];
      const select=(index,customRow)=>{
        controls.forEach((c,i)=>{c.path.setAttribute('aria-pressed',String(i===index));c.button.setAttribute('aria-pressed',String(i===index));});
        const r=customRow||rows[index];detail.replaceChildren();
        centerTitle.textContent=displayName(r).length>12?displayName(r).slice(0,11)+'…':displayName(r);centerValue.textContent=(r.attempted/total*100).toFixed(1)+'%';centerCaption.textContent=r.attempted+' / '+total+' '+t('次标签','tags');
        const title=el('div','algorithm-topic-title');title.append(el('h3','',displayName(r)));if(options.language==='zh'&&!r.members&&topicName(r.tag)!==r.tag)title.append(el('small','algorithm-note',r.tag));
        const metrics=el('div','algorithm-topic-metrics');
        [[r.members?t('标签次数','Tag occurrences'):t('尝试题数','Attempted'),r.attempted],[r.members?t('已解决标签','Solved tags'):t('已解决','Solved'),r.solved],[r.members?t('待解决标签','Unresolved tags'):t('待解决','Unresolved'),r.attempted-r.solved],[t('完成率','Completion'),r.completion+'%']].forEach(([label,value])=>{const n=el('div');n.append(el('span','algorithm-note',label),el('strong','',value));metrics.append(n);});
        detail.append(title,metrics);if(r.members){detail.append(el('p','algorithm-note',t('这里是多个题型的标签计数合计，不是去重题数。展开下方明细查看各题型。','Aggregated tag counts, not unique problems. Expand the details below for individual topics.')));fullDetails.open=true;}
        else if(r.attempted<5)detail.append(el('p','algorithm-note',t('样本少于 5 题，不据此判断能力。','Fewer than 5 samples; do not infer ability.')));
      };
      const palette=['#78cbb4','#779fda','#b49cda','#d7b888','#87becb','#cb9cba','#77879a'];
      rows.forEach((r,i)=>{
        const share=r.attempted/total,end=angle+share*Math.PI*2,startPoint=polar(angle),endPoint=polar(end),innerEnd=polar(end,130),innerStart=polar(angle,130),path=document.createElementNS(ns,'path'),color=r.members?palette[6]:palette[i];
        // Equal endpoints make a single full-circle arc empty; use two semicircles instead.
        const shape=rows.length===1?'M 220 30 A 190 190 0 1 1 220 410 A 190 190 0 1 1 220 30 Z M 220 90 A 130 130 0 1 0 220 350 A 130 130 0 1 0 220 90 Z':'M '+startPoint.join(' ')+' A 190 190 0 '+(share>0.5?1:0)+' 1 '+endPoint.join(' ')+' L '+innerEnd.join(' ')+' A 130 130 0 '+(share>0.5?1:0)+' 0 '+innerStart.join(' ')+' Z';
        path.setAttribute('d',shape);path.setAttribute('fill',color);path.setAttribute('class','algorithm-pie-slice');path.setAttribute('role','button');path.setAttribute('tabindex','0');
        const label=displayName(r)+' · '+r.attempted+' '+t('题','problems')+' · '+(share*100).toFixed(1)+'%';path.setAttribute('aria-label',label);
        const tooltip=document.createElementNS(ns,'title');tooltip.textContent=label;path.append(tooltip);
        path.addEventListener('click',()=>select(i));path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(i);}});svg.append(path);
        const button=el('button','algorithm-pie-key');button.type='button';button.setAttribute('aria-label',label);button.addEventListener('click',()=>select(i));
        const dot=el('span','algorithm-pie-dot');dot.style.background=color;dot.setAttribute('aria-hidden','true');
        const name=el('span','algorithm-pie-name',displayName(r));if(r.members)name.append(el('small','algorithm-note',r.members.length+' '+t('种题型 · 点击展开','topics · click to expand')));else if(options.language==='zh'&&topicName(r.tag)!==r.tag)name.append(el('small','algorithm-note',r.tag));
        const count=el('span','algorithm-pie-count',r.attempted+' '+t('题','problems'));count.append(el('small','algorithm-note',(share*100).toFixed(1)+'%'));
        button.append(dot,name,count);legend.append(button);controls.push({path,button});angle=end;
      });
      const fullDetails=el('details','algorithm-topic-full');fullDetails.append(el('summary','',t('查看全部题型明细','View all topic details')+' · '+allRows.length));
      const fullList=el('div','algorithm-topic-full-list');
      allRows.forEach(r=>{const button=el('button','algorithm-topic-detail-key',topicName(r.tag)+' · '+r.attempted+' '+t('题','problems')+' · '+r.completion+'% '+t('完成','complete'));button.type='button';button.addEventListener('click',()=>select(Math.max(0,rows.findIndex(row=>row===r||row.members?.includes(r))),r));fullList.append(button);});fullDetails.append(fullList);
      svg.append(centerTitle,centerValue,centerCaption);layout.append(svg,legend);topicBody.append(layout,detail,fullDetails);select(0);
    };
    filter.addEventListener('change',refreshTopics);refreshTopics();grid.append(topics);
    const verdicts=section(t('提交判定 · 错误分布','Submission verdicts · error distribution'),t('CF / AtCoder；这是提交次数，不是题目数量。编译错误、超时等反映调试方向，不直接等于知识薄弱。','CF / AtCoder submission counts, not problem counts. Errors suggest debugging priorities, not necessarily weak knowledge.'));
    bars(verdicts,data.verdicts.slice(0,10).map(r=>({name:r.name,value:r.count})),t('次','submissions'));grid.append(verdicts);
    for(const p of data.platforms){
      const difficulty=section(names[p.platform]+t(' · 难度分布',' · difficulty distribution'),t('实色已解决 / 淡色未解决；每个平台保留自己的难度尺度，未知难度单列。','Solid solved / faded unresolved. Each platform keeps its own difficulty scale; unknown difficulty is separate.'));
      const rows=(d?.difficulty||[]).filter(r=>r.platform===p.platform).sort((a,b)=>(a.bucket==='unrated'?Infinity:+a.bucket)-(b.bucket==='unrated'?Infinity:+b.bucket));
      bars(difficulty,rows.map(r=>({name:r.bucket==='unrated'?t('未知难度','Unknown difficulty'):r.bucket+'–'+(+r.bucket+399),value:r.attempted,solved:r.solved})),t('题','problems'),true);grid.append(difficulty);
    }
    // Snapshot difficulty categories remain separate from numeric CF/AtCoder scales.
    for(const p of data.aggregate?.platforms||[]){if(!p.difficulty?.length)continue;
      const panel=section((names[p.platform]||p.platform)+t(' · 当前难度分布',' · current difficulty distribution'),t('来自平台题目进度快照；不是提交通过率。','Provider problem-progress snapshot, not submission acceptance.'));
      const bucketNames={EASY:t('简单','Easy'),MEDIUM:t('中等','Medium'),HARD:t('困难','Hard')};
      bars(panel,p.difficulty.map(r=>({name:bucketNames[r.name]||r.name,value:r.attempted,solved:r.solved})),t('题','problems'),true);grid.append(panel);
    }
    const ability=section(t('能力证据 · 题型诊断','Ability evidence · topic diagnosis'),t('基于至少 5 道尝试题做训练建议，仍不是标准化能力测试。题目选择、历史缺失和难度差异会影响结果。','Practice guidance uses at least 5 attempted problems, not a standardized ability test. Selection, missing history and difficulty affect results.'));
    const states={insufficient:t('样本不足','Insufficient sample'),review:t('优先复盘','Review first'),consistent:t('当前样本较稳定','Consistent in this sample'),developing:t('继续积累','Keep practicing')};
    table(ability,[t('题型','Topic'),t('通过/尝试','Solved/tried'),t('一次通过率','First-try solve rate'),t('每题平均提交','Attempts/problem'),t('建议','Guidance')],(d?.topics||[]).slice(0,16).map(r=>[r.tag,r.solved+'/'+r.attempted,r.firstTryRate==null?'—':r.firstTryRate+'%',r.averageAttempts,states[r.evidence]]));
    ability.append(el('p','algorithm-note',t('一次通过率分母是已解决题；平均提交包含重复 AC。未尝试题型是未知，不是能力为零。','First-try rate uses solved problems as denominator; average submissions includes repeated AC. Unattempted topics are unknown, not zero ability.')));root.append(ability);
    const periods=section(t('训练效率 · 周期对比','Practice efficiency · period comparison'),t('CF / AtCoder 已导入记录；比较首次通过时间在近 30 天与前 30 天的题目，不推测训练耗时。','Imported CF / AtCoder records; compares problems first solved in recent and previous 30-day periods, not time spent practicing.'));
    table(periods,[t('周期','Period'),t('首次过题','First solves'),t('平均提交/题','Attempts/problem'),t('一次通过率','First-try rate')],d?[['0–30 '+t('天','days'),d.periods.recent.solved,d.periods.recent.averageAttempts,d.periods.recent.firstTryRate==null?'—':d.periods.recent.firstTryRate+'%'],['30–60 '+t('天','days'),d.periods.previous.solved,d.periods.previous.averageAttempts,d.periods.previous.firstTryRate==null?'—':d.periods.previous.firstTryRate+'%']]:[]);root.append(periods);
    const review=section(t('题目分析 · 优先复盘','Problem analysis · review priorities'),t('按已判定失败次数降序，优先复盘反复尝试但尚未通过的题目。最多展示 30 题，仅覆盖导入记录。','Ranked by judged failures: review repeatedly attempted, unresolved problems first. Up to 30 problems, imported records only.'));
    const list=el('div','algorithm-review-list'),more=el('details'),extra=el('div','algorithm-review-list');
    more.append(el('summary','',t('展开更多待复盘题目','Expand more review problems')),extra);
    (d?.review||[]).forEach((p,index)=>{const item=el('div','algorithm-review-item'),link=el('a','',p.name||p.key);
      if(/^https:\/\/(codeforces\.com|atcoder\.jp)\//.test(p.url||'')){link.href=p.url;link.target='_blank';link.rel='noopener noreferrer';}
      item.append(link,el('span','algorithm-note',(names[p.platform]||p.platform)+' · '+p.attempts+' '+t('次提交','submissions')+' / '+p.failures+' '+t('次判定失败','judged failures')+' · '+(p.tags.join(' · ')||t('类型未知','Topics unknown'))));(index<8?list:extra).append(item);});
    if(!d?.review.length)list.append(el('p','algorithm-note',t('当前记录中没有已判定失败的待复盘题，不代表所有平台均已完成。','No judged-failure review problems in available records; this does not imply completion across every platform.')));review.append(list);if(extra.childElementCount)review.append(more);root.append(review);
    function line(node,points){
      const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 230');svg.setAttribute('class','algorithm-line-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label',t('每月首次过题数量','Monthly first-solve counts'));
      const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!=null)n.textContent=text;svg.append(n);return n;};
      const max=Math.max(1,...points.map(p=>p.value));
      for(let i=0;i<=3;i++){const y=185-i*50;add('line',{x1:40,x2:575,y1:y,y2:y,class:'chart-grid'});add('text',{x:32,y:y+4,'text-anchor':'end',class:'chart-axis'},Math.round(max*i/3));}
      const xy=points.map((p,i)=>[45+i*525/Math.max(1,points.length-1),185-p.value/max*150]);
      add('polyline',{points:xy.map(p=>p.join(',')).join(' '),fill:'none',class:'chart-series'});
      points.forEach((p,i)=>{const [x,y]=xy[i],dot=add('circle',{cx:x,cy:y,r:4,tabindex:0,class:'chart-point','aria-label':p.label+': '+p.value});const title=document.createElementNS(ns,'title');title.textContent=p.label+': '+p.value;dot.append(title);
        if(i%2===0||i===points.length-1)add('text',{x,y:210,'text-anchor':'middle',class:'chart-axis'},p.label.slice(2));});node.append(svg);
      const details=el('details');details.append(el('summary','',t('查看趋势原始数值','View underlying trend values')));table(details,[t('月份','Month'),t('首次过题','First solves')],points.map(p=>[p.label,p.value]));node.append(details);
    }
  }
})();

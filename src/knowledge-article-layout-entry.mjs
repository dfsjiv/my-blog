import { normalizeArticleLayout, inspectArticleScript } from '../functions/lib/article-layout-policy.mjs';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const template = {
  mode: 'custom',
  html: '<article class="my-article">\n<header><small>{{category}} · {{date}}</small>\n<h1>{{title}}</h1><p>{{author}}</p></header>\n{{cover}}\n<section class="prose">{{content}}</section>\n<button class="back-top" type="button">回到顶部 ↑</button>\n</article>',
  css: '.my-article{max-width:900px;margin:auto;padding:48px 24px}.my-article header{border-bottom:1px solid var(--page-line);padding-bottom:32px;margin-bottom:32px}.my-article small{color:var(--page-accent);letter-spacing:.12em}.my-article h1{font-size:clamp(28px,5vw,46px);font-weight:400;line-height:1.35}.article-cover{width:100%;max-height:420px;object-fit:cover;margin-bottom:30px}.back-top{border:1px solid var(--page-line);color:var(--page-text);background:var(--page-surface);padding:12px 18px;cursor:pointer;transition:transform .2s}.back-top:hover{transform:translateY(-3px)}',
  js: 'const button = document.querySelector(".back-top");\nbutton.addEventListener("click", () => {\n  document.querySelector(".my-article").scrollIntoView({behavior: "smooth"});\n});'
};
const motionCss = '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}';
const minimalCss = '*{box-sizing:border-box}body{margin:0}.knowledge-code-toolbar,.knowledge-heading-anchor{display:none}';
const baseCss = '*{box-sizing:border-box}html{color-scheme:light dark}body{margin:0;background:var(--page-bg);color:var(--page-text);font:16px/1.85 system-ui,sans-serif;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}pre{overflow:auto;padding:20px;background:var(--page-surface)}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;display:block;overflow:auto;max-width:100%}th,td{padding:8px 14px;border:1px solid var(--page-line)}a{color:var(--page-accent)}.knowledge-code-toolbar,.knowledge-heading-anchor{display:none}.knowledge-align-center{text-align:center}';

function palette() {
  const shell = document.getElementById('elegantShell') || document.body, style = getComputedStyle(shell);
  const light = shell.dataset.theme === 'light';
  const fallback = light ? ['#f7f8fa','#ffffff','#202a35','#637185','#1675b8','#dce3ea'] : ['#0b1118','#141e29','#e7edf5','#9aaabb','#69b9ed','#293645'];
  return ['bg','surface','text','muted','accent','line'].map((key,i) => '--page-' + key + ':' + (style.getPropertyValue('--knowledge-' + ({bg:'bg',surface:'surface',text:'text',muted:'muted',accent:'primary',line:'border'}[key])).trim() || fallback[i])).join(';');
}

async function buildDocument(design, post, channel, scripts) {
  normalizeArticleLayout(design, 'admin');
  const content = el('div');
  if (window.KnowledgeFeatures && /\\[\[(]|\$/.test(post.contentMarkdown || post.content || '')) await window.KnowledgeFeatures.ensure('math');
  if (post.contentFormat === 'html') window.KnowledgeMarkdown.renderHtml(post.originalContent || post.content || '', content);
  else window.KnowledgeMarkdown.render(post.contentMarkdown || post.content || '', content);
  // The existing renderer may defer KaTeX until the math bundle finishes loading.
  await new Promise(resolve => requestAnimationFrame(resolve));
  const slot = { title: esc(post.title), author: esc(post.author || window.authManager?.getCurrentUser?.().username || ''), date: esc((post.publishedAt || new Date().toISOString()).slice(0,10)), category: esc(post.category || ''), content: content.innerHTML, cover: '' };
  if (post.coverUrl) { const image = el('img', 'article-cover'); image.src = post.coverUrl; image.alt = ''; slot.cover = image.outerHTML; }
  const source = design.html.replace(/\{\{(title|author|date|category|content|cover)\}\}/g, (_,key) => { const tag=['content','cover'].includes(key)?'div':'span';return '<'+tag+' data-article-slot="'+key+'"></'+tag+'>'; });
  const fragment = window.DOMPurify.sanitize(source, { RETURN_DOM_FRAGMENT:true, USE_PROFILES:{html:true,svg:true,svgFilters:true}, ADD_ATTR:['data-article-slot'], FORBID_TAGS:['script','iframe','object','embed','form','input','textarea','select','base','meta','link','style','math','foreignObject','animate','animateMotion','animateTransform','set','use','image','feImage'], FORBID_ATTR:['srcdoc','autofocus'] });
  const wrap = el('div'); wrap.append(fragment);
  if (!wrap.querySelector('[data-article-slot="content"]')) throw Error('清理 HTML 后找不到正文区域，请保留 {{content}}，不要将它写在注释或属性中。');
  wrap.querySelectorAll('[data-article-slot]').forEach(n => { const key=n.dataset.articleSlot; if (Object.hasOwn(slot,key)) n.innerHTML=slot[key]; });
  // Links cannot navigate the isolated frame to a remote page. Native reading remains available outside it.
  wrap.querySelectorAll('a,area').forEach(n => { if (!(n.getAttribute('href') || '').startsWith('#')) n.removeAttribute('href'); n.removeAttribute('target'); n.removeAttribute('ping'); });
  wrap.querySelectorAll('[src],[srcset],[poster]').forEach(n => {
    n.removeAttribute('srcset');
    for (const key of ['src','poster']) if (n.hasAttribute(key)) {
      try { const url=new URL(n.getAttribute(key),location.origin); if (url.origin !== location.origin && !/^data:image\/(png|jpeg|webp|gif);/i.test(url.href)) n.removeAttribute(key); else n.setAttribute(key,url.href); } catch { n.removeAttribute(key); }
    }
  });
  const nonce = crypto.randomUUID().replaceAll('-','');
  const origin = location.origin;
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${origin}; img-src ${origin} data:; font-src ${origin}; media-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';`;
  const code = scripts ? inspectArticleScript(design.js).instrumented : '';
  const runtime = `(()=>{'use strict';const channel=${JSON.stringify(channel)};const report=()=>parent.postMessage({channel,height:Math.max(document.body.scrollHeight,document.body.offsetHeight)},'*');new ResizeObserver(report).observe(document.body);addEventListener('load',report);let total=0,burst=0,started=performance.now();const __zhenGuard=()=>{const now=performance.now();if(now-started>100){burst=0;started=now}if(++total>200000||++burst>2000)throw Error('文章效果超过运行预算，已停止');};const nativeTimeout=window.setTimeout.bind(window),nativeRaf=window.requestAnimationFrame.bind(window);let timers=0;const setTimeout=(fn,ms)=>{if(typeof fn!=='function'||++timers>64)throw Error('计时器超过限制');return nativeTimeout(()=>{timers--;__zhenGuard();try{fn()}catch(e){console.warn(e.message)}},Math.max(16,Math.min(Number(ms)||16,60000)))};const requestAnimationFrame=fn=>{if(typeof fn!=='function'||++timers>64)throw Error('动画超过限制');return nativeRaf(t=>{timers--;__zhenGuard();try{fn(t)}catch(e){console.warn(e.message)}})};Object.defineProperties(window,{setTimeout:{value:setTimeout,writable:false},requestAnimationFrame:{value:requestAnimationFrame,writable:false}});try{(()=>{${code}\n})();}catch(e){console.warn('文章效果已停止：'+e.message)}report();})();`;
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="'+origin+'/assets/vendor/katex/katex.min.css"><style>:root{'+palette()+'}'+(design.baseStyles==='minimal'?minimalCss:baseCss)+motionCss+'\n'+design.css.replace(/<\/style/gi,'<\\/style')+'</style></head><body>'+wrap.innerHTML+'<script nonce="'+nonce+'">'+runtime.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
}

async function mount(root, {design,post,signal,scripts=true,preview=false}) {
  const channel=crypto.randomUUID(), frame=el('iframe','article-layout-frame');
  frame.title='本篇文章的自定义页面'; frame.setAttribute('sandbox','allow-scripts'); frame.referrerPolicy='no-referrer';
  const html=await buildDocument(design,post,channel,scripts);
  if(signal?.aborted) return ()=>{};
  const onMessage=event=>{if(event.source===frame.contentWindow && event.data?.channel===channel && Number.isFinite(event.data.height)) frame.style.height=Math.min(100000,Math.max(240,Math.ceil(event.data.height)))+'px';};
  window.addEventListener('message',onMessage); frame.srcdoc=html; root.replaceChildren(frame);
  const resize=()=>root.style.setProperty('--article-viewport-width',document.documentElement.clientWidth+'px');
  const fullWidth=!preview && design.width==='full';
  root.classList.toggle('article-layout-viewport',fullWidth);
  if(fullWidth){resize();window.addEventListener('resize',resize);}
  let active=true, revision=0, lastPalette=palette();
  const refreshTheme=async()=>{const next=palette();if(!active||next===lastPalette)return;lastPalette=next;const ticket=++revision;try{const updated=await buildDocument(design,post,channel,scripts);if(active&&ticket===revision)frame.srcdoc=updated;}catch{/* Keep the readable previous document. */}};
  const observer=new MutationObserver(refreshTheme), shell=document.getElementById('elegantShell');
  if(shell)observer.observe(shell,{attributes:true,attributeFilter:['data-theme','style']});
  const media=window.matchMedia('(prefers-color-scheme:dark)');media.addEventListener('change',refreshTheme);
  const cleanup=()=>{active=false;revision++;observer.disconnect();media.removeEventListener('change',refreshTheme);window.removeEventListener('resize',resize);window.removeEventListener('message',onMessage);frame.remove();root.classList.remove('article-layout-viewport');root.style.removeProperty('--article-viewport-width');signal?.removeEventListener('abort',cleanup);};
  signal?.addEventListener('abort',cleanup,{once:true}); return cleanup;
}

function openEditor({design, getPost, role, onApply, signal}) {
  const dialog=el('dialog','article-layout-dialog'), controller=new AbortController();
  let cleanup=()=>{}, revision=0, closed=false;
  const header=el('header','article-layout-header'), title=el('h2','','本篇文章 · 页面设计');
  const close=el('button','knowledge-route-button','关闭'); close.type='button'; close.onclick=()=>dialog.close(); header.append(title,close);
  const intro=el('p','knowledge-note','只影响当前文章的详情页。正文由文章 / Markdown 自动填入；首页卡片外观在“帖子外观预览”中设置。');
  const mode=el('select'); mode.setAttribute('aria-label','文章页面模式'); mode.append(new Option('使用默认排版','default'),new Option('使用本篇自定义设计','custom')); mode.value=design?.mode || 'default';
  const options=el('div','article-layout-options');
  const width=el('select');width.setAttribute('aria-label','文章页面宽度');width.append(new Option('跟随网站内容宽度','content'),new Option('全宽画布 · 铺满视口','full'));width.value=design?.width || 'content';
  const baseStyles=el('select');baseStyles.setAttribute('aria-label','文章基础样式');baseStyles.append(new Option('保留基础阅读样式','reading'),new Option('空白样式 · 完全使用我的 CSS','minimal'));baseStyles.value=design?.baseStyles || 'reading';
  const expand=el('button','knowledge-route-button','展开编辑器');expand.type='button';expand.onclick=()=>{dialog.classList.toggle('is-expanded');expand.textContent=dialog.classList.contains('is-expanded')?'还原编辑器':'展开编辑器';};
  options.append(mode,width,baseStyles,expand);
  const tabs=el('div','article-layout-tools'), codes=el('div','article-layout-codes'), inputs={};
  for(const key of ['html','css','js']) {const button=el('button','knowledge-route-button',key.toUpperCase());button.type='button';const input=el('textarea');input.spellcheck=false;input.setAttribute('aria-label','文章设计 '+key.toUpperCase());input.value=design?.[key] ?? template[key];input.hidden=key!=='html';inputs[key]=input;button.onclick=()=>{Object.entries(inputs).forEach(([name,n])=>n.hidden=name!==key);tabs.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));};button.setAttribute('aria-pressed',String(key==='html'));input.oninput=()=>{revision++;status.textContent='有修改，点击“检测并预览”查看动态效果。'};tabs.append(button);codes.append(input);}
  const hint=el('p','knowledge-note','正文区域只需保留 {{content}}，标题、作者、日期、分类和封面均可自行选择放置。可自由使用 Grid / Flex、静态 SVG、CSS 动画、DOM 创建及受运行限额保护的 JS 循环。全宽画布可铺满视口；空白样式不套用博客正文排版。网络、账号存储和外层页面仍隔离。');
  const tools=el('div','article-layout-tools'), status=el('p','article-layout-status');status.setAttribute('role','status');
  const stage=el('div','article-layout-stage');
  const preview=el('button','knowledge-route-button','检测并预览'), apply=el('button','knowledge-route-button is-primary','应用到当前文章');preview.type=apply.type='button';
  const size=el('select');size.setAttribute('aria-label','页面设计预览宽度');size.append(new Option('桌面','100%'),new Option('平板 · 768px','768px'),new Option('手机 · 390px','390px'));size.onchange=()=>stage.style.width=size.value;
  [mode,width,baseStyles].forEach(input=>input.onchange=()=>{revision++;status.textContent='选项已变化，点击“检测并预览”刷新效果。';});
  const blank=el('button','knowledge-route-button','空白起稿');blank.type='button';
  const undoBlank=el('button','knowledge-route-button','撤回空白起稿');undoBlank.type='button';undoBlank.hidden=true;let beforeBlank=null;
  blank.onclick=()=>{beforeBlank={mode:mode.value,width:width.value,baseStyles:baseStyles.value,html:inputs.html.value,css:inputs.css.value,js:inputs.js.value};undoBlank.hidden=false;inputs.html.value='<main class="article-canvas">\n  {{content}}\n</main>';inputs.css.value='body{background:var(--page-bg);color:var(--page-text);font:16px/1.8 system-ui,sans-serif}\n.article-canvas{padding:clamp(20px,5vw,80px)}';inputs.js.value='';mode.value='custom';width.value='full';baseStyles.value='minimal';revision++;status.textContent='已替换为无模板约束的空白起稿，正文不受影响；可撤回，或检测预览后应用。';};
  undoBlank.onclick=()=>{if(!beforeBlank)return;for(const key of ['html','css','js'])inputs[key].value=beforeBlank[key];mode.value=beforeBlank.mode;width.value=beforeBlank.width;baseStyles.value=beforeBlank.baseStyles;beforeBlank=null;undoBlank.hidden=true;revision++;status.textContent='已恢复起稿前的设计。';};
  function value(){return normalizeArticleLayout({mode:mode.value,width:width.value,baseStyles:baseStyles.value,html:inputs.html.value,css:inputs.css.value,js:inputs.js.value},role);}
  preview.onclick=async()=>{const current=++revision;cleanup();stage.replaceChildren();try{const v=value();if(v.mode==='default'){status.textContent='已选择默认排版，使用编辑器底部“预览”查看。';return;}status.textContent='检测通过，正在生成隔离预览…';const result=await mount(stage,{design:v,post:getPost(),signal:controller.signal,preview:true});if(closed||current!==revision)result();else{cleanup=result;status.textContent='检测通过。悬停、点击可测试动态效果；预览使用当前未保存的正文。';}}catch(e){if(!closed)status.textContent=e.message;}};
  apply.onclick=()=>{try{const v=value();onApply(v);dialog.close();}catch(e){status.textContent=e.message;}};
  const file=el('input');file.type='file';file.accept='.html,.htm,text/html';file.hidden=true;
  const importButton=el('button','knowledge-route-button','导入 HTML');importButton.type='button';importButton.onclick=()=>file.click();
  file.onchange=async()=>{try{const f=file.files[0];file.value='';if(!f)return;if(f.size>256*1024)throw Error('HTML 文件超过 256 KiB');const parsed=new DOMParser().parseFromString(await f.text(),'text/html');const scripts=[...parsed.querySelectorAll('script')];if(scripts.some(n=>n.src))throw Error('不支持外部脚本，请提供本地 JS 代码');inputs.js.value=scripts.map(n=>n.textContent).join('\n');inputs.css.value=[...parsed.querySelectorAll('style')].map(n=>n.textContent).join('\n');parsed.querySelectorAll('script,style,link').forEach(n=>n.remove());inputs.html.value=parsed.body.innerHTML;mode.value='custom';revision++;status.textContent='已导入，尚未执行。请确保有 {{content}} 区域，再检测预览。';}catch(e){status.textContent=e.message;}};
  tools.append(preview,size,importButton,blank,undoBlank,apply,file);dialog.append(header,intro,options,tabs,codes,hint,tools,status,stage);(document.getElementById('elegantShell') || document.body).append(dialog);
  const abort=()=>dialog.close();signal?.addEventListener('abort',abort,{once:true});
  dialog.addEventListener('close',()=>{closed=true;revision++;cleanup();controller.abort();signal?.removeEventListener('abort',abort);dialog.remove();},{once:true});dialog.showModal();return abort;
}

window.KnowledgeArticleLayout={mount,openEditor,inspectArticleScript};

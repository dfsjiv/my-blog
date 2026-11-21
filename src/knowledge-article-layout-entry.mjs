import { enhanceArticleMarkup, installFrameEnhancements } from './knowledge-article-enhancements.mjs';
import { normalizeArticleLayout, inspectArticleScript, splitArticleDocument, articleHtmlText } from '../functions/lib/article-layout-policy.mjs';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const template = {
  mode: 'custom',
  html: '<article class="my-article">\n<header><small>{{category}} · {{date}}</small>\n<h1>{{title}}</h1><p>{{author}}</p></header>\n{{cover}}\n<section class="prose">{{content}}</section>\n<button class="back-top" type="button">回到顶部 ↑</button>\n</article>',
  css: '.my-article{max-width:900px;margin:auto;padding:48px 24px}.my-article header{border-bottom:1px solid var(--page-line);padding-bottom:32px;margin-bottom:32px}.my-article small{color:var(--page-accent);letter-spacing:.12em}.my-article h1{font-size:clamp(28px,5vw,46px);font-weight:400;line-height:1.35}.article-cover{width:100%;max-height:420px;object-fit:cover;margin-bottom:30px}.back-top{border:1px solid var(--page-line);color:var(--page-text);background:var(--page-surface);padding:12px 18px;cursor:pointer;transition:transform .2s}.back-top:hover{transform:translateY(-3px)}',
  js: 'const button = document.querySelector(".back-top");\nbutton.addEventListener("click", () => {\n  document.querySelector(".my-article").scrollIntoView({behavior: "smooth"});\n});'
};
const freeTemplate = {
  html: '<!DOCTYPE html>\n<html lang="zh-CN">\n<head><meta charset="UTF-8"><title>我的 HTML 文章</title></head>\n<body class="free-article">\n<article>\n  <h1>我的 HTML 文章</h1>\n  <p>直接在这里使用 HTML 编写正文，不需要正文占位符。</p>\n</article>\n</body>\n</html>',
  css: 'body{margin:0;background:var(--page-bg);color:var(--page-text);font:17px/1.9 system-ui,sans-serif}\narticle{max-width:1000px;margin:auto;padding:clamp(24px,6vw,80px)}\nh1{font-size:clamp(28px,5vw,48px);font-weight:400}', js: ''
};
const motionCss = '@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}';
const minimalCss = '*{box-sizing:border-box}body{margin:0}.knowledge-code-toolbar,.knowledge-heading-anchor{display:none}';
function storageKey(post){return Number.isSafeInteger(Number(post.id))&&Number(post.id)>0?'knowledge-article-storage:v1:'+Number(post.id):null;}
function readStorage(post){const key=storageKey(post);if(!key)return [];try{const entries=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(entries)&&new TextEncoder().encode(JSON.stringify(entries)).length<=4096?entries.filter(n=>Array.isArray(n)&&n.length===2&&n.every(v=>typeof v==='string')&&n[0].length<=64&&n[1].length<=1024).slice(0,32):[];}catch{return [];}}
const baseCss = '*{box-sizing:border-box}html{color-scheme:light dark}body{margin:0;background:var(--page-bg);color:var(--page-text);font:16px/1.85 system-ui,sans-serif;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}pre{overflow:auto;padding:20px;background:var(--page-surface)}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;display:block;overflow:auto;max-width:100%}th,td{padding:8px 14px;border:1px solid var(--page-line)}a{color:var(--page-accent)}.knowledge-code-toolbar,.knowledge-heading-anchor{display:none}.knowledge-align-center{text-align:center}';

function palette() {
  const shell = document.getElementById('elegantShell') || document.body, style = getComputedStyle(shell);
  const light = shell.dataset.theme === 'light';
  const fallback = light ? ['#f7f8fa','#ffffff','#202a35','#637185','#1675b8','#dce3ea'] : ['#0b1118','#141e29','#e7edf5','#9aaabb','#69b9ed','#293645'];
  return ['bg','surface','text','muted','accent','line'].map((key,i) => '--page-' + key + ':' + (style.getPropertyValue('--knowledge-' + ({bg:'bg',surface:'surface',text:'text',muted:'muted',accent:'primary',line:'border'}[key])).trim() || fallback[i])).join(';');
}

async function buildDocument(design, post, channel, scripts) {
  design = normalizeArticleLayout(design, 'admin');
  const content = el('div');
  const needsContent = design.mode !== 'free' || /\{\{content\}\}|data-article-slot=["']content["']/.test(design.html);
  if (needsContent) {
    if (window.KnowledgeFeatures && /\\[\[(]|\$/.test(post.contentMarkdown || post.content || '')) await window.KnowledgeFeatures.ensure('math');
    if (post.contentFormat === 'html') window.KnowledgeMarkdown.renderHtml(post.originalContent || post.content || '', content);
    else window.KnowledgeMarkdown.render(post.contentMarkdown || post.content || '', content);
  }
  // The existing renderer may defer KaTeX until the math bundle finishes loading.
  await new Promise(resolve => requestAnimationFrame(resolve));
  const slot = { title: esc(post.title), author: esc(post.author || window.authManager?.getCurrentUser?.().username || ''), date: esc((post.publishedAt || new Date().toISOString()).slice(0,10)), category: esc(post.category || ''), content: content.innerHTML, cover: '' };
  if (post.coverUrl) { const image = el('img', 'article-cover'); image.src = post.coverUrl; image.alt = ''; slot.cover = image.outerHTML; }
  const source = design.html.replace(/\{\{(title|author|date|category|content|cover)\}\}/g, (_,key) => { const tag=['content','cover'].includes(key)?'div':'span';return '<'+tag+' data-article-slot="'+key+'"></'+tag+'>'; });
  const free = design.mode === 'free';
  const fragment = window.DOMPurify.sanitize(source, { RETURN_DOM_FRAGMENT:!free, RETURN_DOM:free, WHOLE_DOCUMENT:free, USE_PROFILES:{html:true,svg:true,svgFilters:true}, ADD_ATTR:['data-article-slot'], FORBID_TAGS:['script','iframe','object','embed','form','textarea','select','base','meta','link','style','math','foreignObject','animate','animateMotion','animateTransform','set','use','image','feImage'], FORBID_ATTR:['srcdoc','autofocus'] });
  const wrap = el('div');
  let bodyAttributes = '', htmlAttributes = '';
  if (free) {
    const body = fragment.querySelector('body') || fragment;
    for (const key of ['class','style','lang','dir','data-theme']) {
      if (body.hasAttribute(key)) bodyAttributes += ' '+key+'="'+esc(body.getAttribute(key))+'"';
      if (fragment.hasAttribute(key)) htmlAttributes += ' '+key+'="'+esc(fragment.getAttribute(key))+'"';
    }
    wrap.append(...Array.from(body.childNodes));
  } else wrap.append(fragment);
  if (!free && !wrap.querySelector('[data-article-slot="content"]')) throw Error('清理 HTML 后找不到正文区域，请保留 {{content}}，不要将它写在注释或属性中。');
  if (!htmlAttributes.includes(' data-theme=')) { const shell=document.getElementById('elegantShell'); const dark=shell?.dataset.theme==='dark'||(!shell?.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);htmlAttributes+=' data-theme="'+(dark?'dark':'light')+'"'; }
  wrap.querySelectorAll('input').forEach(n=>{if(!['number','range','checkbox','radio','button'].includes((n.getAttribute('type')||'').toLowerCase()))n.remove();else ['name','form','formaction','autocomplete'].forEach(key=>n.removeAttribute(key));});
  wrap.querySelectorAll('[data-article-slot]').forEach(n => { const key=n.dataset.articleSlot; if (Object.hasOwn(slot,key)) n.innerHTML=slot[key]; });
  // Links cannot navigate the isolated frame to a remote page. Native reading remains available outside it.
  wrap.querySelectorAll('a,area').forEach(n => { if (!(n.getAttribute('href') || '').startsWith('#')) n.removeAttribute('href'); n.removeAttribute('target'); n.removeAttribute('ping'); });
  wrap.querySelectorAll('[src],[srcset],[poster]').forEach(n => {
    n.removeAttribute('srcset');
    for (const key of ['src','poster']) if (n.hasAttribute(key)) {
      try { const url=new URL(n.getAttribute(key),location.origin); if (url.origin !== location.origin && !/^data:image\/(png|jpeg|webp|gif);/i.test(url.href)) n.removeAttribute(key); else n.setAttribute(key,url.href); } catch { n.removeAttribute(key); }
    }
  });
  await enhanceArticleMarkup(wrap);
  const nonce = crypto.randomUUID().replaceAll('-','');
  const origin = location.origin;
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${origin}; img-src ${origin} data:; font-src ${origin}; media-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';`;
  const code = scripts ? inspectArticleScript(design.js).instrumented : '';
  const runtime = `(()=>{'use strict';const channel=${JSON.stringify(channel)};const report=()=>parent.postMessage({channel,height:Math.max(document.body.scrollHeight,document.body.offsetHeight)},'*');new ResizeObserver(report).observe(document.body);addEventListener('load',report);let total=0,burst=0,started=performance.now();const __zhenGuard=()=>{const now=performance.now();if(now-started>200){burst=0;started=now}if(++total>1000000||++burst>100000)throw Error('文章效果超过运行预算，已停止');};const nativeTimeout=window.setTimeout.bind(window),nativeRaf=window.requestAnimationFrame.bind(window);let timers=0;const setTimeout=(fn,ms)=>{if(typeof fn!=='function'||++timers>64)throw Error('计时器超过限制');return nativeTimeout(()=>{timers--;__zhenGuard();try{fn()}catch(e){console.warn(e.message)}},Math.max(16,Math.min(Number(ms)||16,60000)))};const requestAnimationFrame=fn=>{if(typeof fn!=='function'||++timers>64)throw Error('动画超过限制');return nativeRaf(t=>{timers--;__zhenGuard();try{fn(t)}catch(e){console.warn(e.message)}})};Object.defineProperties(window,{setTimeout:{value:setTimeout,writable:false},requestAnimationFrame:{value:requestAnimationFrame,writable:false}});(${installFrameEnhancements.toString()})(${JSON.stringify(channel)},${JSON.stringify(readStorage(post))});try{(()=>{${code}\n})();}catch(e){console.warn('文章效果已停止：'+e.message)}report();})();`;
  const manifest=JSON.parse(document.getElementById('knowledgeFeatureManifest').textContent);
  const libraryPaths=[];
  if(design.js.trim())libraryPaths.push('/assets/vendor/knowledge/purify.min.js');
  if(/\brenderMathInElement\b/.test(design.js))libraryPaths.push(...manifest.math.scripts);
  if(/\bhljs\b/.test(design.js))libraryPaths.push(...manifest.articleLibraries.scripts);
  const libraryTags=libraryPaths.map(path=>'<script nonce="'+nonce+'" src="'+esc(new URL(path,origin+'/').href)+'"></script>').join('');
  return '<!DOCTYPE html><html'+(htmlAttributes || ' lang="zh-CN"')+'><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="'+origin+'/assets/vendor/katex/katex.min.css"><style>:root{'+palette()+'}'+(design.baseStyles==='minimal'?minimalCss:baseCss)+motionCss+'.hljs-keyword,.hljs-type{color:#70b5d6}.hljs-comment{color:#82968f}.hljs-string,.hljs-meta{color:#9fbf86}.hljs-number,.hljs-literal{color:#d89bac}\n'+design.css.replace(/<\/style/gi,'<\\/style')+'</style></head><body'+bodyAttributes+'>'+wrap.innerHTML+libraryTags+'<script nonce="'+nonce+'">'+runtime.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
}

async function mount(root, {design,post,signal,scripts=true,preview=false}) {
  const channel=crypto.randomUUID(), frame=el('iframe','article-layout-frame');
  frame.title='本篇文章的自定义页面'; frame.setAttribute('sandbox','allow-scripts'); frame.referrerPolicy='no-referrer';
  const html=await buildDocument(design,post,channel,scripts);
  if(signal?.aborted) return ()=>{};
  let viewportPending=false;
  const viewport=()=>{if(viewportPending)return;viewportPending=true;requestAnimationFrame(()=>{viewportPending=false;if(!frame.isConnected)return;const box=frame.getBoundingClientRect();frame.contentWindow?.postMessage({channel,type:'viewport',scrollTop:Math.max(0,96-box.top),viewportHeight:Math.max(1,innerHeight-96)},'*');});};
  const onMessage=async event=>{
    if(event.source!==frame.contentWindow || event.data?.channel!==channel)return;
    const data=event.data;
    if(Number.isFinite(data.height)){frame.style.height=Math.min(100000,Math.max(240,Math.ceil(data.height)))+'px';viewport();}
    if(data.type==='storage'&&storageKey(post)&&Array.isArray(data.entries)&&data.entries.length<=32&&new TextEncoder().encode(JSON.stringify(data.entries)).length<=4096&&data.entries.every(n=>Array.isArray(n)&&n.length===2&&n.every(v=>typeof v==='string')&&n[0].length<=64&&n[1].length<=1024)){try{localStorage.setItem(storageKey(post),JSON.stringify(data.entries));}catch{}}
    if(data.type==='anchor'&&Number.isFinite(data.offset)){const box=frame.getBoundingClientRect();window.scrollTo({top:Math.max(0,window.scrollY+box.top+Math.min(frame.clientHeight,Math.max(0,data.offset))-96),behavior:'smooth'});}
    if(data.type==='copy'&&Number.isInteger(data.copyId)&&data.copyId>0&&data.copyId<1000000&&typeof data.text==='string'&&data.text.length<=262144&&document.hasFocus()&&(!navigator.userActivation||navigator.userActivation.isActive)){
      let ok=false;try{await navigator.clipboard.writeText(data.text);ok=true;}catch{
        const previous=document.activeElement,input=document.createElement('textarea');input.value=data.text;input.readOnly=true;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();try{ok=document.execCommand('copy');}catch{}input.remove();previous?.focus?.();
      }
      frame.contentWindow?.postMessage({channel,type:'copied',copyId:data.copyId,ok},'*');
    }
  };
  window.addEventListener('scroll',viewport,{passive:true,capture:true});window.addEventListener('resize',viewport);frame.addEventListener('load',viewport);
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
  const cleanup=()=>{active=false;revision++;observer.disconnect();media.removeEventListener('change',refreshTheme);window.removeEventListener('resize',resize);window.removeEventListener('resize',viewport);window.removeEventListener('scroll',viewport,true);window.removeEventListener('message',onMessage);frame.remove();root.classList.remove('article-layout-viewport');root.style.removeProperty('--article-viewport-width');signal?.removeEventListener('abort',cleanup);};
  signal?.addEventListener('abort',cleanup,{once:true}); return cleanup;
}

function openEditor({design, getPost, role, onApply, signal, initialMode}) {
  const dialog=el('dialog','article-layout-dialog'), controller=new AbortController();
  let cleanup=()=>{}, revision=0, closed=false;
  const header=el('header','article-layout-header'), title=el('h2','','本篇文章 · 页面设计');
  const close=el('button','knowledge-route-button','关闭'); close.type='button'; close.onclick=()=>dialog.close(); header.append(title,close);
  const intro=el('p','knowledge-note','默认模式使用原来的 Markdown / 富文本；自定义布局可插入原正文；完全自由模式直接用 HTML 写整篇文章，不需要 {{content}}。');
  const mode=el('select'); mode.setAttribute('aria-label','文章页面模式'); mode.append(new Option('使用默认排版','default'),new Option('自定义布局 · 插入原正文','custom'),new Option('完全自由 HTML · HTML 即正文','free')); mode.value=initialMode || design?.mode || 'default';
  const options=el('div','article-layout-options');
  const width=el('select');width.setAttribute('aria-label','文章页面宽度');width.append(new Option('跟随网站内容宽度','content'),new Option('全宽画布 · 铺满视口','full'));width.value=design?.width || (mode.value==='free'?'full':'content');
  const baseStyles=el('select');baseStyles.setAttribute('aria-label','文章基础样式');baseStyles.append(new Option('保留基础阅读样式','reading'),new Option('空白样式 · 完全使用我的 CSS','minimal'));baseStyles.value=design?.baseStyles || (mode.value==='free'?'minimal':'reading');
  const expand=el('button','knowledge-route-button','展开编辑器');expand.type='button';expand.onclick=()=>{dialog.classList.toggle('is-expanded');expand.textContent=dialog.classList.contains('is-expanded')?'还原编辑器':'展开编辑器';};
  options.append(mode,width,baseStyles,expand);
  const tabs=el('div','article-layout-tools'), codes=el('div','article-layout-codes'), inputs={};
  for(const key of ['html','css','js']) {const button=el('button','knowledge-route-button',key.toUpperCase());button.type='button';const input=el('textarea');input.spellcheck=false;input.setAttribute('aria-label','文章设计 '+key.toUpperCase());input.value=design?.[key] ?? (mode.value==='free'?freeTemplate:template)[key];input.hidden=key!=='html';inputs[key]=input;button.onclick=()=>{Object.entries(inputs).forEach(([name,n])=>n.hidden=name!==key);tabs.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===button)));};button.setAttribute('aria-pressed',String(key==='html'));input.oninput=()=>{revision++;status.textContent='有修改，点击“检测并预览”查看动态效果。'};tabs.append(button);codes.append(input);}
  const hint=el('p','knowledge-note','自定义布局需保留 {{content}}；完全自由 HTML 模式无需占位符，HTML 就是本篇正文。可自由使用 Grid / Flex、静态 SVG、CSS 动画、DOM 创建及受运行限额保护的 JS 循环。全宽画布可铺满视口；空白样式不套用博客正文排版。网络、账号存储和外层页面仍隔离。');
  const tools=el('div','article-layout-tools'), status=el('p','article-layout-status');status.setAttribute('role','status');
  const stage=el('div','article-layout-stage');
  const preview=el('button','knowledge-route-button','检测并预览'), apply=el('button','knowledge-route-button is-primary','应用到当前文章');preview.type=apply.type='button';
  const size=el('select');size.setAttribute('aria-label','页面设计预览宽度');size.append(new Option('桌面','100%'),new Option('平板 · 768px','768px'),new Option('手机 · 390px','390px'));size.onchange=()=>stage.style.width=size.value;
  [mode,width,baseStyles].forEach(input=>input.onchange=()=>{revision++;status.textContent='选项已变化，点击“检测并预览”刷新效果。';});
  mode.addEventListener('change',()=>{if(mode.value==='free' && !design){width.value='full';baseStyles.value='minimal';if(inputs.js.value===template.js)inputs.js.value='';}});
  const blank=el('button','knowledge-route-button','空白起稿');blank.type='button';
  const undoBlank=el('button','knowledge-route-button','撤回空白起稿');undoBlank.type='button';undoBlank.hidden=true;let beforeBlank=null;
  blank.onclick=()=>{beforeBlank={mode:mode.value,width:width.value,baseStyles:baseStyles.value,html:inputs.html.value,css:inputs.css.value,js:inputs.js.value};undoBlank.hidden=false;inputs.html.value=mode.value==='free'?freeTemplate.html:'<main class="article-canvas">\n  {{content}}\n</main>';inputs.css.value=mode.value==='free'?freeTemplate.css:'body{background:var(--page-bg);color:var(--page-text);font:16px/1.8 system-ui,sans-serif}\n.article-canvas{padding:clamp(20px,5vw,80px)}';inputs.js.value='';mode.value=mode.value==='free'?'free':'custom';width.value='full';baseStyles.value='minimal';revision++;status.textContent='已替换为无模板约束的空白起稿，正文不受影响；可撤回，或检测预览后应用。';};
  undoBlank.onclick=()=>{if(!beforeBlank)return;for(const key of ['html','css','js'])inputs[key].value=beforeBlank[key];mode.value=beforeBlank.mode;width.value=beforeBlank.width;baseStyles.value=beforeBlank.baseStyles;beforeBlank=null;undoBlank.hidden=true;revision++;status.textContent='已恢复起稿前的设计。';};
  function value(){return normalizeArticleLayout({mode:mode.value,width:width.value,baseStyles:baseStyles.value,html:inputs.html.value,css:inputs.css.value,js:inputs.js.value},role);}
  preview.onclick=async()=>{const current=++revision;cleanup();stage.replaceChildren();try{const v=value();if(v.mode==='default'){status.textContent='已选择默认排版，使用编辑器底部“预览”查看。';return;}status.textContent='检测通过，正在生成隔离预览…';const result=await mount(stage,{design:v,post:getPost(),signal:controller.signal,preview:true});if(closed||current!==revision)result();else{cleanup=result;status.textContent='检测通过。悬停、点击可测试动态效果；预览使用当前未保存的正文。';}}catch(e){if(!closed)status.textContent=e.message;}};
  apply.onclick=()=>{try{const v=value();onApply(v);dialog.close();}catch(e){status.textContent=e.message;}};
  const file=el('input');file.type='file';file.accept='.html,.htm,.css,.js,text/html,text/css,text/javascript';file.multiple=true;file.hidden=true;
  const importButton=el('button','knowledge-route-button','导入 HTML');importButton.type='button';importButton.onclick=()=>file.click();
  file.onchange=async()=>{try{
    const files=Array.from(file.files);file.value='';if(!files.length)return;
    const htmlFiles=files.filter(n=>/\.html?$/i.test(n.name));
    if(htmlFiles.length!==1)throw Error('请选择一个 HTML 文件，可同时选择配套 CSS / JS 文件。');
    if(files.reduce((sum,n)=>sum+n.size,0)>256*1024)throw Error('导入文件合计超过 256 KiB');
    const companions={};for(const f of files){if(f===htmlFiles[0])continue;if(!/\.(?:css|js)$/i.test(f.name))throw Error('配套文件只支持 CSS / JS');if(Object.hasOwn(companions,f.name))throw Error('配套文件重名：'+f.name);companions[f.name]=await f.text();}
    const imported=splitArticleDocument(await htmlFiles[0].text(),companions);
    inputs.js.value=imported.js;inputs.css.value=imported.css;inputs.html.value=imported.html;mode.value=mode.value==='free'?'free':'custom';revision++;
    status.textContent=(mode.value==='free'?'HTML 文章已导入，CSS / JS 已分离，尚未执行；检测预览后应用。':'已导入，尚未执行。自定义布局需有 {{content}}；整篇 HTML 文章可选择完全自由模式。')+(imported.notes?.length?'\n'+imported.notes.join('；'):'');
  }catch(e){status.textContent=e.message;}};
  tools.append(preview,size,importButton,blank,undoBlank,apply,file);dialog.append(header,intro,options,tabs,codes,hint,tools,status,stage);(document.getElementById('elegantShell') || document.body).append(dialog);
  const abort=()=>dialog.close();signal?.addEventListener('abort',abort,{once:true});
  dialog.addEventListener('close',()=>{closed=true;revision++;cleanup();controller.abort();signal?.removeEventListener('abort',abort);dialog.remove();},{once:true});dialog.showModal();return abort;
}

window.KnowledgeArticleLayout={mount,openEditor,inspectArticleScript,articleHtmlText};

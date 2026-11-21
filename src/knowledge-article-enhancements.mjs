import hljs from 'highlight.js/lib/core';
import cpp from 'highlight.js/lib/languages/cpp';
import javascript from 'highlight.js/lib/languages/javascript';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
hljs.registerLanguage('cpp', cpp); hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('css', css); hljs.registerLanguage('xml', xml);
export { hljs as articleHighlighter };

export async function enhanceArticleMarkup(wrap) {
  if (window.KnowledgeMarkdown?.hasMath(wrap)) {
    await window.KnowledgeFeatures.ensure('math');
    window.KnowledgeMarkdown.enhanceMath(wrap);
  }
  wrap.querySelectorAll('pre > code').forEach(code => {
    const language = [...code.classList].find(n => n.startsWith('language-'))?.slice(9);
    if (language && hljs.getLanguage(language) && code.textContent.length <= 100000) {
      code.innerHTML = hljs.highlight(code.textContent, { language, ignoreIllegals: true }).value;
      code.classList.add('hljs');code.dataset.highlighted='yes';
    }
  });
  wrap.querySelectorAll('[data-article-toc]').forEach(toc => {
    let list=toc.querySelector('ol');if(!list){list=document.createElement('ol');toc.append(list);}list.replaceChildren();
    wrap.querySelectorAll('main h2, main h3').forEach((heading,index)=>{
      if(!heading.id)heading.id='article-heading-'+index;
      const li=document.createElement('li'),link=document.createElement('a');link.href='#'+encodeURIComponent(heading.id);link.textContent=heading.textContent;
      if(heading.tagName==='H3')link.className='sub';li.append(link);list.append(li);
    });
  });
}

// Serialized as trusted frame code. No outer variables or user code are captured.
export function installFrameEnhancements(channel, initialStorage) {
  let copyId=0,scrollTop=0,viewportHeight=0,hasViewport=false;const copies=new Map(),observers=new Set(),store=new Map(initialStorage || []);
  const rawNow=performance.now.bind(performance);let persistPending=false;
  function persistStorage(){if(persistPending)return;persistPending=true;setTimeout(()=>{persistPending=false;parent.postMessage({channel,type:'storage',entries:[...store]},'*');},100);}
  const safeHTML=window.DOMPurify?.sanitize.bind(window.DOMPurify);
  if(safeHTML){const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{get:descriptor.get,set(value){const html=safeHTML(String(value),{USE_PROFILES:{html:true},FORBID_TAGS:['script','iframe','object','embed','form','meta','link','base','style'],FORBID_ATTR:['srcdoc','autofocus']});descriptor.set.call(this,html);this.querySelectorAll('a[href]').forEach(n=>{if(!n.getAttribute('href').startsWith('#'))n.removeAttribute('href');});}});}
  Object.defineProperty(window,'localStorage',{value:Object.freeze({getItem:key=>store.get(String(key))??null,setItem(key,value){key=String(key);value=String(value);if(key.length>64||value.length>1024)throw Error('文章独立存储超限');const next=new Map(store);next.set(key,value);if(next.size>32||new TextEncoder().encode(JSON.stringify([...next])).length>4096)throw Error('文章独立存储超过 32 项或 4 KiB');store.set(key,value);persistStorage();},removeItem(key){store.delete(String(key));persistStorage();},clear(){store.clear();persistStorage();},key:index=>[...store.keys()][index]??null,get length(){return store.size;}}),writable:false});
  Object.defineProperty(navigator,'clipboard',{value:Object.freeze({writeText(text){text=String(text);if(text.length>262144)return Promise.reject(Error('复制文本超限'));if(copies.size>=8||navigator.userActivation&&!navigator.userActivation.isActive)return Promise.reject(Error('请通过点击操作复制'));const id=++copyId;return new Promise((resolve,reject)=>{copies.set(id,{resolve,reject});parent.postMessage({channel,type:'copy',copyId:id,text},'*');setTimeout(()=>{if(copies.has(id)){copies.delete(id);reject(Error('复制超时'));}},5000);});}}),writable:false});
  Object.defineProperty(document.documentElement,'scrollTop',{get:()=>scrollTop});
  Object.defineProperty(document.documentElement,'clientHeight',{get:()=>viewportHeight || window.innerHeight});
  const fixed=new Map(),sticky=new Map();let scanned=false;
  function scanPositioned(){if(scanned)return;scanned=true;document.querySelectorAll('body *').forEach(n=>{const style=getComputedStyle(n);if(style.position==='fixed'&&style.top!=='auto')fixed.set(n,n.style.translate);if(style.position==='sticky')sticky.set(n,n.getBoundingClientRect().top);});}
  function notifyObservers(){if(!hasViewport)return;observers.forEach(observer=>observer.update());}
  class ArticleIntersectionObserver {
    constructor(callback,options){if(observers.size>=64)throw Error('滚动观察器超过限制');this.callback=callback;this.margin=String(options?.rootMargin || '0px').split(/\s+/);this.targets=new Map();observers.add(this);}
    observe(target){if(!observers.has(this)&&observers.size>=64)throw Error('滚动观察器超过限制');observers.add(this);this.targets.set(target,null);notifyObservers();}
    unobserve(target){this.targets.delete(target);}
    disconnect(){this.targets.clear();observers.delete(this);}
    takeRecords(){return [];}
    update(){const records=[];const toPixels=value=>parseFloat(value || 0)*(String(value).includes('%')?viewportHeight/100:1),top=scrollTop-toPixels(this.margin[0]),bottom=scrollTop+viewportHeight+toPixels(this.margin[2] || this.margin[0]);this.targets.forEach((previous,target)=>{const box=target.getBoundingClientRect(),visible=box.bottom>top&&box.top<bottom;if(previous!==visible){this.targets.set(target,visible);records.push({target,isIntersecting:visible,intersectionRatio:visible?Math.max(0,Math.min(box.bottom,bottom)-Math.max(box.top,top))/Math.max(1,box.height):0,boundingClientRect:box,time:rawNow()});}});if(records.length)this.callback(records,this);}
  }
  Object.defineProperty(window,'IntersectionObserver',{value:ArticleIntersectionObserver,writable:false});
  if(window.renderMathInElement){const render=window.renderMathInElement;window.renderMathInElement=(root,options)=>render(root,{...options,trust:false,throwOnError:false,ignoredClasses:['katex'],maxExpand:1000});}
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.data?.channel!==channel)return;
    const data=event.data;
    if(data.type==='viewport'&&Number.isFinite(data.scrollTop)&&Number.isFinite(data.viewportHeight)){
      const top=Math.max(0,data.scrollTop),height=Math.max(1,data.viewportHeight),max=Math.max(1,document.body.scrollHeight-height);
      scrollTop=Math.min(max,top);viewportHeight=height;hasViewport=true;
      scanPositioned();fixed.forEach((_,n)=>n.style.translate='0 '+scrollTop+'px');sticky.forEach((base,n)=>{const maxOffset=Math.max(0,n.parentElement.getBoundingClientRect().height-n.getBoundingClientRect().height);n.style.translate='0 '+Math.min(maxOffset,Math.max(0,scrollTop+32-base))+'px';});
      window.dispatchEvent(new Event('scroll'));notifyObservers();
      document.documentElement.style.setProperty('--article-scroll-offset',Math.min(max,top)+'px');
      document.querySelectorAll('[data-article-progress]').forEach(n=>n.style.width=Math.min(100,Math.max(0,top/max*100))+'%');
      let current='';document.querySelectorAll('main h2,main h3').forEach(n=>{if(n.getBoundingClientRect().top<=top+48)current=n.id;});
      document.querySelectorAll('[data-article-toc] a').forEach(n=>{let id='';try{id=decodeURIComponent(n.hash.slice(1));}catch{}n.classList.toggle('on',id===current);});
      document.querySelectorAll('[data-article-toc]').forEach(n=>{
        const old=Number(n.getAttribute('data-article-toc-offset'))||0,base=n.getBoundingClientRect().top-old;
        const maxOffset=Math.max(0,n.parentElement.getBoundingClientRect().height-n.getBoundingClientRect().height);
        const offset=Math.min(maxOffset,Math.max(0,top+32-base));n.setAttribute('data-article-toc-offset',String(offset));n.style.setProperty('--article-toc-offset',offset+'px');
      });
    }
    if(data.type==='copied'&&Number.isInteger(data.copyId)){
      const pending=copies.get(data.copyId);if(pending){copies.delete(data.copyId);if(pending.resolve){if(data.ok)pending.resolve();else pending.reject(Error('复制失败'));}else{pending.textContent=data.ok?'已复制':'复制失败，可选择代码手动复制';setTimeout(()=>{pending.textContent='复制';},1800);}}
    }
  });
  document.addEventListener('click',event=>{
    if(!event.isTrusted)return;
    const copy=event.target.closest('[data-article-copy]');
    if(copy){const code=copy.closest('pre')?.querySelector('code');if(code&&code.textContent.length<=262144){const id=++copyId;copies.set(id,copy);parent.postMessage({channel,type:'copy',copyId:id,text:code.textContent},'*');}return;}
    const link=event.target.closest('a[href^="#"]');if(!link)return;
    let id;try{id=decodeURIComponent(link.getAttribute('href').slice(1));}catch{return;}
    const target=document.getElementById(id);if(!target)return;
    event.preventDefault();parent.postMessage({channel,type:'anchor',offset:target.getBoundingClientRect().top+window.scrollY},'*');
  });
}

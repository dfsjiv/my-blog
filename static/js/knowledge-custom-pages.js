(function () {
  'use strict';
  const ROOT = '/api/knowledge/pages', ADMIN = '/api/knowledge/admin/pages';
  const FORMAT = 'zhen-custom-page';
  let leaveCheck = null;
  function currentTheme() { return getComputedStyle(document.getElementById('elegantShell')).colorScheme === 'light' ? 'light' : 'dark'; }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baseCss = `*{box-sizing:border-box}html{color-scheme:light dark;scroll-behavior:smooth}body{margin:0;background:var(--page-bg);color:var(--page-text);font:16px/1.75 system-ui,sans-serif;overflow-wrap:anywhere}a{color:var(--page-accent)}img,video{max-width:100%;height:auto}pre{overflow:auto;padding:20px;background:var(--page-surface);border-radius:12px}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}th,td{padding:8px 14px;border:1px solid var(--page-line)}.page-articles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:24px}.page-article{display:block;padding:24px;background:var(--page-surface);border:1px solid var(--page-line);border-radius:16px;color:inherit;text-decoration:none;transition:transform .25s,border-color .25s}.page-article:hover{transform:translateY(-5px);border-color:var(--page-accent)}.page-article img{width:100%;height:180px;object-fit:cover;border-radius:9px}.page-article h2{font-size:1.25rem;font-weight:500;line-height:1.5}.page-article p,.page-article small{color:var(--page-muted)}.page-article-body{max-width:78ch;margin:24px auto}.page-article-body img{object-fit:contain}.knowledge-code-toolbar{display:none}.knowledge-align-center{text-align:center}.knowledge-heading-anchor{display:none}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
  const templates = [
    { name: '留白手记 / Journal', html: '<main class="journal">\n  <header><span class="eyebrow">A SPACE FOR IDEAS</span><h1>{{title}}</h1><p>记录学习，也记录一路走来的想法。</p></header>\n  <section>{{content}}</section>\n  <section><h2 class="section-title">Writing & Notes</h2>{{articles}}</section>\n  <footer>Written by {{author}}</footer>\n</main>', css: '.journal{max-width:1120px;padding:72px 28px;margin:auto}.journal header{padding:30px 0 65px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.25em;color:var(--page-accent)}.journal h1{font:clamp(40px,7vw,80px)/1.12 Georgia,serif;font-weight:400;letter-spacing:-.04em;margin:24px 0}.journal header p{color:var(--page-muted)}.section-title{font:italic 30px Georgia,serif;border-top:1px solid var(--page-line);padding-top:30px;margin-top:60px}.journal footer{border-top:1px solid var(--page-line);margin-top:70px;padding-top:22px;color:var(--page-muted);font-size:13px}' },
    { name: '流光玻璃 / Aurora', html: '<main class="aurora">\n  <header><small>PERSONAL UNIVERSE</small><h1>{{title}}</h1><p>代码、灵感与尚未完成的探索。</p></header>\n  <section class="glass">{{content}}</section>\n  <section>{{articles}}</section>\n  <footer>{{author}} · Keep exploring.</footer>\n</main>', css: 'body{background:radial-gradient(ellipse at 10% 0%,color-mix(in srgb,var(--page-accent) 22%,transparent),transparent 60%),var(--page-bg)}.aurora{max-width:1200px;padding:70px 28px;margin:auto}.aurora header{padding:50px 0 70px}.aurora header small{color:var(--page-accent);letter-spacing:.3em}.aurora h1{font-size:clamp(38px,7vw,76px);font-weight:400;line-height:1.2}.glass{padding:28px;border:1px solid var(--page-line);border-radius:22px;background:color-mix(in srgb,var(--page-surface) 75%,transparent);backdrop-filter:blur(18px);margin-bottom:36px}.aurora footer{padding:50px 0 0;color:var(--page-muted)}.aurora .page-article:hover{box-shadow:0 12px 40px color-mix(in srgb,var(--page-accent) 15%,transparent)}' },
    { name: '双栏档案 / Archive', html: '<main class="archive">\n  <aside><small>FIELD NOTES / 01</small><h1>{{title}}</h1><p>{{author}}</p><a href="#writing" target="_self">探索文章 ↓</a></aside>\n  <div class="archive-main"><section>{{content}}</section><section id="writing">{{articles}}</section></div>\n</main>', css: '.archive{display:grid;grid-template-columns:260px minmax(0,1fr);gap:56px;max-width:1320px;padding:70px 28px;margin:auto}.archive aside{position:sticky;top:40px;align-self:start;border-left:2px solid var(--page-accent);padding-left:24px}.archive small{color:var(--page-muted);letter-spacing:.16em}.archive h1{font-size:42px;line-height:1.3;font-weight:400}.archive-main{min-width:0}.archive .page-articles{grid-template-columns:1fr}.archive section+section{margin-top:45px}@media(max-width:760px){.archive{grid-template-columns:1fr;gap:30px;padding-top:40px}.archive aside{position:static}}' }
  ];

  function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  function control(text, action, primary) { const el = node('button', 'knowledge-route-button' + (primary ? ' is-primary' : ''), text); el.type = 'button'; el.addEventListener('click', action); return el; }
  function href(slug) { return '/?knowledge=page&slug=' + encodeURIComponent(slug); }
  function safeUrl(value) { if (typeof value !== 'string' || !value.trim()) return ''; try { const url = new URL(value, location.origin); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } }
  async function request(path, { method = 'GET', body, token, signal, timeout = 12000 } = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(path, { method, signal: controller.signal, credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const value = await response.json();
      if (!response.ok || value.success !== true) throw new Error(value.error?.message || '页面请求失败');
      return value.data;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }

  function importHtml(text) {
    const parsed = new DOMParser().parseFromString(text, 'text/html');
    const css = Array.from(parsed.querySelectorAll('style')).map(el => el.textContent).join('\n\n');
    parsed.querySelectorAll('style').forEach(el => el.remove());
    const stylesheets = Array.from(parsed.querySelectorAll('link[rel="stylesheet"]')).map(el => safeUrl(el.getAttribute('href'))).filter(Boolean);
    return { html: stylesheets.map(url => '<link rel="stylesheet" href="' + esc(url) + '">').join('\n') + parsed.body.innerHTML, css };
  }

  async function buildDocument(page, posts = [], theme = 'dark', author = '') {
    const content = node('div', 'page-markdown');
    const needsBodies = /\{\{article-bodies\}\}|data-page-slot\s*=\s*["']article-bodies["']/.test(page.html || '');
    const sources = [page.markdown, ...(needsBodies ? posts.map(post => post.contentMarkdown || post.content || '') : [])].join('\n');
    if (/\\[\[(]|\$/.test(sources) && window.KnowledgeFeatures) { try { await window.KnowledgeFeatures.ensure('math'); } catch {} }
    window.KnowledgeMarkdown.render(page.markdown || '', content);
    const cards = node('div', 'page-articles'), bodies = node('div', 'page-article-bodies');
    for (const post of posts) {
      const link = node('a', 'page-article'); link.href = '/?knowledge=post&slug=' + encodeURIComponent(post.slug);
      if (safeUrl(post.coverUrl)) { const image = node('img'); image.src = safeUrl(post.coverUrl); image.alt = ''; image.loading = 'lazy'; link.append(image); }
      link.append(node('small', '', post.category || ''), node('h2', '', post.title), node('p', '', post.summary || ''), node('span', '', '阅读全文 →'));
      cards.append(link);
      if (!needsBodies) continue;
      const article = node('article', 'page-article-body'), body = node('div', 'page-prose');
      article.append(node('h2', '', post.title), body);
      if (post.contentFormat === 'html' && post.content) window.KnowledgeMarkdown.renderHtml(post.content, body);
      else window.KnowledgeMarkdown.render(post.contentMarkdown || post.content || '', body);
      bodies.append(article);
    }
    const imported = importHtml(page.html || '');
    const slots = { content: content.innerHTML, articles: cards.outerHTML, 'article-bodies': bodies.outerHTML };
    const source = imported.html.replace(/\{\{(title|author|content|articles|article-bodies)\}\}/g, (_, key) => key === 'title' ? esc(page.title) : key === 'author' ? esc(author) : '<div data-page-slot="' + key + '"></div>');
    const fragment = window.DOMPurify.sanitize(source, { RETURN_DOM_FRAGMENT: true, USE_PROFILES: { html: true, svg: true }, ADD_TAGS: ['link'], ADD_ATTR: ['data-page-slot'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'base', 'meta', 'foreignObject', 'animate', 'set', 'use'], ALLOW_DATA_ATTR: false });
    const wrap = node('div'); wrap.append(fragment);
    wrap.querySelectorAll('[data-page-slot]').forEach(slot => { const key = slot.getAttribute('data-page-slot'); if (Object.hasOwn(slots, key)) slot.innerHTML = slots[key]; slot.removeAttribute('data-page-slot'); });
    // Imported full HTML may not contain slots yet: retain content rather than silently losing it.
    if (page.markdown && !source.includes('data-page-slot="content"')) wrap.append(content);
    if (posts.length && !/data-page-slot="(?:articles|article-bodies)"/.test(source)) wrap.append(cards);
    wrap.querySelectorAll('link').forEach(link => { const url = safeUrl(link.getAttribute('href')); if (link.rel !== 'stylesheet' || !url.startsWith('https:')) link.remove(); else link.href = url; });
    wrap.querySelectorAll('a').forEach(link => {
      if ((link.getAttribute('href') || '').startsWith('#')) { link.setAttribute('target', '_self'); return; }
      const url = safeUrl(link.getAttribute('href')); if (!url) link.removeAttribute('href'); else link.href = url;
      link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer');
    });
    const light = theme === 'light';
    const palette = light ? '--page-bg:#f7f8fa;--page-surface:#ffffff;--page-text:#202a35;--page-muted:#637185;--page-accent:#1675b8;--page-line:#dce3ea' : '--page-bg:#0b1118;--page-surface:#141e29;--page-text:#e7edf5;--page-muted:#9aaabb;--page-accent:#69b9ed;--page-line:#293645';
    const css = (imported.css + '\n' + (page.css || '')).replace(/<\/style/gi, '<\\/style');
    const origin = location.origin;
    const csp = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https: ${origin}; img-src https: data: ${origin}; font-src https: data: ${origin}; media-src https: ${origin}; connect-src 'none'; form-action 'none'; base-uri ${origin};`;
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + esc(csp) + '"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><base href="' + esc(origin + '/') + '"><title>' + esc(page.title) + '</title><link rel="stylesheet" href="' + esc(origin) + '/assets/vendor/katex/katex.min.css"><style>:root{' + palette + ';color-scheme:' + (light ? 'light' : 'dark') + '}' + baseCss + '\n' + css + '</style></head><body>' + wrap.innerHTML + '</body></html>';
  }

  function frame() { const el = node('iframe', 'custom-page-frame'); el.title = '自定义页面预览'; el.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox'); el.referrerPolicy = 'no-referrer'; return el; }
  async function postsFor(page, signal) {
    const results = await Promise.allSettled((page.postSlugs || []).slice(0, 12).map(slug => window.KnowledgeRepository.getPostBySlug(slug, { signal })));
    return { posts: results.filter(r => r.status === 'fulfilled').map(r => r.value), missing: results.filter(r => r.status === 'rejected').length };
  }
  function download(data) { const blob = new Blob([JSON.stringify({ format: FORMAT, version: 1, page: data }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = 'page-' + (data.slug || 'draft') + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function readFile(file, max = 1024 * 1024) { if (!file || file.size > max) throw new Error('文件超过允许大小'); return file.text(); }

  async function mountPublic(root, { slug, page, signal, theme }) {
    const panel = node('section', 'custom-page-public'), tools = node('div', 'custom-page-public-tools');
    const back = node('a', 'knowledge-route-button', '默认首页'); back.href = '/?default=1';
    const gallery = node('a', 'knowledge-route-button', '更多页面'); gallery.href = '/?knowledge=pages';
    const preview = frame(); preview.title = '自定义博客页面';
    const status = node('p', 'knowledge-note', '正在加载页面…'); status.setAttribute('role', 'status');
    tools.append(back, gallery, control('全屏查看', () => preview.requestFullscreen?.().catch(() => { status.textContent = '当前浏览器不支持全屏，请在页面中查看。'; })));
    panel.append(tools, status, preview); root.append(panel);
    try {
      page = page || (await request(ROOT + '/' + encodeURIComponent(slug), { signal })).page;
      if (!page) throw new Error('页面不存在或尚未发布');
      const result = await postsFor(page, signal);
      const documentHtml = await buildDocument(page, result.posts, theme || currentTheme(), page.author);
      if (signal.aborted) return;
      preview.srcdoc = documentHtml; status.textContent = result.missing ? '部分关联文章已下架或暂时无法加载，其他内容正常展示。' : page.title;
      const themeObserver = new MutationObserver(async () => {
        const nextDocument = await buildDocument(page, result.posts, currentTheme(), page.author);
        if (!signal.aborted) preview.srcdoc = nextDocument;
      });
      themeObserver.observe(document.getElementById('elegantShell'), { attributes: true, attributeFilter: ['data-theme'] });
      signal.addEventListener('abort', () => { themeObserver.disconnect(); preview.removeAttribute('srcdoc'); }, { once: true });
    } catch (error) { if (!signal.aborted) { preview.remove(); status.textContent = error.message; } }
  }

  async function mountGallery(root, { signal }) {
    const status = node('p', 'knowledge-note', '正在加载…'), grid = node('div', 'custom-page-gallery'); root.append(status, grid);
    try {
      const { items } = await request(ROOT, { signal }); if (signal.aborted) return;
      status.textContent = items.length ? '独立设计的页面，点击进入查看。' : '还没有公开的自定义页面，默认博客保持原样。';
      for (const item of items) { const link = node('a', 'custom-page-gallery-card'); link.href = href(item.slug); link.append(node('span', 'knowledge-route-kicker', 'CUSTOM PAGE'), node('h2', '', item.title), node('small', '', item.slug + ' ↗')); grid.append(link); }
    } catch (error) { if (!signal.aborted) status.textContent = error.message; }
  }

  async function mountEditor(root, context) {
    const { signal, user, token } = context;
    let saved = null, savedText = '', active = true, busy = false, sequence = 0, previewTimer = 0;
    let selected = [], available = [], limits = { bytes: user.role === 'admin' ? 1048576 : 262144, pages: user.role === 'admin' ? 30 : 8 };
    const ui = node('section', 'custom-page-studio'), intro = node('div', 'custom-page-studio-intro');
    intro.append(node('span', 'knowledge-route-kicker', 'PAGE STUDIO'), node('h2', '', '把页面设计成你的样子'), node('p', '', '默认博客保持原样。从模板开始，或导入自己的 HTML / CSS；悬停、渐变和 CSS 动画可直接预览。'));
    const toolbar = node('div', 'custom-page-toolbar'), status = node('p', 'custom-page-status', '正在读取页面…'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const grid = node('div', 'custom-page-editor-grid'), sidebar = node('aside', 'custom-page-sidebar'), main = node('div', 'custom-page-workbench');
    const pageList = node('div', 'custom-page-list'), fields = node('div', 'custom-page-fields');
    const title = node('input'), slug = node('input'); title.maxLength = 100; slug.maxLength = 64;
    function field(label, input) { const el = node('label', 'custom-page-field'); el.append(node('span', '', label), input); return el; }
    fields.append(field('页面名称', title), field('访问标识（小写英文、数字、连字符）', slug));
    const templateSelect = node('select'); templates.forEach((template, i) => { const option = node('option', '', template.name); option.value = String(i); templateSelect.append(option); });
    fields.append(field('起始模板', templateSelect), control('套用模板', () => {
      if (!window.confirm('套用模板将替换当前 HTML 和 CSS，正文及关联文章会保留。继续吗？')) return;
      const template = templates[Number(templateSelect.value)]; html.value = template.html; css.value = template.css; changed();
    }));
    const search = node('input'); search.type = 'search'; search.placeholder = '搜索已发布文章';
    const searchButton = control('查询文章', () => run(loadArticles)), articleList = node('div', 'custom-page-article-picker'), selectedList = node('div', 'custom-page-selected');
    sidebar.append(node('h3', '', '我的页面'), pageList, control('新建页面', () => { if (canLeave()) reset(); }), fields, node('h3', '', '关联文章'), node('p', 'knowledge-note', '最多 12 篇。访客只能看到仍在公开发布的文章。'), selectedList, field('查找文章', search), searchButton, articleList);
    const tabs = node('div', 'custom-page-tabs'), panels = node('div', 'custom-page-code-panels');
    const html = node('textarea'), css = node('textarea'), markdown = node('textarea');
    const editors = [html, css, markdown];
    ['HTML 布局', 'CSS 样式', '页内 Markdown'].forEach((label, i) => {
      editors[i].setAttribute('aria-label', label); editors[i].spellcheck = false;
      editors[i].hidden = i !== 0; tabs.append(control(label, () => { editors.forEach((el, n) => { el.hidden = n !== i; }); tabs.querySelectorAll('button').forEach((el, n) => { el.setAttribute('aria-pressed', String(n === i)); }); }));
      panels.append(editors[i]);
    });
    tabs.firstElementChild.setAttribute('aria-pressed', 'true');
    const slotTools = node('div', 'custom-page-slot-tools');
    ['title', 'author', 'articles', 'article-bodies', 'content'].forEach(slot => slotTools.append(control('{{' + slot + '}}', () => {
      const start = html.selectionStart, end = html.selectionEnd; html.setRangeText('{{' + slot + '}}', start, end, 'end'); html.dispatchEvent(new Event('input')); html.focus();
    })));
    const hint = node('p', 'knowledge-note', '{{articles}} 放文章卡片，{{article-bodies}} 放文章全文，{{content}} 放页内 Markdown。HTML / CSS 可自由排版；脚本、表单和嵌入页面不执行。');
    const previewTools = node('div', 'custom-page-preview-tools'), stage = node('div', 'custom-page-preview-stage'), preview = frame();
    const previewTheme = node('select'); ['跟随网站', '深色', '浅色'].forEach((text, i) => { const el = node('option', '', text); el.value = ['', 'dark', 'light'][i]; previewTheme.append(el); });
    const viewport = node('select'); [['100%', '桌面预览'], ['390px', '手机预览']].forEach(([value, text]) => { const el = node('option', '', text); el.value = value; viewport.append(el); });
    viewport.addEventListener('change', () => { preview.style.width = viewport.value; }); previewTheme.addEventListener('change', updatePreview);
    previewTools.append(node('strong', '', '动态预览'), field('预览尺寸', viewport), field('预览色调', previewTheme), control('刷新预览', updatePreview));
    stage.append(preview); main.append(tabs, panels, slotTools, hint, previewTools, stage); grid.append(sidebar, main);
    const saveButton = control('保存草稿', () => run(save), true), publishButton = control('发布当前版本', () => run(async () => { await save(); if (dirty()) throw new Error('保存期间内容又有修改，请重新保存后发布'); await action('publish'); }));
    const unpublishButton = control('撤下页面 / 恢复默认', () => run(() => action('unpublish')));
    const publicLink = node('a', 'knowledge-route-button', '查看已发布页面'); publicLink.target = '_blank'; publicLink.rel = 'noopener'; publicLink.hidden = true;
    const homeButton = control('设为站点首页', () => run(async () => { if (dirty()) throw new Error('请先保存并发布当前设计，再设为首页'); if (window.confirm('将这个已发布页面设为全站首页？可通过“撤下页面 / 恢复默认”恢复原首页。')) await action('homepage'); })); homeButton.hidden = user.role !== 'admin';
    function fileInput(accept, label, handler) {
      const input = node('input'); input.type = 'file'; input.accept = accept; input.hidden = true;
      input.addEventListener('change', () => run(async () => { const file = input.files[0]; input.value = ''; if (file) await handler(file); }));
      toolbar.append(control(label, () => input.click()), input);
    }
    toolbar.append(saveButton, publishButton, publicLink, unpublishButton, homeButton);
    fileInput('.html,.htm,text/html', '导入 HTML', async file => {
      if (!window.confirm('将替换当前 HTML 和 CSS，页内正文及关联文章保留。继续吗？')) return;
      const imported = importHtml(await readFile(file, limits.bytes)); html.value = imported.html; css.value = imported.css; changed(); status.textContent = 'HTML 已导入。脚本不会执行；本地图片和样式文件需上传或改为有效网址。请检查预览后保存。';
    });
    fileInput('.css,text/css', '导入 CSS', async file => { css.value = await readFile(file, limits.bytes); changed(); });
    fileInput('.md,.markdown,text/markdown,text/plain', '导入 Markdown', async file => {
      if (markdown.value && !window.confirm('替换当前页内 Markdown？其他文章不受影响。')) return;
      const text = await readFile(file, limits.bytes); const parsed = window.KnowledgePortable?.parseMarkdown(text) || { markdown: text };
      markdown.value = parsed.markdown; changed(); status.textContent = 'Markdown 已导入到当前页面，不会自动创建或修改原文章；本地图片需另行上传。';
    });
    fileInput('image/jpeg,image/png,image/webp,image/gif', '上传并插入图片', async file => {
      if (!accountValid()) throw new Error('账号已变化，请重新打开设计器');
      const maxBytes = user.role === 'admin' ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
      if (file.size > maxBytes) throw new Error('图片超过当前账号的上传大小限制');
      const image = await window.KnowledgeRepository.uploadImage(file, { token: token(), signal });
      if (!active || !accountValid()) return;
      const editor = markdown.hidden ? html : markdown;
      const content = markdown.hidden ? '<img src="' + esc(image.url) + '" alt="' + esc(file.name) + '">' : '![' + file.name.replace(/[\[\]\\]/g, '') + '](' + image.url + ')';
      editor.setRangeText(content, editor.selectionStart, editor.selectionEnd, 'end'); changed();
      status.textContent = '图片已上传到现有图片存储并插入当前编辑区域。可在代码中调整位置和尺寸。';
    });
    fileInput('.json,application/json', '导入页面备份', async file => {
      const value = JSON.parse(await readFile(file, limits.bytes + 4096));
      if (value.format !== FORMAT || value.version !== 1 || !value.page || ['title', 'slug', 'html', 'css', 'markdown'].some(key => typeof value.page[key] !== 'string') || !Array.isArray(value.page.postSlugs) || value.page.postSlugs.length > 12 || value.page.postSlugs.some(s => typeof s !== 'string' || s.length > 200)) throw new Error('请选择本网站导出的有效页面备份');
      if (!canLeave()) return; reset(value.page); status.textContent = '备份已载入为新页面，请检查访问标识；保存前不会写入数据库。';
    });
    toolbar.append(control('导出页面备份', () => download(value())));
    ui.append(intro, toolbar, status, grid); root.append(ui);

    function value() { return { title: title.value.trim(), slug: slug.value.trim(), html: html.value, css: css.value, markdown: markdown.value, postSlugs: selected.slice() }; }
    function dirty() { return JSON.stringify(value()) !== savedText; }
    function canLeave() { return !dirty() || window.confirm('页面有未保存的修改，离开会丢失。可先导出页面备份。确定离开吗？'); }
    leaveCheck = canLeave;
    function accountValid() { return window.authManager?.getCurrentUser()?.id === user.id && ['admin', 'user'].includes(window.authManager.getCurrentUser()?.role); }
    async function api(path, options = {}) { if (!accountValid()) throw new Error('账号已变化，请重新打开页面设计器'); return request(path, { ...options, token: token(), signal }); }
    function changed() { status.textContent = dirty() ? '有未保存修改 · 仅预览，不会自动发布' : '草稿已保存'; clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 550); }
    [title, slug, ...editors].forEach(el => el.addEventListener('input', changed));
    function syncButtons() {
      unpublishButton.disabled = busy || !saved?.isPublished; homeButton.disabled = busy || !saved?.isPublished;
      publicLink.hidden = !saved?.isPublished; if (saved) publicLink.href = href(saved.slug);
      slug.readOnly = Boolean(saved);
    }
    async function run(task) {
      if (busy || !active) return; busy = true; ui.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try { await task(); } catch (error) { if (!signal.aborted) status.textContent = error.message || '操作失败'; }
      finally { busy = false; if (active) { ui.querySelectorAll('button').forEach(button => { button.disabled = false; }); syncButtons(); } }
    }
    function populate(page) {
      title.value = page.title || ''; slug.value = page.slug || ''; html.value = page.html || ''; css.value = page.css || ''; markdown.value = page.markdown || ''; selected = (page.postSlugs || []).slice();
      selectedArticles(); syncButtons(); updatePreview();
    }
    function reset(data) {
      saved = null; populate(data || { title: '我的博客空间', slug: 'my-space-' + Date.now().toString(36), ...templates[0], markdown: '## 你好，欢迎来到我的空间\n\n在这里放下你的学习笔记和故事。', postSlugs: [] });
      savedText = JSON.stringify(value()); status.textContent = '新页面 · 尚未保存';
    }
    async function listPages() {
      const data = await api(ADMIN); if (!active) return; limits = data.limits; pageList.replaceChildren();
      pageList.append(node('p', 'knowledge-note', `每账号 ${limits.pages} 页（含回收站），单页 ${limits.bytes / 1024} KB。草稿和已发布版本分别保留。`));
      for (const item of data.items) {
        const row = node('div', 'custom-page-list-row');
        row.append(control(item.title + (item.deletedAt ? ' · 已移入回收站' : item.isHomepage ? ' · 当前首页' : item.isPublished ? ' · 已发布' : ' · 草稿'), () => run(async () => {
          if (!canLeave()) return; const data = await api(ADMIN + '/' + item.id); if (!active) return;
          saved = data.page; populate(data.page.draft); savedText = JSON.stringify(value()); status.textContent = item.deletedAt ? '此页面在回收站中，请先恢复再编辑。' : '已打开草稿 · 修改不会影响已发布版本';
        })));
        row.append(control(item.deletedAt ? '恢复' : '移入回收站', () => run(async () => {
          if (saved?.id === item.id && !canLeave()) return;
          if (!item.deletedAt && !window.confirm('将页面移入回收站？已发布页面会撤下，若它是首页则恢复默认首页。')) return;
          await api(ADMIN + '/' + item.id + '/' + (item.deletedAt ? 'restore' : 'trash'), { method: 'POST', body: { version: item.version } });
          if (saved?.id === item.id) reset(); await listPages(); status.textContent = item.deletedAt ? '页面已恢复为草稿' : '页面已移入回收站，可恢复';
        })));
        pageList.append(row);
      }
    }
    async function save() {
      const current = value(), text = JSON.stringify(current);
      if (!current.title || !current.slug) throw new Error('请填写页面名称和访问标识');
      if (new TextEncoder().encode(text).length > limits.bytes) throw new Error('页面超过当前账号大小上限，请缩小 HTML / CSS / Markdown');
      if (!saved || text !== savedText) {
        const result = await api(saved ? ADMIN + '/' + saved.id : ADMIN, { method: saved ? 'PATCH' : 'POST', body: { ...current, ...(saved ? { version: saved.version } : {}) } });
        if (!active) return; saved = result.page; savedText = text; await listPages();
      }
      syncButtons(); status.textContent = dirty() ? '已保存刚才的草稿，当前仍有新修改' : '草稿已保存 · 访客仍看到上次发布版本';
    }
    async function action(name) {
      if (!saved) throw new Error('请先保存页面');
      const result = await api(ADMIN + '/' + saved.id + '/' + name, { method: 'POST', body: { version: saved.version } });
      if (!active) return; saved = result.page; await listPages(); syncButtons();
      status.textContent = name === 'publish' ? '发布成功 · 可通过“查看已发布页面”访问；首页不会自动改变' : name === 'homepage' ? '已设为站点首页；撤下此页面即可恢复默认首页' : '页面已撤下；如果原来设为首页，现已恢复默认首页';
    }
    function selectedArticles() {
      selectedList.replaceChildren();
      selected.forEach((slugValue, index) => {
        const row = node('div', 'custom-page-selection'); row.append(node('span', '', available.find(post => post.slug === slugValue)?.title || slugValue));
        row.append(control('↑', () => { if (index > 0) { [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]]; selectedArticles(); changed(); } }), control('移除', () => { selected = selected.filter(slug => slug !== slugValue); selectedArticles(); changed(); })); selectedList.append(row);
      });
    }
    async function loadArticles() {
      const result = await window.KnowledgeRepository.getPosts({ q: search.value.trim(), pageSize: 50 }, { signal }); if (!active) return;
      available = result.items; articleList.replaceChildren();
      available.forEach(post => articleList.append(control(post.title + ' ＋', () => {
        if (selected.includes(post.slug)) return; if (selected.length >= 12) { status.textContent = '最多关联 12 篇文章'; return; }
        selected.push(post.slug); selectedArticles(); changed();
      })));
      if (!available.length) articleList.append(node('p', 'knowledge-note', '没有匹配的已发布文章'));
      else if (result.pagination?.hasNext) articleList.append(node('p', 'knowledge-note', '显示前 50 篇，请输入关键词缩小范围。'));
      selectedArticles();
    }
    async function updatePreview() {
      const run = ++sequence; const page = value();
      try {
        const result = await postsFor(page, signal);
        const htmlDocument = await buildDocument(page, result.posts, previewTheme.value || currentTheme(), user.nickname || user.username);
        if (active && run === sequence) preview.srcdoc = htmlDocument;
      } catch (error) { if (active && run === sequence && !signal.aborted) status.textContent = '预览失败：' + error.message; }
    }
    const beforeUnload = event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    const themeObserver = new MutationObserver(() => { if (!previewTheme.value) updatePreview(); });
    themeObserver.observe(document.getElementById('elegantShell'), { attributes: true, attributeFilter: ['data-theme'] });
    function cleanup() { active = false; ++sequence; clearTimeout(previewTimer); themeObserver.disconnect(); preview.removeAttribute('srcdoc'); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('knowledge-auth-changed', authChanged); if (leaveCheck === canLeave) leaveCheck = null; }
    function authChanged() { if (!accountValid()) { cleanup(); editors.forEach(editor => { editor.value = ''; }); selected = []; root.replaceChildren(node('p', 'knowledge-note', '账号已变化，编辑器已关闭。请重新打开页面设计。')); } }
    window.addEventListener('knowledge-auth-changed', authChanged);
    signal.addEventListener('abort', cleanup, { once: true });
    reset(); await run(async () => { await listPages(); await loadArticles(); status.textContent = '选择已有页面，或从新页面开始；默认博客保持原样。'; });
  }

  window.KnowledgeCustomPages = { mountEditor, mountPublic, mountGallery, buildDocument, importHtml, request, templates, canLeave: () => !leaveCheck || leaveCheck() };
}());

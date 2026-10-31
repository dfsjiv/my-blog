(function () {
  'use strict';
  const LIMIT = 200;
  const MAX_IMPORT_BYTES = 512 * 1024;
  const TYPES = new Set(['article', 'solution', 'note', 'project', 'essay']);
  const stores = new Map();
  const PREFS_KEY = 'knowledge-reading-preferences:v1';
  function normalizePreferences(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      size: Number.isFinite(source.size) ? Math.max(14, Math.min(24, Math.round(source.size))) : 16,
      line: [1.6, 1.8, 2, 2.2].includes(source.line) ? source.line : 1.8,
      width: ['default', 'narrow', 'wide'].includes(source.width) ? source.width : 'default',
      font: source.font === 'serif' ? 'serif' : 'system',
    };
  }
  const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';

  function safeImage(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
      const url = new URL(value, window.location.origin);
      return value && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function sanitize(item) {
    if (!item || typeof item !== 'object') return null;
    const slug = clean(item.slug, 200).trim();
    if (!slug || /[/?#\\]/.test(slug)) return null;
    const now = Date.now();
    const timestamp = value => Number.isFinite(value) && value > 0 ? Math.min(value, now) : 0;
    return {
      slug, title: clean(item.title, 200) || slug, summary: clean(item.summary, 360),
      type: TYPES.has(item.type) ? item.type : 'article', coverUrl: safeImage(item.coverUrl),
      saved: item.saved === true, savedAt: timestamp(item.savedAt),
      visitedAt: timestamp(item.visitedAt), updatedAt: timestamp(item.updatedAt),
      progress: Number.isFinite(item.progress) ? Math.max(0, Math.min(100, Math.round(item.progress))) : 0,
      heading: clean(item.heading, 220),
    };
  }

  function createStore(storage, scope) {
    const key = 'knowledge-reading:v1:' + (/^user-[1-9]\d*$/.test(scope) ? scope : 'guest');
    let memory = [];
    let persistent = true;
    function read() {
      if (!persistent) return memory;
      try {
        const raw = storage.getItem(key);
        if (raw == null) memory = [];
        if (raw && raw.length <= MAX_IMPORT_BYTES) {
          const data = JSON.parse(raw);
          if (data.version === 1 && Array.isArray(data.items)) memory = normalize(data.items);
        }
      } catch { persistent = false; }
      return memory;
    }
    function normalize(items) {
      const map = new Map();
      items.slice(0, 1000).forEach(item => {
        const entry = sanitize(item);
        if (!entry) return;
        const previous = map.get(entry.slug);
        if (!previous || entry.updatedAt >= previous.updatedAt) map.set(entry.slug, entry);
      });
      // Keep saved articles before evicting old unsaved history.
      return [...map.values()].sort((a, b) => Number(b.saved) - Number(a.saved) || b.updatedAt - a.updatedAt).slice(0, LIMIT);
    }
    function write(items) {
      memory = normalize(items);
      try { storage.setItem(key, JSON.stringify({ version: 1, items: memory })); }
      catch { persistent = false; }
      return memory;
    }
    function update(slug, changes) {
      const items = read().map(item => ({ ...item }));
      const index = items.findIndex(item => item.slug === slug);
      const previous = index < 0 ? { slug } : items[index];
      const next = sanitize({ ...previous, ...changes, slug, updatedAt: Date.now() });
      if (!next) return null;
      if (index < 0) items.push(next); else items[index] = next;
      write(items);
      return { ...next };
    }
    return {
      list: () => read().map(item => ({ ...item })),
      get: slug => { const entry = read().find(item => item.slug === slug); return entry ? { ...entry } : null; },
      visit(post) { return update(post.slug, { title: post.title, summary: post.summary, type: post.type, coverUrl: post.coverUrl, visitedAt: Date.now() }); },
      save(post, saved) { return update(post.slug, { title: post.title, summary: post.summary, type: post.type, coverUrl: post.coverUrl, saved, savedAt: saved ? Date.now() : 0 }); },
      progress(slug, percent, heading) {
        const previous = this.get(slug);
        if (!previous || !Number.isFinite(percent) || percent < previous.progress) return previous;
        return update(slug, { progress: percent, heading });
      },
      unread(slug) { return update(slug, { progress: 0, heading: '' }); },
      remove(slug) { write(read().filter(item => item.slug !== slug)); },
      clearHistory() { write(read().filter(item => item.saved).map(item => ({ ...item, visitedAt: 0, progress: 0, heading: '' }))); },
      clear() { write([]); },
      export() { return JSON.stringify({ format: 'zhen-reading-library', version: 1, exportedAt: new Date().toISOString(), items: this.list() }, null, 2); },
      import(text) {
        if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('size');
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('format'); }
        if (data?.format !== 'zhen-reading-library' || data.version !== 1 || !Array.isArray(data.items) || data.items.length > 1000) throw new Error('format');
        const imported = normalize(data.items);
        if (data.items.length && !imported.length) throw new Error('format');
        write([...read(), ...imported]);
        return imported.length;
      },
      get persistent() { return persistent; }, key,
    };
  }

  function storeFor(user) {
    const scope = user && user.role !== 'guest' && Number.isSafeInteger(Number(user.id)) && Number(user.id) > 0 ? 'user-' + Number(user.id) : 'guest';
    if (stores.has(scope)) return stores.get(scope);
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    const store = createStore(storage, scope);
    stores.set(scope, store);
    return store;
  }
  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = text;
    return result;
  }
  function control(text, action, className = 'knowledge-route-button') {
    const result = node('button', className, text);
    result.type = 'button';
    result.addEventListener('click', action);
    return result;
  }
  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = node('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function mountDetail(options) {
    const { post, body, header, shell, navigate, signal } = options;
    if (signal.aborted) return () => {};
    const zh = options.language === 'zh';
    const text = (cn, en) => zh ? cn : en;
    const store = storeFor(options.user);
    const previous = store.get(post.slug);
    store.visit(post);
    const tools = node('div', 'knowledge-reading-tools');
    const status = node('span', 'knowledge-reading-status');
    status.setAttribute('role', 'status');
    const save = control('', () => {
      const saved = !store.get(post.slug)?.saved;
      store.save(post, saved);
      syncSave();
      status.textContent = saved ? text('已加入稍后读', 'Added to Read later') : text('已从稍后读移除', 'Removed from Read later');
    });
    function syncSave() {
      const saved = !!store.get(post.slug)?.saved;
      save.textContent = saved ? text('✓ 已收藏', '✓ Saved') : text('＋ 稍后读', '＋ Read later');
      save.setAttribute('aria-pressed', String(saved));
    }
    syncSave();
    const library = control(text('我的阅读', 'My reading'), () => navigate('reading'));
    const exportMd = control(text('导出 Markdown', 'Export Markdown'), async () => {
      exportMd.disabled = true;
      try {
        await window.KnowledgeFeatures.ensure('portable');
        if (!signal.aborted) window.KnowledgePortable.exportPost(post);
      } catch {
        status.textContent = text('导出暂时不可用，请重试。', 'Export unavailable. Please retry.');
      } finally { exportMd.disabled = false; }
    });
    tools.append(save, library, exportMd);
    const view = node('details', 'knowledge-reader-settings');
    const summary = node('summary', '', text('阅读设置', 'Reading settings'));
    const settingsPanel = node('div', 'knowledge-reader-settings-panel');
    const sizeLabel = node('label', '', text('字号', 'Font size'));
    const size = node('input'); size.type = 'range'; size.min = '14'; size.max = '24'; size.step = '1';
    const sizeValue = node('output'); sizeLabel.append(size, sizeValue);
    function select(label, choices) {
      const wrap = node('label', '', label), control = node('select');
      for (const [value, caption] of choices) { const option = node('option', '', caption); option.value = value; control.appendChild(option); }
      wrap.appendChild(control); settingsPanel.appendChild(wrap); return control;
    }
    settingsPanel.appendChild(sizeLabel);
    const line = select(text('行距', 'Line spacing'), [['1.6', '1.6'], ['1.8', '1.8'], ['2', '2.0'], ['2.2', '2.2']]);
    const width = select(text('正文宽度', 'Article width'), [['default', text('默认', 'Default')], ['narrow', text('紧凑', 'Narrow')], ['wide', text('宽屏', 'Wide')]]);
    const font = select(text('正文字体', 'Body font'), [['system', text('系统字体', 'System')], ['serif', text('衬线字体', 'Serif')]]);
    let preferences;
    try { preferences = normalizePreferences(JSON.parse(window.localStorage.getItem(PREFS_KEY) || 'null')); }
    catch { preferences = normalizePreferences(null); }
    function applyPreferences() {
      size.value = preferences.size; sizeValue.value = preferences.size + 'px';
      line.value = preferences.line; width.value = preferences.width; font.value = preferences.font;
      body.classList.add('knowledge-reader-body');
      body.style.setProperty('--reader-font-size', preferences.size + 'px');
      body.style.setProperty('--reader-line-height', preferences.line);
      body.dataset.readerFont = preferences.font;
      shell.dataset.readerWidth = preferences.width;
    }
    function changed() {
      preferences = normalizePreferences({ size: Number(size.value), line: Number(line.value), width: width.value, font: font.value });
      applyPreferences();
      try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); } catch {}
    }
    size.addEventListener('input', changed);
    [line, width, font].forEach(input => input.addEventListener('change', changed));
    settingsPanel.appendChild(control(text('恢复默认', 'Reset defaults'), () => { preferences = normalizePreferences(null); applyPreferences(); changed(); }));
    view.append(summary, settingsPanel); tools.appendChild(view); applyPreferences();
    view.addEventListener('toggle', () => {
      if (!view.open) return;
      const panelWidth = Math.min(280, window.innerWidth - 60);
      const left = view.getBoundingClientRect().left - tools.getBoundingClientRect().left;
      settingsPanel.style.left = Math.max(0, Math.min(left, tools.clientWidth - panelWidth)) + 'px';
    });
    let focused = false;
    const exitFocus = control(text('退出专注 · Esc', 'Exit focus · Esc'), () => focus(false), 'knowledge-route-button knowledge-reader-focus-exit');
    exitFocus.hidden = true; shell.appendChild(exitFocus);
    const focusToggle = control(text('专注阅读', 'Focus mode'), () => focus(!focused));
    focusToggle.setAttribute('aria-pressed', 'false');
    function focus(enabled) {
      focused = enabled; shell.classList.toggle('knowledge-reader-focus', enabled);
      exitFocus.hidden = !enabled; focusToggle.setAttribute('aria-pressed', String(enabled));
      focusToggle.textContent = enabled ? text('退出专注', 'Exit focus') : text('专注阅读', 'Focus mode');
      view.open = false;
    }
    const print = control(text('打印 / PDF', 'Print / PDF'), () => window.print());
    tools.append(focusToggle, print);
    if (previous && previous.progress >= 5 && previous.progress < 95) {
      const resume = control(text('继续上次阅读 · ', 'Resume · ') + previous.progress + '%', () => {
        const target = previous.heading && Array.from(body.querySelectorAll('[id]')).find(item => item.id === previous.heading);
        if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
        else {
          const top = body.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop;
          shell.scrollTo({ top: Math.max(0, top + body.scrollHeight * previous.progress / 100 - shell.clientHeight * 0.7), behavior: 'auto' });
        }
        resume.remove();
      });
      tools.appendChild(resume);
    }
    tools.appendChild(status);
    header.appendChild(tools);
    const progress = node('div', 'knowledge-reading-progress');
    progress.setAttribute('aria-hidden', 'true');
    const fill = node('span'); progress.appendChild(fill); shell.appendChild(progress);
    let timer = 0, pending = null, destroyed = false;
    const headings = Array.from(body.querySelectorAll('h2[id],h3[id],h4[id]'));
    const sectionButtons = headings.map(heading => {
      const button = control('#', async () => {
        const url = new URL(window.location.pathname, window.location.origin);
        url.searchParams.set('knowledge', 'post'); url.searchParams.set('slug', post.slug); url.hash = heading.id;
        try {
          await navigator.clipboard.writeText(url.href);
          if (!destroyed) status.textContent = text('章节链接已复制。', 'Section link copied.');
        } catch {
          if (destroyed) return;
          const field = node('input', 'knowledge-reading-permalink-fallback');
          field.type = 'text'; field.readOnly = true; field.value = url.href;
          field.setAttribute('aria-label', text('章节链接', 'Section link'));
          status.replaceChildren(node('span', '', text('请手动复制章节链接：', 'Copy this section link: ')), field);
          field.focus(); field.select();
        }
      }, 'knowledge-reader-section-link');
      button.setAttribute('aria-label', text('复制章节链接：', 'Copy section link: ') + heading.textContent.trim());
      button.title = text('复制章节链接', 'Copy section link'); heading.appendChild(button); return button;
    });
    const imageDialog = node('dialog', 'knowledge-reader-image-dialog');
    imageDialog.setAttribute('aria-label', text('图片查看器', 'Image viewer'));
    const imageBar = node('header');
    const imageCaption = node('span');
    const imageViewport = node('div', 'knowledge-reader-image-viewport');
    const expandedImage = node('img'); expandedImage.alt = '';
    let sourceImage = null;
    const actualSize = control(text('原始大小', 'Actual size'), () => {
      const actual = imageViewport.classList.toggle('is-actual');
      actualSize.textContent = actual ? text('适应窗口', 'Fit window') : text('原始大小', 'Actual size');
    });
    const imageClose = control(text('关闭', 'Close'), () => imageDialog.close());
    imageBar.append(imageCaption, actualSize, imageClose); imageViewport.appendChild(expandedImage); imageDialog.append(imageBar, imageViewport); shell.appendChild(imageDialog);
    const images = Array.from(body.querySelectorAll('img')).filter(image => !image.closest('a'));
    images.forEach(image => { image.classList.add('knowledge-reader-zoomable'); image.tabIndex = 0; image.setAttribute('role', 'button'); image.setAttribute('aria-label', text('查看大图：', 'Enlarge image: ') + (image.alt || text('文章图片', 'Article image'))); });
    function openImage(image) {
      if (!image.naturalWidth || imageDialog.open) return;
      sourceImage = image; expandedImage.src = image.currentSrc || image.src; expandedImage.alt = image.alt;
      imageCaption.textContent = image.alt || text('文章图片', 'Article image');
      imageViewport.classList.remove('is-actual'); actualSize.textContent = text('原始大小', 'Actual size');
      imageDialog.showModal(); imageClose.focus();
    }
    function imageClick(event) { if (images.includes(event.target)) openImage(event.target); }
    function imageKey(event) { if (images.includes(event.target) && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openImage(event.target); } }
    body.addEventListener('click', imageClick); body.addEventListener('keydown', imageKey);
    imageDialog.addEventListener('click', event => { if (event.target === imageDialog) imageDialog.close(); });
    imageDialog.addEventListener('close', () => { if (!destroyed && sourceImage?.isConnected) sourceImage.focus({ preventScroll: true }); expandedImage.removeAttribute('src'); });
    function escapeFocus(event) { if (event.key === 'Escape' && focused && !imageDialog.open) { focus(false); focusToggle.focus({ preventScroll: true }); } }
    window.addEventListener('keydown', escapeFocus);
    function flush() {
      clearTimeout(timer); timer = 0;
      if (pending) { store.progress(post.slug, pending.percent, pending.heading); pending = null; }
    }
    function measure() {
      if (destroyed || signal.aborted || document.hidden || !document.body.classList.contains('auth-elegant')) return;
      const viewport = shell.getBoundingClientRect();
      const rect = body.getBoundingClientRect();
      if (rect.height < 1) return;
      const percent = Math.max(0, Math.min(100, Math.round((viewport.bottom - rect.top) / rect.height * 100)));
      fill.style.transform = 'scaleX(' + percent / 100 + ')';
      let heading = '';
      for (const item of headings) if (item.getBoundingClientRect().top <= viewport.top + 140) heading = item.id;
      pending = { percent, heading };
      if (!timer) timer = setTimeout(flush, 800);
    }
    function visibility() { if (document.hidden) flush(); else measure(); }
    function storage(event) { if (event.key === store.key) syncSave(); }
    shell.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('pagehide', flush);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visibility);
    const observer = new ResizeObserver(measure); observer.observe(body);
    const startTimer = setTimeout(measure, 1200);
    function cleanup() {
      if (destroyed) return;
      flush(); destroyed = true; clearTimeout(startTimer);
      observer.disconnect(); tools.remove(); progress.remove();
      sectionButtons.forEach(button => button.remove());
      focus(false); exitFocus.remove(); imageDialog.close(); imageDialog.remove();
      body.removeEventListener('click', imageClick); body.removeEventListener('keydown', imageKey);
      window.removeEventListener('keydown', escapeFocus);
      body.classList.remove('knowledge-reader-body'); body.style.removeProperty('--reader-font-size'); body.style.removeProperty('--reader-line-height');
      delete body.dataset.readerFont; delete shell.dataset.readerWidth;
      shell.removeEventListener('scroll', measure); window.removeEventListener('resize', measure);
      window.removeEventListener('pagehide', flush); window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
    }
    signal.addEventListener('abort', cleanup, { once: true });
    return cleanup;
  }

  function mountLibrary(root, options) {
    const zh = options.language === 'zh';
    const text = (cn, en) => zh ? cn : en;
    const store = storeFor(options.user);
    let active = 'saved';
    let undoRecord = null;
    const page = node('section', 'knowledge-reading-library');
    const note = node('p', 'knowledge-note', text('记录保存在当前浏览器，与当前账号分开管理。支持备份与导入，最多保留 200 条；不会上传阅读轨迹。', 'Stored in this browser, separately for each account. Export or import a backup; up to 200 entries. Reading activity is not uploaded.'));
    const stats = node('div', 'knowledge-reading-stats');
    const toolbar = node('div', 'knowledge-reading-toolbar');
    const tabs = node('div', 'knowledge-reading-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', text('阅读记录类型', 'Reading collection'));
    const input = node('input'); input.type = 'search'; input.placeholder = text('搜索你的阅读记录…', 'Search your reading…'); input.setAttribute('aria-label', input.placeholder);
    const feedback = node('p', 'knowledge-reading-feedback'); feedback.setAttribute('role', 'status');
    const undo = control(text('撤销移除', 'Undo removal'), () => {
      if (!undoRecord) return;
      store.import(JSON.stringify({ format: 'zhen-reading-library', version: 1, items: [undoRecord] }));
      undoRecord = null; undo.hidden = true; render(); feedback.textContent = text('记录已恢复。', 'Record restored.');
    });
    undo.hidden = true;
    const list = node('div', 'knowledge-reading-list');
    const tabButtons = [];
    for (const [id, cn, en] of [['saved', '稍后读', 'Read later'], ['history', '阅读历史', 'History'], ['completed', '已读完', 'Finished']]) {
      const tab = control(text(cn, en), () => { active = id; render(); });
      tab.dataset.collection = id; tabButtons.push(tab); tabs.appendChild(tab);
    }
    const backup = node('div', 'knowledge-reading-backup');
    const file = node('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    backup.append(control(text('导出记录', 'Export records'), () => download(store.export(), 'zhen-reading-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json')),
      control(text('导入记录', 'Import records'), () => file.click()),
      control(text('清空历史', 'Clear history'), () => {
        if (!confirm(text('清空当前浏览器的阅读历史？稍后读会保留。', 'Clear reading history in this browser? Saved articles will remain.'))) return;
        store.clearHistory(); render(); feedback.textContent = text('阅读历史已清空，稍后读已保留。', 'History cleared. Saved articles remain.');
      }), file);
    file.addEventListener('change', async () => {
      const selected = file.files?.[0]; file.value = '';
      if (!selected) return;
      try {
        if (selected.size > MAX_IMPORT_BYTES) throw new Error('size');
        const value = await selected.text();
        if (options.signal.aborted) return;
        const count = store.import(value); render();
        feedback.textContent = text('已合并 ' + count + ' 条阅读记录。', count + ' records merged.');
      } catch {
        feedback.textContent = text('导入失败，请选择本功能导出的 JSON 文件（不超过 512 KB）。原记录未改动。', 'Import failed. Choose an exported JSON file up to 512 KB. Existing records were not changed.');
      }
    });
    function render() {
      const items = store.list();
      stats.replaceChildren();
      for (const [label, count] of [[text('稍后读', 'Saved'), items.filter(item => item.saved).length], [text('阅读记录', 'History'), items.filter(item => item.visitedAt).length], [text('已读完', 'Finished'), items.filter(item => item.progress >= 95).length]]) {
        const stat = node('div'); stat.append(node('strong', '', count), node('span', '', label)); stats.appendChild(stat);
      }
      if (!store.persistent) feedback.textContent = text('浏览器存储不可用，本次记录仅在当前页面有效。请及时导出。', 'Browser storage is unavailable. Records are temporary; export a backup before leaving.');
      tabButtons.forEach(tab => { const selected = tab.dataset.collection === active; tab.classList.toggle('is-active', selected); tab.setAttribute('aria-pressed', String(selected)); });
      const query = input.value.trim().toLocaleLowerCase();
      const shown = items.filter(item => active === 'saved' ? item.saved : active === 'completed' ? item.visitedAt && item.progress >= 95 : item.visitedAt)
        .filter(item => !query || (item.title + ' ' + item.summary).toLocaleLowerCase().includes(query))
        .sort((a, b) => active === 'saved' ? b.savedAt - a.savedAt : b.visitedAt - a.visitedAt);
      list.replaceChildren();
      if (!shown.length) {
        const empty = node('div', 'knowledge-reading-empty');
        empty.append(node('h2', '', query ? text('没有匹配的阅读记录', 'No matching records') : text('从一篇文章开始', 'Start with an article')),
          node('p', '', text('打开文章即可记录阅读位置；喜欢的文章可以加入稍后读。', 'Open an article to keep your place, or save it to Read later.')),
          control(text('去看文章', 'Explore articles'), () => options.navigate('all')));
        list.appendChild(empty); return;
      }
      shown.forEach(item => {
        const row = node('article', 'knowledge-reading-row');
        const copy = node('div', 'knowledge-reading-copy');
        const link = node('a', 'knowledge-reading-title', item.title);
        const url = new URL(window.location.pathname, window.location.origin); url.searchParams.set('knowledge', 'post'); url.searchParams.set('slug', item.slug); link.href = url.href;
        link.addEventListener('click', event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); options.navigate('detail', { slug: item.slug }); });
        const meta = node('p', 'knowledge-note');
        const date = item.visitedAt || item.savedAt;
        meta.textContent = (item.progress >= 95 ? text('已读完', 'Finished') : item.progress ? text('读至 ', 'Read ') + item.progress + '%' : text('未开始', 'Not started')) + (date ? ' · ' + new Date(date).toLocaleDateString(zh ? 'zh-CN' : 'en-US') : '');
        copy.append(link, meta);
        if (item.summary) copy.appendChild(node('p', 'knowledge-reading-summary', item.summary));
        const actions = node('div', 'knowledge-reading-row-actions');
        actions.append(control(item.saved ? text('取消收藏', 'Unsave') : text('稍后读', 'Save'), () => { store.save(item, !item.saved); render(); }),
          control(text('标为未读', 'Mark unread'), () => { store.unread(item.slug); render(); }),
          control(text('移除记录', 'Remove'), () => {
            undoRecord = item; store.remove(item.slug); render(); undo.hidden = false;
            feedback.textContent = text('已移除记录，可以撤销。', 'Record removed. You can undo this.');
          }));
        row.append(copy, actions); list.appendChild(row);
      });
    }
    input.addEventListener('input', render);
    toolbar.append(tabs, input); page.append(note, stats, toolbar, feedback, undo, list, backup); root.appendChild(page);
    function storage(event) { if (event.key === store.key) render(); }
    window.addEventListener('storage', storage);
    render();
    const cleanup = () => window.removeEventListener('storage', storage);
    options.signal.addEventListener('abort', cleanup, { once: true });
    return cleanup;
  }
  window.KnowledgeReading = { createStore, storeFor, normalizePreferences, mountDetail, mountLibrary };
})();

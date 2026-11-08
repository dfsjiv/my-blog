(function () {
  'use strict';
  let active = null;
  function normalizeQueries(value) {
    if (!Array.isArray(value)) return [];
    const now = Date.now(), seen = new Set();
    return value.filter(item => item && typeof item.q === 'string' && Number.isFinite(item.at) && item.at > now - 30 * 86400000 && item.at <= now + 60000)
      .map(item => ({ q: item.q.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100), at: Math.min(now, item.at) }))
      .filter(item => { const key = item.q.toLocaleLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
  }
  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = text;
    return result;
  }
  function open(options) {
    if (active) { active.input.focus(); return; }
    const zh = options.language === 'zh', text = (cn, en) => zh ? cn : en;
    const scope = options.user && options.user.role !== 'guest' && Number(options.user.id) > 0 ? 'user-' + Number(options.user.id) : 'guest';
    const key = 'knowledge-search-recent:v1:' + scope;
    let recent = [];
    try { const raw = localStorage.getItem(key); if (raw && raw.length < 8192) recent = normalizeQueries(JSON.parse(raw)); } catch {}
    const dialog = node('dialog', 'knowledge-quick-search');
    dialog.setAttribute('aria-labelledby', 'knowledgeQuickSearchTitle');
    const header = node('header');
    const title = node('h2', '', text('搜索文章', 'Search articles')); title.id = 'knowledgeQuickSearchTitle';
    const close = node('button', 'knowledge-route-button', text('关闭 · Esc', 'Close · Esc')); close.type = 'button';
    header.append(title, close);
    const form = node('form', 'knowledge-quick-search-form'); form.setAttribute('role', 'search');
    const input = node('input'); input.type = 'search'; input.maxLength = 100; input.autocomplete = 'off';
    input.placeholder = text('输入标题、关键词或正文内容…', 'Search titles, keywords or article content…');
    input.setAttribute('aria-label', text('搜索标题或正文', 'Search titles or content'));
    const submit = node('button', 'knowledge-route-button', text('全部结果', 'All results')); submit.type = 'submit';
    form.append(input, submit);
    const status = node('p', 'knowledge-quick-search-status'); status.setAttribute('role', 'status');
    const results = node('div', 'knowledge-quick-search-results'); results.setAttribute('aria-label', text('搜索结果', 'Search results'));
    const hint = node('footer', '', text('↑ ↓ 选择 · Enter 打开 · Esc 关闭', '↑ ↓ Select · Enter Open · Esc Close'));
    dialog.append(header, form, status, results, hint);
    options.shell.appendChild(dialog);
    let timer = 0, request = null, sequence = 0, closed = false;
    const previouslyFocused = document.activeElement;
    function remember(q) {
      recent = normalizeQueries([{ q, at: Date.now() }, ...recent]);
      try { localStorage.setItem(key, JSON.stringify(recent)); } catch {}
    }
    function cleanup() {
      if (closed) return;
      closed = true; clearTimeout(timer); request?.abort(); observer.disconnect();
      active = null; dialog.remove();
      const focusTarget = previouslyFocused?.isConnected && previouslyFocused !== document.body && previouslyFocused !== document.documentElement && previouslyFocused.getClientRects().length ? previouslyFocused : options.returnFocus;
      if (focusTarget?.isConnected && document.body.classList.contains('auth-elegant')) focusTarget.focus({ preventScroll: true });
    }
    function leave(route, payload = {}) { dialog.close(); cleanup(); options.navigate(route, payload); }
    function button(label, action, className = 'knowledge-quick-search-choice') {
      const result = node('button', className, label); result.type = 'button'; result.addEventListener('click', action); return result;
    }
    function empty() {
      results.replaceChildren();
      status.textContent = text('输入关键词搜索，或选择快捷入口。', 'Type to search, or choose a shortcut.');
      if (recent.length) {
        const row = node('section', 'knowledge-quick-search-recents');
        row.appendChild(node('h3', '', text('最近搜索', 'Recent searches')));
        recent.forEach(item => row.appendChild(button(item.q, () => { input.value = item.q; input.focus(); search(); })));
        row.appendChild(button(text('清除记录', 'Clear recent'), () => { recent = []; try { localStorage.removeItem(key); } catch {} empty(); }));
        results.appendChild(row);
      }
      const shortcuts = node('section', 'knowledge-quick-search-shortcuts');
      for (const [route, cn, en] of [['all', '全部文章', 'All articles'], ['reading', '我的阅读', 'My reading'], ['algorithms', '算法中心', 'Algorithm center'], ['contests', '查询竞赛', 'Contests']]) {
        shortcuts.appendChild(button(text(cn, en), () => leave(route)));
      }
      if (options.isAuthor) shortcuts.appendChild(button(text('写文章', 'Write an article'), () => leave('writer')));
      results.appendChild(shortcuts);
    }
    function fullResults() {
      const q = input.value.trim();
      if (!q) { input.focus(); return; }
      remember(q); leave('all', { q, sort: 'latest', page: 1 });
    }
    function highlighted(target, value, q) {
      const source = String(value || '').slice(0, 360);
      const index = source.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
      if (index < 0) { target.textContent = source; return; }
      target.append(document.createTextNode(source.slice(0, index)), node('mark', '', source.slice(index, index + q.length)), document.createTextNode(source.slice(index + q.length)));
    }
    async function search() {
      clearTimeout(timer); request?.abort();
      const run = ++sequence;
      const q = input.value.trim();
      if (!q) { empty(); return; }
      status.textContent = text('正在搜索…', 'Searching…'); results.replaceChildren();
      request = new AbortController();
      try {
        const response = await options.repository.getPosts({ q, page: 1, pageSize: 6, sort: 'latest' }, { signal: request.signal });
        if (closed || run !== sequence) return;
        const total = response.pagination.total;
        status.textContent = text('找到 ' + total + ' 篇文章', total === 1 ? '1 article found' : total + ' articles found');
        if (!response.items.length) {
          results.appendChild(node('p', 'knowledge-note', text('没有找到匹配文章，可以换个关键词试试。', 'No matching articles. Try a different keyword.'))); return;
        }
        response.items.forEach(post => {
          const link = node('a', 'knowledge-quick-search-result');
          const url = new URL(location.pathname, location.origin); url.searchParams.set('knowledge', 'post'); url.searchParams.set('slug', post.slug); link.href = url.href;
          const title = node('strong'); highlighted(title, post.title, q);
          const excerpt = node('span'); highlighted(excerpt, post.summary, q);
          link.append(title, excerpt);
          link.addEventListener('click', event => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); remember(q); leave('detail', { slug: post.slug });
          });
          results.appendChild(link);
        });
        if (response.pagination.hasNext) results.appendChild(button(text('查看全部 ' + total + ' 条结果', 'View all ' + total + ' results'), fullResults));
      } catch (error) {
        if (closed || run !== sequence || error.name === 'AbortError') return;
        status.textContent = text('搜索暂时不可用，原页面仍可正常使用。', 'Search is temporarily unavailable. Your page is unchanged.');
        results.append(button(text('重试', 'Retry'), search), button(text('进入完整搜索页', 'Open full search'), fullResults));
      }
    }
    function scheduleInput(event) {
      if (event?.isComposing) return;
      clearTimeout(timer); request?.abort(); sequence++;
      if (!input.value.trim()) { empty(); return; }
      status.textContent = text('等待搜索…', 'Preparing search…');
      timer = setTimeout(search, 280);
    }
    input.addEventListener('compositionstart', () => { clearTimeout(timer); request?.abort(); sequence++; });
    input.addEventListener('compositionend', scheduleInput);
    input.addEventListener('input', scheduleInput);
    form.addEventListener('submit', event => { event.preventDefault(); fullResults(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); cleanup(); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(event.key) || event.isComposing) return;
      const choices = Array.from(results.querySelectorAll('a, button'));
      if (!choices.length) return;
      const index = choices.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % choices.length : (index < 0 ? choices.length - 1 : (index - 1 + choices.length) % choices.length);
      event.preventDefault(); choices[next].focus();
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', cleanup);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    const observer = new MutationObserver(() => { if (!document.body.classList.contains('auth-elegant')) { dialog.close(); cleanup(); } });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    active = { input, close: () => dialog.close() };
    empty(); dialog.showModal(); input.focus();
  }
  window.KnowledgeQuickSearch = { open, normalizeQueries, close: () => active?.close() };
})();

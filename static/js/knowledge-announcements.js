(function () {
  'use strict';
  const DATA_URL = '/assets/knowledge/announcements.json?v=20261124-navigation-1';
  const text = (value, language) => typeof value === 'string' ? value : value?.[language] || value?.zh || '';
  function records(data) {
    if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('Invalid announcements');
    const ids = new Set();
    return data.items.map(item => {
      if (!item || !/^[a-z0-9-]{1,100}$/.test(item.id) || ids.has(item.id) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error('Invalid announcement');
      const date = new Date(item.date + 'T12:00:00Z');
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.date || !['feature', 'fix'].includes(item.type)) throw new Error('Invalid announcement date or type');
      if (!item.title?.zh || !item.title?.en || !Array.isArray(item.changes?.zh) || !Array.isArray(item.steps?.zh)) throw new Error('Missing announcement content');
      ids.add(item.id); return item;
    }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }
  function node(tag, cls, content) { const el = document.createElement(tag); if (cls) el.className = cls; if (content !== undefined) el.textContent = content; return el; }
  function safeLink(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { const url = new URL(value, location.origin); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null; } catch { return null; }
  }
  async function mount(root, { signal, language = 'zh' }) {
    const t = (zh, en) => language === 'en' ? en : zh;
    const panel = node('section', 'knowledge-announcements');
    panel.setAttribute('aria-label', t('公告时间线', 'Announcement timeline'));
    const intro = node('div', 'announcement-intro');
    intro.append(node('p', '', t('更新了什么，怎么使用，都放在这里。', 'What changed and how to use it, in one place.')), node('small', '', t('按更新时间倒序排列；较早条目为历史更新补录。', 'Newest updates first; older entries were added from the existing update history.')));
    const toolbar = node('div', 'announcement-toolbar'), filters = node('div', 'announcement-filters');
    filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', t('公告分类', 'Filter announcements'));
    const search = node('input'); search.type = 'search'; search.placeholder = t('搜索更新或使用方法…', 'Search updates or instructions…'); search.setAttribute('aria-label', t('搜索公告', 'Search announcements'));
    const status = node('p', 'announcement-status', t('正在加载公告…', 'Loading announcements…')); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const timeline = node('div', 'announcement-timeline');
    toolbar.append(filters, search); panel.append(intro, toolbar, status, timeline); root.append(panel);
    let items = [], selectedType = '', query = '', firstRender = true, active = true;
    const controller = new AbortController();
    const stop = () => { active = false; controller.abort(); };
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) { stop(); return; }
    const buttons = [];
    [['', t('全部公告', 'All')], ['feature', t('功能更新', 'Features')], ['fix', t('问题修复', 'Fixes')]].forEach(([type, label]) => {
      const button = node('button', '', label); button.type = 'button'; button.dataset.type = type;
      button.addEventListener('click', () => { selectedType = type; render(); }); filters.append(button); buttons.push(button);
    });
    search.addEventListener('input', () => { query = search.value.trim().toLocaleLowerCase(); render(); });
    function render() {
      if (!active) return;
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.type === selectedType)));
      const visible = items.filter(item => {
        const content = [text(item.title, language), text(item.summary, language), ...['changes', 'steps', 'notes'].flatMap(key => item[key]?.[language] || item[key]?.zh || [])].join(' ').toLocaleLowerCase();
        return (!selectedType || item.type === selectedType) && (!query || content.includes(query));
      });
      timeline.replaceChildren();
      status.textContent = t('共 ' + visible.length + ' 条公告', visible.length + ' announcement' + (visible.length === 1 ? '' : 's'));
      if (!visible.length) { timeline.append(node('p', 'knowledge-note', t('没有匹配的公告，可以换个关键词。', 'No matching announcements. Try another keyword.'))); return; }
      let month = '';
      for (const item of visible) {
        const nextMonth = item.date.slice(0, 7);
        if (nextMonth !== month) { month = nextMonth; timeline.append(node('h2', 'announcement-month', month.replace('-', ' / '))); }
        const article = node('article', 'announcement-entry'); article.id = 'announcement-' + item.id;
        const dateRail = node('div', 'announcement-date'), time = node('time', '', item.date); time.dateTime = item.date;
        dateRail.append(time, node('span', 'announcement-type', item.type === 'fix' ? t('问题修复', 'Fix') : t('功能更新', 'Feature')));
        if (item.id === items[0]?.id) dateRail.append(node('span', 'announcement-latest', t('最新', 'Latest')));
        if (item.historical) dateRail.append(node('small', '', t('历史更新补录', 'Historical update')));
        const details = node('details', 'announcement-detail'); details.open = item.id === visible[0].id || location.hash === '#' + article.id;
        const summary = node('summary'); summary.append(node('h3', '', text(item.title, language)));
        const body = node('div', 'announcement-body'); body.append(node('p', 'announcement-summary', text(item.summary, language)));
        for (const [key, label, tag] of [['changes', t('更新内容', 'What changed'), 'ul'], ['steps', t('使用方法', 'How to use it'), 'ol'], ['notes', t('说明', 'Notes'), 'ul']]) {
          const values = item[key]?.[language] || item[key]?.zh || []; if (!values.length) continue;
          const section = node('section', 'announcement-section'); section.append(node('h4', '', label)); const list = node(tag);
          values.forEach(value => list.append(node('li', '', value))); section.append(list); body.append(section);
        }
        const links = node('div', 'announcement-links');
        for (const entry of item.links || []) {
          const url = safeLink(entry.url); if (!url) continue;
          const link = node('a', 'knowledge-route-button', text(entry.label, language)); link.href = url.href;
          if (url.origin !== location.origin) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
          links.append(link);
        }
        const permalink = node('a', 'announcement-permalink', t('公告链接', 'Permalink')); permalink.href = '?knowledge=announcements#' + article.id;
        links.append(permalink); body.append(links); details.append(summary, body); article.append(dateRail, details); timeline.append(article);
      }
      if (firstRender && location.hash) {
        const id = location.hash.slice(1); const target = Array.from(timeline.querySelectorAll('.announcement-entry')).find(el => el.id === id);
        if (target) requestAnimationFrame(() => { if (active) target.scrollIntoView({ block: 'start' }); });
      }
      firstRender = false;
    }
    async function load() {
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(DATA_URL, { signal: controller.signal }); if (!response.ok) throw new Error('Request failed');
        items = records(await response.json()); render();
      } catch {
        if (!active) return;
        status.textContent = t('公告暂时无法加载，请稍后重试。', 'Announcements could not be loaded. Please try again.');
        const retry = node('button', 'knowledge-route-button', t('重新加载', 'Retry')); retry.type = 'button'; retry.addEventListener('click', () => { if (!signal.aborted) window.location.reload(); }); timeline.replaceChildren(retry);
      } finally { clearTimeout(timer); }
    }
    render(); await load();
  }
  window.KnowledgeAnnouncements = { mount, records, safeLink };
}());

(function () {
  'use strict';
  const paths = {
    calendar: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
    update: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2',
    clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    pen: 'm14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14l-1 7Z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[name]); svg.append(path); return svg;
  }
  function render(post, options) {
    const { t, typeLabel, formatDate, coverNode, appendTags, identity } = options;
    const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
    const chip = (name, text, cls) => { const n = el('span', 'knowledge-post-chip ' + (cls || '')); n.append(icon(name), el('span', '', text)); return n; };
    const card = el('article', 'knowledge-content-card knowledge-post-card');
    // Unknown or legacy appearance identifiers always retain the default layout.
    card.dataset.postAppearance = 'default';
    card.dataset.postSlug = post.slug; card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', t('打开文章：') + post.title);
    const body = el('div', 'knowledge-content-body knowledge-post-body');
    const top = el('div', 'knowledge-post-eyebrow');
    top.append(el('span', 'knowledge-post-type', typeLabel(post.type)));
    if (formatDate(post.publishedAt)) top.append(chip('calendar', formatDate(post.publishedAt), 'is-published'));
    if (formatDate(post.updatedAt) && post.updatedAt !== post.publishedAt) top.append(chip('update', formatDate(post.updatedAt) + ' ' + t('更新'), 'is-updated'));
    if (post.isPinned) top.append(el('span', 'knowledge-state-badge', t('置顶')));
    if (post.isFeatured) top.append(el('span', 'knowledge-state-badge', t('精选')));
    const title = el('h3', 'knowledge-post-title', post.title);
    const summaryRow = el('div', 'knowledge-post-summary-row');
    if (post.summary) summaryRow.append(el('p', 'knowledge-post-summary', post.summary));
    const tags = el('div', 'knowledge-card-tags knowledge-post-tags'); appendTags(tags, post.tags);
    if (tags.childElementCount) summaryRow.append(tags);
    const footer = el('div', 'knowledge-post-footer');
    const author = el('div', 'knowledge-post-author');
    let authorIdentity;
    try {
      if (typeof identity === 'function') authorIdentity = identity(post.authorUserId, post.author || 'User');
    } catch (error) {
      console.warn('Author identity unavailable; keeping the new article layout', error);
    }
    author.append(authorIdentity || el('strong', '', post.author || 'User'));
    if (post.category && post.category !== post.title) {
      const category = el('span', 'knowledge-post-category', post.category); category.title = post.category; author.append(category);
    }
    const metrics = el('div', 'knowledge-post-metrics');
    if (post.readingTimeMinutes) metrics.append(chip('clock', post.readingTimeMinutes + ' ' + t('分钟')));
    if (post.wordCount) metrics.append(chip('pen', Number(post.wordCount).toLocaleString() + ' ' + t('字')));
    const read = el('span', 'knowledge-post-read', t('阅读')); read.append(icon('arrow'));
    footer.append(author, metrics, read);
    body.append(top, title, summaryRow, footer);
    const number = String(post.title || '').match(/(?:内部赛|第)\s*(\d{1,4})/);
    if (number) { const mark = el('span', 'knowledge-post-watermark', '#' + number[1]); mark.setAttribute('aria-hidden', 'true'); body.append(mark); }
    const cover = coverNode(post); cover.classList.add('knowledge-post-cover');
    card.append(body, cover); return card;
  }
  window.KnowledgePostCard = { render };
}());

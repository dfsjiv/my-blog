(function () {
  'use strict';
  const name = '阿臻的 Blog';
  const origin = 'https://lilinzheng.top';
  const description = '阿臻的个人博客，记录算法题解、技术文章、学习笔记与项目实践。';
  const titles = { all: '全部文章', articles: '技术文章', solutions: '算法题解', notes: '学习笔记', projects: '项目记录', games: '小游戏', contests: '竞赛中心', algorithms: '算法中心', archives: '归档', categories: '分类', tags: '标签', about: '关于阿臻' };
  const privateRoutes = new Set(['writer', 'drafts', 'manage', 'profile', 'mover', 'invitations', 'backgrounds']);
  function update(route, post) {
    const title = post ? post.title + ' | ' + name : titles[route] ? titles[route] + ' | ' + name : name;
    document.title = title;
    const canonical = new URL(origin);
    if (post) { canonical.searchParams.set('knowledge', 'post'); canonical.searchParams.set('slug', post.slug); }
    else if (titles[route]) canonical.searchParams.set('knowledge', route);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = canonical.href;
    let image = origin + '/assets/knowledge/hero-03.webp';
    try { const candidate = new URL(post?.coverUrl, origin); if (post?.coverUrl && /^https?:$/.test(candidate.protocol) && !candidate.username && !candidate.password) image = candidate.href; } catch {}
    const summary = String(post?.summary || description).slice(0, 300);
    const tags = { description: summary, robots: privateRoutes.has(route) || route === 'detail' && !post || new URL(window.location.href).searchParams.has('q') ? 'noindex,follow' : 'index,follow',
      'og:site_name': name, 'og:title': title, 'og:description': summary, 'og:type': post ? 'article' : 'website', 'og:url': canonical.href, 'og:image': image,
      'twitter:card': 'summary_large_image', 'twitter:title': title, 'twitter:description': summary, 'twitter:image': image };
    for (const [key, value] of Object.entries(tags)) {
      const attribute = key.startsWith('og:') ? 'property' : 'name';
      let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
      if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attribute, key); document.head.appendChild(tag); }
      tag.setAttribute('content', value);
    }
  }
  window.KnowledgePageMetadata = { update };
}());

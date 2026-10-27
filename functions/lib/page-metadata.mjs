import { SITE_ORIGIN, SITE_NAME, SITE_DESCRIPTION, postUrl, escapeXml, readPublicData } from './public-discovery.mjs';

const privateRoutes = new Set(['writer', 'drafts', 'manage', 'profile', 'mover', 'invitations', 'backgrounds']);
const titles = { all: '全部文章', articles: '技术文章', solutions: '算法题解', notes: '学习笔记', projects: '项目记录', games: '小游戏', contests: '竞赛中心', algorithms: '算法中心', archives: '归档', categories: '分类', tags: '标签', about: '关于阿臻' };
export function buildMetadata(url, post = null) {
  const route = url.searchParams.get('knowledge') || 'home';
  const canonical = new URL(SITE_ORIGIN);
  if (titles[route]) canonical.searchParams.set('knowledge', route);
  const title = post ? `${post.title} | ${SITE_NAME}` : titles[route] ? `${titles[route]} | ${SITE_NAME}` : SITE_NAME;
  let image = SITE_ORIGIN + '/assets/knowledge/hero-03.webp';
  try { const candidate = new URL(post?.coverUrl, SITE_ORIGIN); if (/^https?:$/.test(candidate.protocol) && !candidate.username && !candidate.password && post?.coverUrl) image = candidate.href; } catch {}
  return { title, description: String(post?.summary || SITE_DESCRIPTION).slice(0, 300),
    url: post ? postUrl(post.slug) : canonical.href, image, type: post ? 'article' : 'website',
    robots: privateRoutes.has(route) || url.searchParams.has('q') || route === 'post' && !post ? 'noindex,follow' : 'index,follow' };
}
export function metadataTags(meta) {
  const tag = (name, content, attribute = 'name') => `<meta ${attribute}="${name}" content="${escapeXml(content)}" />`;
  return [tag('description', meta.description), tag('robots', meta.robots),
    `<link rel="canonical" href="${escapeXml(meta.url)}" />`,
    tag('og:site_name', SITE_NAME, 'property'), tag('og:title', meta.title, 'property'), tag('og:description', meta.description, 'property'),
    tag('og:url', meta.url, 'property'), tag('og:type', meta.type, 'property'), tag('og:image', meta.image, 'property'),
    tag('twitter:card', 'summary_large_image'), tag('twitter:title', meta.title), tag('twitter:description', meta.description), tag('twitter:image', meta.image)].join('\n');
}
export async function addPageMetadata(context) {
  const url = new URL(context.request.url);
  if (!['/', '/index.html'].includes(url.pathname) || !['GET', 'HEAD'].includes(context.request.method)) return context.next();
  // Preview/temporary domains should not be indexed as duplicates of the production site.
  const response = await context.next();
  if (!response.headers.get('Content-Type')?.includes('text/html') || !response.ok) return response;
  let post = null, timer;
  if (url.searchParams.get('knowledge') === 'post' && url.searchParams.get('slug')) {
    try {
      const data = await Promise.race([
        readPublicData(context.env, '/api/knowledge/posts/' + encodeURIComponent(url.searchParams.get('slug'))),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Metadata timed out')), 1500); })
      ]);
      post = data.post;
    } catch { /* Metadata failure must never stop the page or expose unpublished content. */ }
    finally { clearTimeout(timer); }
  }
  const metadata = buildMetadata(url, post);
  if (url.hostname !== 'lilinzheng.top') metadata.robots = 'noindex,follow';
  let html = await response.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeXml(metadata.title)}</title>`)
    .replace(/<meta\s+(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace('</head>', metadataTags(metadata) + '\n</head>');
  const headers = new Headers(response.headers);
  headers.delete('Content-Length'); headers.delete('ETag'); headers.delete('Last-Modified');
  // Query-specific article metadata must not be reused for another route.
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate, no-transform');
  return new Response(context.request.method === 'HEAD' ? null : html, { status: response.status, headers });
}

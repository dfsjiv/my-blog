import { handleKnowledgeRequest } from './knowledge-api.mjs';

export const SITE_ORIGIN = 'https://lilinzheng.top';
export const SITE_NAME = '阿臻的 Blog';
export const SITE_DESCRIPTION = '阿臻的个人博客，记录算法题解、技术文章、学习笔记与项目实践。';
const PAGE_SIZE = 50;

export function escapeXml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}
export function postUrl(slug) {
  const url = new URL(SITE_ORIGIN);
  url.searchParams.set('knowledge', 'post'); url.searchParams.set('slug', slug);
  return url.href;
}
function xmlResponse(body, request, status = 200) {
  return new Response(request.method === 'HEAD' ? null : '<?xml version="1.0" encoding="UTF-8"?>\n' + body, {
    status, headers: { 'Content-Type': /\/(?:feed|rss)\.xml$/.test(new URL(request.url).pathname) ? 'application/rss+xml; charset=utf-8' : 'application/xml; charset=utf-8', 'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=300' : 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
export async function readPublicData(env, pathname) {
  // Reuse the public API's published/deleted filters, including unmigrated legacy posts.
  // Never forward browser authorization or invoke an admin endpoint.
  const request = new Request(SITE_ORIGIN + pathname);
  const response = await handleKnowledgeRequest({ request, env, url: new URL(request.url),
    jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status }) });
  if (!response.ok) throw new Error('Public content unavailable');
  const result = await response.json();
  if (!result.success) throw new Error('Public content unavailable');
  return result.data;
}
const listPage = (env, page) => readPublicData(env, `/api/knowledge/posts?page=${page}&pageSize=${PAGE_SIZE}&sort=updated`);
function isoDate(value) {
  if (!value) return null;
  const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function handleDiscovery({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(request.url);
  const rawPage = url.searchParams.get('page') || '1';
  if (url.pathname === '/sitemap-posts.xml' && (!/^[1-9]\d{0,4}$/.test(rawPage) || Number(rawPage) > 10000)) {
    return xmlResponse('<error>Invalid sitemap page</error>', request, 400);
  }
  try {
    const first = await listPage(env, 1);
    if (url.pathname === '/sitemap.xml') {
      const count = Math.max(1, Math.ceil(first.pagination.total / PAGE_SIZE));
      if (count > 10000) throw new Error('Sitemap needs a larger index');
      return xmlResponse('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        Array.from({ length: count }, (_, index) => `<sitemap><loc>${escapeXml(SITE_ORIGIN + '/sitemap-posts.xml?page=' + (index + 1))}</loc></sitemap>`).join('') + '</sitemapindex>', request);
    }
    if (url.pathname === '/sitemap-posts.xml') {
      const page = Number(rawPage);
      if (page > Math.max(1, Math.ceil(first.pagination.total / PAGE_SIZE))) return xmlResponse('<error>Sitemap page not found</error>', request, 404);
      const data = page === 1 ? first : await listPage(env, page);
      const home = page === 1 ? `<url><loc>${SITE_ORIGIN}/</loc></url>` : '';
      return xmlResponse('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + home + data.items.map(post => {
        const modified = isoDate(post.updatedAt || post.publishedAt);
        return `<url><loc>${escapeXml(postUrl(post.slug))}</loc>${modified ? '<lastmod>' + modified + '</lastmod>' : ''}</url>`;
      }).join('') + '</urlset>', request);
    }
    if (url.pathname !== '/feed.xml' && url.pathname !== '/rss.xml') return new Response('Not found', { status: 404 });
    const dates = first.items.map(post => isoDate(post.updatedAt || post.publishedAt)).filter(Boolean).sort();
    const lastBuild = dates.length ? '<lastBuildDate>' + new Date(dates.at(-1)).toUTCString() + '</lastBuildDate>' : '';
    const entries = first.items.map(post => {
      const link = escapeXml(postUrl(post.slug)), published = isoDate(post.publishedAt);
      return `<item><title>${escapeXml(post.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid>` +
        `<description>${escapeXml(post.summary)}</description>${published ? '<pubDate>' + new Date(published).toUTCString() + '</pubDate>' : ''}` +
        (post.tags || []).map(tag => `<category>${escapeXml(typeof tag === 'string' ? tag : tag.name)}</category>`).join('') + '</item>';
    }).join('');
    return xmlResponse(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${SITE_NAME}</title><link>${SITE_ORIGIN}/</link>` +
      `<description>${SITE_DESCRIPTION}</description><language>zh-CN</language><atom:link href="${SITE_ORIGIN}/feed.xml" rel="self" type="application/rss+xml"/>` + lastBuild + entries + '</channel></rss>', request);
  } catch {
    // Do not cache an empty sitemap/feed when the database is unavailable.
    return xmlResponse('<error>Public content temporarily unavailable</error>', request, 503);
  }
}

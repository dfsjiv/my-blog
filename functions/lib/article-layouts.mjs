import { normalizeArticleLayout } from './article-layout-policy.mjs';
import { tableExists } from './legacy-knowledge-adapter.mjs';

export async function readArticleLayout(env, post, admin = false) {
  if (!post || post.source === 'legacy-blog' || !await tableExists(env, 'knowledge_article_layouts')) return undefined;
  const row = await env.DB.prepare('SELECT draft_json, published_json FROM knowledge_article_layouts WHERE post_id = ?').bind(post.id).first();
  const text = admin ? row?.draft_json : row?.published_json;
  if (!text) return undefined;
  try {
    const layout = normalizeArticleLayout(JSON.parse(text), 'admin');
    return admin || ['custom', 'free'].includes(layout.mode) ? layout : undefined;
  } catch { return undefined; }
}

// Validate before any article write. No design payload means preserve the saved design.
export async function prepareArticleLayout(env, body, user) {
  if (!Object.hasOwn(body, 'articleLayout')) return undefined;
  const layout = normalizeArticleLayout(body.articleLayout, user.role);
  if (!await tableExists(env, 'knowledge_article_layouts')) {
    if (layout.mode === 'default' && !layout.html && !layout.css && !layout.js) return undefined;
    throw new Error('文章页面设计尚未完成数据库迁移，请先执行 0015_add_article_layouts.sql');
  }
  return JSON.stringify(layout);
}

export function layoutCreate(env, slug, json, published, now) {
  return env.DB.prepare(`INSERT INTO knowledge_article_layouts(post_id, draft_json, published_json, updated_at)
    SELECT id, ?, ?, ? FROM knowledge_posts WHERE slug = ?`).bind(json, published ? json : null, now, slug);
}

export function layoutUpdate(env, id, version, now, json, published) {
  return env.DB.prepare(`INSERT INTO knowledge_article_layouts(post_id, draft_json, published_json, updated_at)
    SELECT id, ?, ?, ? FROM knowledge_posts WHERE id = ? AND version = ? AND updated_at = ? AND changes() > 0
    ON CONFLICT(post_id) DO UPDATE SET draft_json = excluded.draft_json,
      published_json = CASE WHEN ? THEN excluded.draft_json ELSE knowledge_article_layouts.published_json END,
      updated_at = excluded.updated_at`).bind(json, published ? json : null, now, id, version, now, published ? 1 : 0);
}

export function layoutPublish(env, id, version, now) {
  return env.DB.prepare(`UPDATE knowledge_article_layouts SET published_json = draft_json, updated_at = ?
    WHERE post_id = ? AND changes() > 0 AND EXISTS(SELECT 1 FROM knowledge_posts WHERE id = ? AND version = ? AND updated_at = ?)`)
    .bind(now, id, id, version, now);
}

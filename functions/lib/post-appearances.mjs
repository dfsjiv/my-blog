import { tableExists } from './legacy-knowledge-adapter.mjs';

export const POST_APPEARANCES = new Set(['default', 'vinyl', 'collage', 'mecha', 'island', 'holo']);
// Additive, idempotent: never alters or rewrites existing article data.
export const APPEARANCE_SCHEMA = `CREATE TABLE IF NOT EXISTS knowledge_post_appearances (
  post_id INTEGER PRIMARY KEY REFERENCES knowledge_posts(id) ON DELETE CASCADE,
  appearance TEXT NOT NULL CHECK(appearance IN ('default','vinyl','collage','mecha','island','holo'))
)`;

export async function ensureAppearanceStorage(env) {
  await env.DB.prepare(APPEARANCE_SCHEMA).run();
}

export async function readAppearances(env, ids) {
  if (!ids.length || !await tableExists(env, 'knowledge_post_appearances')) return new Map();
  const result = await env.DB.prepare(`SELECT post_id, appearance FROM knowledge_post_appearances
    WHERE post_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  return new Map((result.results || []).map(row => [Number(row.post_id), row.appearance]));
}

export function appearanceCreate(env, slug, appearance) {
  return env.DB.prepare(`INSERT INTO knowledge_post_appearances(post_id, appearance)
    SELECT id, ? FROM knowledge_posts WHERE slug = ?`).bind(appearance, slug);
}

export function appearanceUpdate(env, id, version, updatedAt, appearance) {
  // Match the article's optimistic-lock result within the same atomic batch.
  return env.DB.prepare(`INSERT INTO knowledge_post_appearances(post_id, appearance)
    SELECT id, ? FROM knowledge_posts WHERE id = ? AND version = ? AND updated_at = ?
    ON CONFLICT(post_id) DO UPDATE SET appearance = excluded.appearance`)
    .bind(appearance, id, version, updatedAt);
}

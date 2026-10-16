export const POST_APPEARANCES = new Set(['default', 'vinyl', 'collage', 'mecha', 'island', 'holo', 'spider', 'armor', 'hand']);
// Additive, idempotent: never alters or rewrites existing article data.
export const APPEARANCE_SCHEMA = `CREATE TABLE IF NOT EXISTS knowledge_post_presentation (
  post_id INTEGER PRIMARY KEY REFERENCES knowledge_posts(id) ON DELETE CASCADE,
  appearance TEXT NOT NULL CHECK(length(appearance) BETWEEN 1 AND 40)
)`;

export async function ensureAppearanceStorage(env) {
  await env.DB.prepare(APPEARANCE_SCHEMA).run();
}

export async function readAppearances(env, ids) {
  if (!ids.length) return new Map();
  const tables = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
    AND name IN ('knowledge_post_appearances', 'knowledge_post_presentation')`).all();
  const present = new Set((tables.results || []).map(row => row.name));
  // Read old records first; new records override them without rewriting old data.
  const names = ['knowledge_post_appearances', 'knowledge_post_presentation'].filter(name => present.has(name));
  if (!names.length) return new Map();
  const result = await env.DB.prepare(names.map((name, priority) => `SELECT post_id, appearance, ${priority} AS priority FROM ${name}
    WHERE post_id IN (${ids.map(() => '?').join(',')})`).join(' UNION ALL ') + ' ORDER BY priority ASC').bind(...names.flatMap(() => ids)).all();
  return new Map((result.results || []).map(row => [Number(row.post_id), row.appearance]));
}

export function appearanceCreate(env, slug, appearance) {
  return env.DB.prepare(`INSERT INTO knowledge_post_presentation(post_id, appearance)
    SELECT id, ? FROM knowledge_posts WHERE slug = ?`).bind(appearance, slug);
}

export function appearanceUpdate(env, id, version, updatedAt, appearance) {
  // Match the article's optimistic-lock result within the same atomic batch.
  return env.DB.prepare(`INSERT INTO knowledge_post_presentation(post_id, appearance)
    SELECT id, ? FROM knowledge_posts WHERE id = ? AND version = ? AND updated_at = ?
    ON CONFLICT(post_id) DO UPDATE SET appearance = excluded.appearance`)
    .bind(appearance, id, version, updatedAt);
}

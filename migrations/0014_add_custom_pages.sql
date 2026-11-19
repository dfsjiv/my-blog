-- Additive only: existing users, articles and homepage remain unchanged.
CREATE TABLE IF NOT EXISTS custom_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    published_json TEXT,
    is_homepage INTEGER NOT NULL DEFAULT 0 CHECK (is_homepage IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    deleted_at TEXT,
    CHECK (is_homepage = 0 OR (published_json IS NOT NULL AND deleted_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_custom_pages_owner ON custom_pages(owner_user_id, deleted_at, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_pages_home ON custom_pages(is_homepage) WHERE is_homepage = 1;

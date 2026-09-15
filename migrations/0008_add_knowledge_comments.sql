PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS knowledge_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_source TEXT NOT NULL CHECK (post_source IN ('knowledge', 'legacy-blog')),
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES knowledge_comments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_comments_post_created
ON knowledge_comments(post_source, post_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_knowledge_comments_parent
ON knowledge_comments(parent_id);

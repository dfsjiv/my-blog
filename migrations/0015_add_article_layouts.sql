-- One independently saved design per article. Existing article bodies are untouched.
CREATE TABLE IF NOT EXISTS knowledge_article_layouts (
    post_id INTEGER PRIMARY KEY REFERENCES knowledge_posts(id) ON DELETE CASCADE,
    draft_json TEXT NOT NULL,
    published_json TEXT,
    updated_at TEXT NOT NULL
);

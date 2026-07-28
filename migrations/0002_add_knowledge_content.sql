PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS knowledge_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_user_id INTEGER NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (
        type IN ('article', 'solution', 'note', 'project', 'essay')
    ),
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    content_markdown TEXT NOT NULL DEFAULT '',
    cover_url TEXT NULL,
    category TEXT NULL,
    category_slug TEXT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'published', 'archived', 'deleted')
    ),
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
    source_url TEXT NULL,
    word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
    reading_time_minutes INTEGER NOT NULL DEFAULT 1 CHECK (
        reading_time_minutes >= 1
    ),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT NULL,
    deleted_at TEXT NULL,
    FOREIGN KEY (author_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS knowledge_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES knowledge_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES knowledge_tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_solution_meta (
    post_id INTEGER PRIMARY KEY,
    platform TEXT NULL,
    problem_id TEXT NULL,
    problem_title TEXT NULL,
    problem_url TEXT NULL,
    difficulty TEXT NULL,
    algorithms_json TEXT NOT NULL DEFAULT '[]',
    language TEXT NULL,
    time_complexity TEXT NULL,
    space_complexity TEXT NULL,
    accepted INTEGER NULL CHECK (accepted IS NULL OR accepted IN (0, 1)),
    FOREIGN KEY (post_id) REFERENCES knowledge_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_status_published
ON knowledge_posts(status, published_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_type_published
ON knowledge_posts(type, published_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_category_published
ON knowledge_posts(category_slug, published_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_author_status
ON knowledge_posts(author_user_id, status);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_featured_published
ON knowledge_posts(is_featured, published_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_pinned_published
ON knowledge_posts(is_pinned, published_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_post_tags_tag_post
ON knowledge_post_tags(tag_id, post_id);

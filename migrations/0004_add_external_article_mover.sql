PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS external_article_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('nowcoder', 'zhihu')),
    source_url TEXT NOT NULL,
    source_identity TEXT NOT NULL,
    remote_article_id TEXT NULL,
    title TEXT NOT NULL,
    raw_content TEXT NOT NULL,
    raw_content_format TEXT NOT NULL CHECK (
        raw_content_format IN ('html', 'markdown', 'json', 'unknown')
    ),
    raw_metadata_json TEXT NOT NULL DEFAULT '{}',
    normalized_markdown TEXT NOT NULL DEFAULT '',
    content_checksum TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id),
    UNIQUE (owner_user_id, platform, source_identity, content_checksum)
);

CREATE TABLE IF NOT EXISTS knowledge_external_source_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('nowcoder', 'zhihu')),
    source_identity TEXT NOT NULL,
    source_url TEXT NOT NULL,
    remote_article_id TEXT NULL,
    snapshot_id INTEGER NOT NULL,
    knowledge_post_id INTEGER NULL,
    import_status TEXT NOT NULL DEFAULT 'discovered' CHECK (
        import_status IN (
            'discovered', 'importing', 'imported', 'remote_updated',
            'conflict', 'failed'
        )
    ),
    import_nonce TEXT NULL,
    source_published_at TEXT NULL,
    source_updated_at TEXT NULL,
    imported_at TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id),
    FOREIGN KEY (snapshot_id) REFERENCES external_article_snapshots(id),
    FOREIGN KEY (knowledge_post_id) REFERENCES knowledge_posts(id),
    UNIQUE (owner_user_id, platform, source_identity)
);

CREATE INDEX IF NOT EXISTS idx_external_article_snapshots_source
ON external_article_snapshots(owner_user_id, platform, source_identity, fetched_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_external_source_map_status
ON knowledge_external_source_map(owner_user_id, import_status, updated_at);

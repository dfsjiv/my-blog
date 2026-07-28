PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS knowledge_migration_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_slug TEXT NULL,
    target_post_id INTEGER NULL,
    source_checksum TEXT NOT NULL,
    target_checksum TEXT NULL,
    migration_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        migration_status IN ('pending', 'migrated', 'verified', 'conflict', 'failed')
    ),
    migration_message TEXT NULL,
    migrated_at TEXT NULL,
    verified_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_type, source_id),
    FOREIGN KEY (target_post_id) REFERENCES knowledge_posts(id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_migration_map_status
ON knowledge_migration_map(migration_status);

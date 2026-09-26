CREATE TABLE IF NOT EXISTS knowledge_backgrounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    focal_position TEXT NOT NULL DEFAULT 'center'
        CHECK(focal_position IN ('left', 'center', 'right')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0, 1)),
    uploaded_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_backgrounds_queue
    ON knowledge_backgrounds(is_enabled, sort_order, id);

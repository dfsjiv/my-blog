CREATE TABLE IF NOT EXISTS knowledge_invitation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT NOT NULL UNIQUE,
    code_preview TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TEXT NULL,
    used_by INTEGER NULL,
    revoked_at TEXT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (used_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_invitation_codes_status
ON knowledge_invitation_codes(used_at, revoked_at, expires_at, id);

CREATE TABLE IF NOT EXISTS registration_rate_limits (
    client_key TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_rate_limits_locked_until
ON registration_rate_limits(locked_until);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique_nocase
ON users(username COLLATE NOCASE);

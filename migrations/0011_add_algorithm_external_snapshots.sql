-- Additive only: existing CF/AtCoder submissions and all blog tables remain untouched.
-- Credentials must never be stored here. These columns hold normalized statistics only.
CREATE TABLE IF NOT EXISTS algorithm_external_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    platform TEXT NOT NULL CHECK(platform IN ('vjudge','luogu','nowcoder','leetcode')),
    handle TEXT NOT NULL,
    snapshot_json TEXT NOT NULL DEFAULT '{}',
    previous_solved INTEGER,
    last_synced_at TEXT,
    sync_lock_until INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, platform)
);

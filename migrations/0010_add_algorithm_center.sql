-- Additive migration: existing content, users and sessions are unchanged.
CREATE TABLE IF NOT EXISTS algorithm_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    platform TEXT NOT NULL CHECK(platform IN ('codeforces', 'atcoder')),
    handle TEXT NOT NULL,
    profile_json TEXT NOT NULL DEFAULT '{}',
    history_cursor INTEGER NOT NULL DEFAULT 0,
    history_complete INTEGER NOT NULL DEFAULT 0,
    latest_second INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT,
    sync_lock_until INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, platform)
);
CREATE TABLE IF NOT EXISTS algorithm_submissions (
    account_id INTEGER NOT NULL REFERENCES algorithm_accounts(id) ON DELETE CASCADE,
    submission_id TEXT NOT NULL,
    problem_key TEXT NOT NULL,
    submitted_second INTEGER NOT NULL,
    verdict TEXT NOT NULL,
    problem_json TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(account_id, submission_id)
);
CREATE INDEX IF NOT EXISTS idx_algorithm_submissions_account_time
    ON algorithm_submissions(account_id, submitted_second);

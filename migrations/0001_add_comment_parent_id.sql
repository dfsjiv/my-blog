ALTER TABLE comments ADD COLUMN parent_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_comments_parent_id
ON comments(parent_id);


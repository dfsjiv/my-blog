CREATE TABLE IF NOT EXISTS knowledge_post_appearances (
  post_id INTEGER PRIMARY KEY REFERENCES knowledge_posts(id) ON DELETE CASCADE,
  appearance TEXT NOT NULL CHECK(appearance IN ('default','vinyl','collage','mecha','island','holo'))
);

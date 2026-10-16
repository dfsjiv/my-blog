-- Keep old appearance records intact. Application reads both tables,
-- with this extensible table taking precedence for newly saved choices.
CREATE TABLE IF NOT EXISTS knowledge_post_presentation (
  post_id INTEGER PRIMARY KEY REFERENCES knowledge_posts(id) ON DELETE CASCADE,
  appearance TEXT NOT NULL CHECK(length(appearance) BETWEEN 1 AND 40)
);

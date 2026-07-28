# Knowledge Site Legacy Compatibility

## Production audit

- Cloudflare Pages project: `my-blog`
- D1 binding: `DB`
- D1 database ID: `42badb5d-01f2-4272-88b5-25f2b728aea0`
- D1 resource name: `blog-db`
- Legacy table: `articles`
- Legacy public APIs: `GET /api/articles` and `GET /api/articles/:id`
- Legacy article count at audit time: 2
- Legacy categories: `algorithm` (1), `essay` (1)
- Legacy content contract: Markdown source stored in `content`
- Legacy slug, tags, status, cover and permalink fields: not present
- Existing rows are public because the legacy API has no draft/status filter.
- The old UI opens details by article ID inside the blog window; it has no standalone
  article permalink. `legacyUrl` therefore remains `null`.
- Production did not contain `knowledge_*` tables at audit time. The repository
  includes their additive schema migration.

The compatibility layer is `functions/lib/legacy-knowledge-adapter.mjs`. It does
not write to or alter `articles`.

## Type mapping

| Legacy category | Knowledge type | Display category |
| --- | --- | --- |
| `algorithm` | `article` | 算法文章 |
| `computer` | `article` | 计算机技术 |
| `essay` | `essay` | 个人随笔 |

Unknown categories map to `article`. No title or body inference is used.

## Safe migration stages

1. Audit the legacy table read-only.
2. Read legacy content through the compatibility adapter.
3. Run the admin dry-run and resolve conflicts.
4. Copy validated rows to the knowledge tables. Never move them.
5. Verify each row's checksum, slug, tags, timestamps and original body.
6. Prefer verified knowledge rows while retaining the legacy fallback.
7. Observe both paths for an extended period.
8. Stop fallback only after explicit approval, while retaining the legacy table.

Deleting the legacy table is not a migration step.

## Format and checksum rules

Markdown is copied byte-for-byte. HTML is returned as `contentFormat: "html"` and
sanitized for display, but it is blocked from automatic migration while the target
schema only has `content_markdown`. A future additive schema change must preserve
raw content and its format before any HTML article can migrate.

The SHA-256 canonical payload includes title, original body, original slug,
published time, category and tags. `knowledge_migration_map` uniquely identifies
`(source_type, source_id)`, making a future copy operation idempotent.

No image URL is downloaded, rewritten or uploaded during audit or migration.

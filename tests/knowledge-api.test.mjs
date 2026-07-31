import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
    calculateContentMetrics,
    createMarkdownSummary,
    handleKnowledgeRequest,
    normalizeSlug
} from "../functions/lib/knowledge-api.mjs";

const rootDir = path.resolve(import.meta.dirname, "..");

class D1Statement {
    constructor(database, sql, bindings = []) {
        this.database = database;
        this.sql = sql;
        this.bindings = bindings;
    }

    bind(...bindings) {
        return new D1Statement(this.database, this.sql, bindings);
    }

    first() {
        return this.database.prepare(this.sql).get(...this.bindings) || null;
    }

    all() {
        return {
            success: true,
            results: this.database.prepare(this.sql).all(...this.bindings)
        };
    }

    run() {
        return runStatement(this.database, this.sql, this.bindings);
    }
}

class D1Database {
    constructor(database) {
        this.database = database;
    }

    prepare(sql) {
        return new D1Statement(this.database, sql);
    }

    batch(statements) {
        this.database.exec("BEGIN");
        try {
            const results = statements.map((statement) => {
                const prepared = this.database.prepare(statement.sql);
                if (/^\s*(SELECT|WITH)\b/i.test(statement.sql)) {
                    return {
                        success: true,
                        results: prepared.all(...statement.bindings),
                        meta: { changes: 0 }
                    };
                }
                return runStatement(this.database, statement.sql, statement.bindings);
            });
            this.database.exec("COMMIT");
            return results;
        }
        catch (error) {
            this.database.exec("ROLLBACK");
            throw error;
        }
    }
}

function runStatement(database, sql, bindings) {
    const result = database.prepare(sql).run(...bindings);
    return {
        success: true,
        meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid)
        }
    };
}

function createDatabase() {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            role TEXT NOT NULL
        );
        INSERT INTO users (id, username, role)
        VALUES (1, 'Lee Ethan', 'admin'), (2, 'reader', 'user');
        CREATE TABLE articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            summary TEXT,
            content TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('algorithm','computer','essay')),
            author_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(author_id) REFERENCES users(id)
        );
    `);
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0002_add_knowledge_content.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0003_add_knowledge_migration_map.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0004_add_external_article_mover.sql"),
        "utf8"
    ));
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0005_add_knowledge_favorites.sql"),
        "utf8"
    ));
    return { sqlite, DB: new D1Database(sqlite) };
}

function createApi(env) {
    return async function requestApi(pathname, options = {}) {
        const headers = new Headers(options.headers || {});
        if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
        if (options.body !== undefined) headers.set("Content-Type", "application/json");
        const request = new Request(`https://example.test${pathname}`, {
            method: options.method || "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
        const response = await handleKnowledgeRequest({
            request,
            env,
            url: new URL(request.url),
            jsonResponse(data, status = 200) {
                return new Response(JSON.stringify(data), {
                    status,
                    headers: { "Content-Type": "application/json" }
                });
            },
            getBearerToken(currentRequest) {
                const value = currentRequest.headers.get("Authorization") || "";
                return value.startsWith("Bearer ") ? value.slice(7) : null;
            },
            async getAuthenticatedUser(token) {
                if (token === "admin-token") {
                    return { id: 1, username: "Lee Ethan", role: "admin" };
                }
                if (token === "user-token") {
                    return { id: 2, username: "reader", role: "user" };
                }
                return null;
            }
        });
        return {
            status: response.status,
            body: await response.json()
        };
    };
}

function articleInput(overrides = {}) {
    return {
        type: "article",
        title: "二分查找基础",
        summary: "",
        contentMarkdown: "# 二分查找\n\n这是一篇算法学习文章。",
        category: "技术文章",
        tags: ["C++", "算法", "C++", "  算法  "],
        status: "draft",
        isPinned: false,
        isFeatured: false,
        coverUrl: null,
        sourceUrl: null,
        solutionMeta: null,
        ...overrides
    };
}

function solutionInput(overrides = {}) {
    return {
        type: "solution",
        title: "示例题解",
        slug: "sample-solution",
        summary: "",
        contentMarkdown: "# 题解\n\n使用二分完成。",
        category: "算法题解",
        tags: ["二分", "贪心"],
        status: "draft",
        isPinned: false,
        isFeatured: true,
        coverUrl: null,
        sourceUrl: null,
        solutionMeta: {
            platform: "Codeforces",
            problemId: "1234A",
            problemTitle: "Example",
            problemUrl: "https://codeforces.com/problemset/problem/1234/A",
            difficulty: "1200",
            algorithms: ["二分", "贪心"],
            language: "C++",
            timeComplexity: "O(n log n)",
            spaceComplexity: "O(n)",
            accepted: true
        },
        ...overrides
    };
}

test("knowledge migration creates isolated tables and constraints", () => {
    const { sqlite } = createDatabase();
    const tables = sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'knowledge_%'
        ORDER BY name
    `).all().map((row) => row.name);
    assert.deepEqual(tables, [
        "knowledge_external_source_map",
        "knowledge_favorites",
        "knowledge_migration_map",
        "knowledge_post_tags",
        "knowledge_posts",
        "knowledge_solution_meta",
        "knowledge_tags"
    ]);
    assert.equal(
        sqlite.prepare(`
            SELECT COUNT(*) AS count FROM sqlite_master
            WHERE type = 'table' AND name = 'external_article_snapshots'
        `).get().count,
        1
    );
    assert.throws(() => sqlite.prepare(`
        INSERT INTO knowledge_posts (
            author_user_id, slug, type, title, status, created_at, updated_at
        ) VALUES (1, 'invalid', 'unknown', 'Invalid', 'draft', 'now', 'now')
    `).run());
    sqlite.close();
});

test("favorites support public listing and admin CRUD with multiple links", async () => {
    const env = createDatabase();
    const api = createApi(env);
    const input = {
        kind: "anime",
        title: "Example Anime",
        description: "A favorite series.",
        coverUrl: "https://example.test/cover.webp",
        status: "published",
        sortOrder: 2,
        links: [
            { platform: "Bilibili", label: "Watch", url: "https://www.bilibili.com/bangumi/play/example" },
            { platform: "Official", label: "Website", url: "https://example.com/anime" }
        ]
    };

    const forbidden = await api("/api/knowledge/admin/favorites", {
        method: "POST",
        token: "user-token",
        body: input
    });
    assert.equal(forbidden.status, 403);

    const created = await api("/api/knowledge/admin/favorites", {
        method: "POST",
        token: "admin-token",
        body: input
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.item.links.length, 2);

    const listed = await api("/api/knowledge/favorites?kind=anime");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.items.length, 1);
    assert.equal(listed.body.data.items[0].title, "Example Anime");

    const updated = await api(`/api/knowledge/admin/favorites/${created.body.data.item.id}`, {
        method: "PATCH",
        token: "admin-token",
        body: { ...input, title: "Updated Anime", status: "draft" }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.item.title, "Updated Anime");
    const publicAfterDraft = await api("/api/knowledge/favorites?kind=anime");
    assert.equal(publicAfterDraft.body.data.items.length, 0);

    const removed = await api(`/api/knowledge/admin/favorites/${created.body.data.item.id}`, {
        method: "DELETE",
        token: "admin-token"
    });
    assert.equal(removed.status, 200);
});

test("knowledge helpers support Chinese slugs, summaries, and mixed word counts", () => {
    assert.equal(normalizeSlug("  二分查找 / Lower Bound  "), "二分查找-lower-bound");
    const summary = createMarkdownSummary("```cpp\nint main() {}\n```\n\n**真正摘要**");
    assert.equal(summary, "真正摘要");
    const metrics = calculateContentMetrics("算法 article words");
    assert.equal(metrics.wordCount, 4);
    assert.ok(metrics.readingTimeMinutes >= 1);
});

test("knowledge API enforces author permissions and full post lifecycle", async () => {
    const { sqlite, DB } = createDatabase();
    const api = createApi({ DB });

    const emptyPublic = await api("/api/knowledge/posts");
    assert.equal(emptyPublic.status, 200);
    assert.equal(emptyPublic.body.data.pagination.total, 0);

    const unauthenticatedAdmin = await api("/api/knowledge/admin/posts");
    assert.equal(unauthenticatedAdmin.status, 401);
    assert.equal(unauthenticatedAdmin.body.error.code, "UNAUTHORIZED");

    const forbiddenCreate = await api("/api/knowledge/admin/posts", {
        method: "POST",
        token: "user-token",
        body: articleInput()
    });
    assert.equal(forbiddenCreate.status, 403);
    assert.equal(forbiddenCreate.body.error.code, "FORBIDDEN");

    const unauthenticatedImageUpload = await api("/api/knowledge/admin/images", {
        method: "POST"
    });
    assert.equal(unauthenticatedImageUpload.status, 401);
    const forbiddenImageUpload = await api("/api/knowledge/admin/images", {
        method: "POST",
        token: "user-token"
    });
    assert.equal(forbiddenImageUpload.status, 403);
    const unconfiguredImageUpload = await api("/api/knowledge/admin/images", {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(unconfiguredImageUpload.status, 503);

    const invalidInput = await api("/api/knowledge/admin/posts", {
        method: "POST",
        token: "admin-token",
        body: articleInput({
            type: "unknown",
            sourceUrl: "javascript:alert(1)"
        })
    });
    assert.equal(invalidInput.status, 400);
    assert.equal(invalidInput.body.error.code, "VALIDATION_ERROR");
    assert.ok(invalidInput.body.error.fields.type);
    assert.ok(invalidInput.body.error.fields.sourceUrl);

    const createdDraft = await api("/api/knowledge/admin/posts", {
        method: "POST",
        token: "admin-token",
        body: articleInput()
    });
    assert.equal(createdDraft.status, 201);
    assert.equal(createdDraft.body.data.post.authorUserId, 1);
    assert.equal(createdDraft.body.data.post.status, "draft");
    assert.equal(createdDraft.body.data.post.tags.length, 2);
    assert.equal(createdDraft.body.data.post.version, 1);
    assert.ok(createdDraft.body.data.post.summary);
    const articleId = createdDraft.body.data.post.id;
    const articleSlug = createdDraft.body.data.post.slug;

    assert.equal(
        Number(sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_tags").get().count),
        2
    );
    const publicDraftDetail = await api(`/api/knowledge/posts/${articleSlug}`);
    assert.equal(publicDraftDetail.status, 404);
    assert.equal((await api("/api/knowledge/posts")).body.data.pagination.total, 0);

    const createdSolution = await api("/api/knowledge/admin/posts", {
        method: "POST",
        token: "admin-token",
        body: solutionInput()
    });
    assert.equal(createdSolution.status, 201);
    assert.equal(createdSolution.body.data.post.solutionMeta.platform, "Codeforces");
    const solutionId = createdSolution.body.data.post.id;

    const duplicateSlug = await api("/api/knowledge/admin/posts", {
        method: "POST",
        token: "admin-token",
        body: articleInput({ slug: "sample-solution", title: "重复 Slug" })
    });
    assert.equal(duplicateSlug.status, 409);
    assert.equal(duplicateSlug.body.error.code, "SLUG_CONFLICT");

    const updated = await api(`/api/knowledge/admin/posts/${articleId}`, {
        method: "PATCH",
        token: "admin-token",
        body: {
            version: 1,
            title: "二分查找完整指南",
            tags: ["算法", "数据结构"]
        }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.post.version, 2);
    assert.deepEqual(
        updated.body.data.post.tags.map((tag) => tag.name).sort(),
        ["数据结构", "算法"]
    );

    const staleUpdate = await api(`/api/knowledge/admin/posts/${articleId}`, {
        method: "PATCH",
        token: "admin-token",
        body: { version: 1, title: "旧页面覆盖" }
    });
    assert.equal(staleUpdate.status, 409);
    assert.equal(staleUpdate.body.error.code, "VERSION_CONFLICT");

    const published = await api(`/api/knowledge/admin/posts/${articleId}/publish`, {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(published.status, 200);
    assert.equal(published.body.data.post.status, "published");
    assert.equal(published.body.data.post.version, 3);
    assert.ok(published.body.data.post.publishedAt);

    const secondPublished = await api("/api/knowledge/admin/posts", {
        method: "POST",
        token: "admin-token",
        body: articleInput({
            title: "网络学习笔记",
            slug: "network-note",
            type: "note",
            category: "学习笔记",
            tags: ["网络", "算法"],
            status: "published",
            contentMarkdown: "# 网络\n\nTCP 和 UDP。"
        })
    });
    assert.equal(secondPublished.status, 201);
    assert.equal(
        Number(sqlite.prepare(`
            SELECT COUNT(*) AS count FROM knowledge_tags WHERE name = '算法'
        `).get().count),
        1
    );
    assert.equal(
        Number(sqlite.prepare(`
            SELECT COUNT(*) AS count
            FROM knowledge_post_tags AS pt
            JOIN knowledge_tags AS t ON t.id = pt.tag_id
            WHERE t.name = '算法'
        `).get().count),
        2
    );

    const paged = await api("/api/knowledge/posts?page=1&pageSize=1");
    assert.equal(paged.body.data.items.length, 1);
    assert.equal(paged.body.data.pagination.total, 2);
    assert.equal(paged.body.data.pagination.totalPages, 2);
    assert.equal(paged.body.data.pagination.hasNext, true);

    assert.equal(
        (await api("/api/knowledge/posts?type=article")).body.data.pagination.total,
        1
    );
    assert.equal(
        (await api("/api/knowledge/posts?category=技术文章")).body.data.pagination.total,
        1
    );
    assert.equal(
        (await api("/api/knowledge/posts?tag=算法")).body.data.pagination.total,
        2
    );
    assert.equal(
        (await api("/api/knowledge/posts?q=完整指南")).body.data.pagination.total,
        1
    );
    assert.equal(
        (await api("/api/knowledge/posts?sort=latest%20DESC%3B%20DROP%20TABLE%20users")).status,
        400
    );
    assert.equal(
        Number(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get().count),
        2
    );

    const publicDetail = await api(`/api/knowledge/posts/${articleSlug}`);
    assert.equal(publicDetail.status, 200);
    assert.equal(typeof publicDetail.body.data.post.contentMarkdown, "string");
    assert.equal(publicDetail.body.data.post.authorUserId, undefined);
    assert.equal(
        Object.prototype.hasOwnProperty.call(
            (await api("/api/knowledge/posts")).body.data.items[0],
            "contentMarkdown"
        ),
        false
    );

    const facets = await api("/api/knowledge/facets");
    assert.equal(facets.status, 200);
    assert.equal(facets.body.data.stats.posts, 2);
    assert.equal(facets.body.data.stats.notes, 1);
    assert.equal(facets.body.data.stats.solutions, 0);

    const unpublished = await api(`/api/knowledge/admin/posts/${articleId}/unpublish`, {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(unpublished.body.data.post.status, "draft");
    assert.ok(unpublished.body.data.post.publishedAt);
    assert.equal((await api(`/api/knowledge/posts/${articleSlug}`)).status, 404);

    await api(`/api/knowledge/admin/posts/${articleId}/publish`, {
        method: "POST",
        token: "admin-token"
    });
    const archived = await api(`/api/knowledge/admin/posts/${articleId}/archive`, {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(archived.body.data.post.status, "archived");
    assert.equal((await api(`/api/knowledge/posts/${articleSlug}`)).status, 404);

    const deleted = await api(`/api/knowledge/admin/posts/${articleId}`, {
        method: "DELETE",
        token: "admin-token"
    });
    assert.equal(deleted.body.data.post.status, "deleted");
    assert.ok(deleted.body.data.post.deletedAt);
    assert.equal((await api(`/api/knowledge/posts/${articleSlug}`)).status, 404);
    const adminDeletedList = await api(
        "/api/knowledge/admin/posts?status=deleted",
        { token: "admin-token" }
    );
    assert.equal(adminDeletedList.body.data.pagination.total, 1);

    const restored = await api(`/api/knowledge/admin/posts/${articleId}/restore`, {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(restored.body.data.post.status, "draft");
    assert.equal(restored.body.data.post.deletedAt, null);

    const solutionBefore = await api(`/api/knowledge/admin/posts/${solutionId}`, {
        token: "admin-token"
    });
    const solutionConverted = await api(`/api/knowledge/admin/posts/${solutionId}`, {
        method: "PATCH",
        token: "admin-token",
        body: {
            version: solutionBefore.body.data.post.version,
            type: "article",
            title: "普通算法文章"
        }
    });
    assert.equal(solutionConverted.status, 200);
    assert.equal(solutionConverted.body.data.post.solutionMeta, null);
    assert.equal(
        Number(sqlite.prepare(`
            SELECT COUNT(*) AS count
            FROM knowledge_solution_meta
            WHERE post_id = ?
        `).get(solutionId).count),
        0
    );

    const finalFacets = await api("/api/knowledge/facets");
    assert.equal(finalFacets.body.data.stats.posts, 1);
    assert.equal(finalFacets.body.data.stats.notes, 1);
    sqlite.close();
});

test("article mover previews safely and imports one idempotent draft", async () => {
    const { sqlite, DB } = createDatabase();
    const api = createApi({ DB });
    let externalHtml = `<!doctype html>
        <html><head>
          <meta property="og:title" content="题解 | 示例题_牛客网">
          <meta name="description" content="公开题解摘要">
        </head><body>
          <span class="name-text">Lee Ethan</span>
          <span class="time-text">07-20 12:30</span>
          <div class="content-post-title"><h1>题解 | 示例题</h1></div>
          <a class="discuss-terminal-card"
             href="https://www.nowcoder.com/practice/abc123">
             <p class="question-title">示例题</p>
          </a>
          <div class="nc-slate-editor-content">
            <h2>思路</h2>
            <p onclick="steal()">使用 <strong>二分</strong>。</p>
            <script>window.bad = true</script>
            <pre><code>int main() { return 0; }</code></pre>
            <img src="https://uploadfiles.nowcoder.com/example.png"
                 onerror="steal()">
          </div>
        </body></html>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(externalHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
    });
    try {
        const forbidden = await api("/api/knowledge/admin/article-mover/preview", {
            method: "POST",
            token: "user-token",
            body: { urls: ["https://www.nowcoder.com/discuss/123456"] }
        });
        assert.equal(forbidden.status, 403);

        const preview = await api("/api/knowledge/admin/article-mover/preview", {
            method: "POST",
            token: "admin-token",
            body: { urls: ["https://www.nowcoder.com/discuss/123456"] }
        });
        assert.equal(preview.status, 200);
        assert.equal(preview.body.data.items[0].ok, true);
        assert.equal(preview.body.data.items[0].type, "solution");
        assert.match(preview.body.data.items[0].contentMarkdown, /二分/);
        assert.doesNotMatch(preview.body.data.items[0].safeHtml, /script|onclick|onerror/i);
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_posts").get().count,
            0
        );
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM external_article_snapshots").get().count,
            0
        );

        const item = preview.body.data.items[0];
        const imported = await api("/api/knowledge/admin/article-mover/import", {
            method: "POST",
            token: "admin-token",
            body: {
                items: [{
                    selected: true,
                    sourceUrl: item.sourceUrl,
                    title: item.title,
                    slug: item.slug,
                    type: item.type,
                    summary: item.summary,
                    category: item.category,
                    tags: ["牛客", "二分"]
                }]
            }
        });
        assert.equal(imported.status, 200);
        assert.equal(imported.body.data.items[0].code, "IMPORTED");
        assert.equal(
            sqlite.prepare("SELECT status FROM knowledge_posts").get().status,
            "draft"
        );
        assert.equal(
            sqlite.prepare("SELECT source_url FROM knowledge_posts").get().source_url,
            "https://www.nowcoder.com/discuss/123456"
        );
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM external_article_snapshots").get().count,
            1
        );

        const repeated = await api("/api/knowledge/admin/article-mover/import", {
            method: "POST",
            token: "admin-token",
            body: {
                items: [{
                    selected: true,
                    sourceUrl: item.sourceUrl,
                    title: item.title,
                    slug: item.slug,
                    type: item.type
                }]
            }
        });
        assert.equal(repeated.body.data.items[0].code, "ALREADY_IMPORTED");
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_posts").get().count,
            1
        );
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM external_article_snapshots").get().count,
            1
        );

        externalHtml = externalHtml.replace(
            "使用 <strong>二分</strong>。",
            "使用 <strong>二分</strong>，并补充边界说明。"
        );
        const changed = await api("/api/knowledge/admin/article-mover/import", {
            method: "POST",
            token: "admin-token",
            body: {
                items: [{
                    selected: true,
                    sourceUrl: item.sourceUrl,
                    title: item.title,
                    slug: item.slug,
                    type: item.type
                }]
            }
        });
        assert.equal(changed.body.data.items[0].code, "REMOTE_UPDATED");
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_posts").get().count,
            1
        );
        assert.equal(
            sqlite.prepare("SELECT COUNT(*) AS count FROM external_article_snapshots").get().count,
            2
        );
        assert.equal(
            sqlite.prepare("SELECT import_status FROM knowledge_external_source_map").get()
                .import_status,
            "remote_updated"
        );
    }
    finally {
        globalThis.fetch = originalFetch;
        sqlite.close();
    }
});

test("knowledge API adapts legacy articles and keeps migration checks read-only", async () => {
    const { sqlite, DB } = createDatabase();
    sqlite.prepare(`
        INSERT INTO articles (
            title, summary, content, category, author_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        "Legacy Algorithm",
        "Original summary",
        "# Heading\n\nOriginal **Markdown** body.",
        "algorithm",
        1,
        "2026-07-14 12:54:10",
        "2026-07-14 12:54:10"
    );
    const api = createApi({ DB });

    const list = await api("/api/knowledge/posts?type=article");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.pagination.total, 1);
    assert.equal(list.body.data.items[0].source, "legacy-blog");
    assert.equal(list.body.data.items[0].slug, "legacy-article-1");
    assert.equal(list.body.data.items[0].legacyId, 1);

    const detail = await api("/api/knowledge/posts/legacy-article-1");
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.post.contentFormat, "markdown");
    assert.equal(detail.body.data.post.originalContent, "# Heading\n\nOriginal **Markdown** body.");
    const facets = await api("/api/knowledge/facets");
    assert.equal(facets.status, 200);
    assert.equal(facets.body.data.stats.posts, 1);
    assert.equal(facets.body.data.categories[0].slug, "algorithm");

    const emptyChannel = await api("/api/knowledge/posts?channel=games");
    assert.equal(emptyChannel.status, 200);
    assert.equal(emptyChannel.body.data.pagination.total, 0);

    const unauthorizedAudit = await api("/api/knowledge/admin/migration/audit");
    assert.equal(unauthorizedAudit.status, 401);
    const beforeMapCount = sqlite.prepare(
        "SELECT COUNT(*) AS count FROM knowledge_migration_map"
    ).get().count;
    const audit = await api("/api/knowledge/admin/migration/audit", {
        token: "admin-token"
    });
    assert.equal(audit.status, 200);
    assert.equal(audit.body.data.audit.legacyTotal, 1);
    const dryRun = await api("/api/knowledge/admin/migration/dry-run", {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(dryRun.status, 200);
    assert.equal(dryRun.body.data.dryRun.summary.writesPerformed, 0);
    assert.match(dryRun.body.data.dryRun.plans[0].sourceChecksum, /^[a-f0-9]{64}$/);
    assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_migration_map").get().count,
        beforeMapCount
    );
    sqlite.close();
});

test("admin can convert a legacy article once and edit its cover", async () => {
    const { sqlite, DB } = createDatabase();
    sqlite.prepare(`
        INSERT INTO articles (
            title, summary, content, category, author_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        "Editable Legacy Article",
        "Legacy summary",
        "# Legacy body",
        "computer",
        1,
        "2026-07-10 10:00:00",
        "2026-07-11 11:00:00"
    );
    const api = createApi({ DB });

    const adminList = await api("/api/knowledge/admin/posts?status=published", {
        token: "admin-token"
    });
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.data.items[0].source, "legacy-blog");

    const unauthorized = await api("/api/knowledge/admin/legacy-posts/1/edit", {
        method: "POST"
    });
    assert.equal(unauthorized.status, 401);

    const converted = await api("/api/knowledge/admin/legacy-posts/1/edit", {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(converted.status, 201);
    assert.equal(converted.body.data.post.source, "knowledge");
    assert.equal(converted.body.data.post.title, "Editable Legacy Article");
    assert.equal(converted.body.data.post.contentMarkdown, "# Legacy body");
    const convertedId = converted.body.data.post.id;

    const updated = await api(`/api/knowledge/admin/posts/${convertedId}`, {
        method: "PATCH",
        token: "admin-token",
        body: {
            version: converted.body.data.post.version,
            coverUrl: "https://example.test/api/knowledge/images/cover.png"
        }
    });
    assert.equal(updated.status, 200);
    assert.equal(
        updated.body.data.post.coverUrl,
        "https://example.test/api/knowledge/images/cover.png"
    );

    const repeated = await api("/api/knowledge/admin/legacy-posts/1/edit", {
        method: "POST",
        token: "admin-token"
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.data.post.id, convertedId);
    assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_posts").get().count,
        1
    );
    assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_migration_map").get().count,
        1
    );
    assert.equal(
        sqlite.prepare("SELECT title FROM articles WHERE id = 1").get().title,
        "Editable Legacy Article"
    );

    const publicList = await api("/api/knowledge/posts");
    assert.equal(publicList.body.data.pagination.total, 1);
    assert.equal(publicList.body.data.items[0].source, "knowledge");
    sqlite.close();
});

test("public knowledge API works before knowledge tables are deployed", async () => {
    const { sqlite, DB } = createDatabase();
    sqlite.exec(`
        DROP TABLE knowledge_migration_map;
        DROP TABLE knowledge_solution_meta;
        DROP TABLE knowledge_post_tags;
        DROP TABLE knowledge_tags;
        DROP TABLE knowledge_posts;
    `);
    sqlite.prepare(`
        INSERT INTO articles (title, content, category, author_id)
        VALUES ('Legacy Only', 'Body', 'essay', 1)
    `).run();
    const api = createApi({ DB });
    const list = await api("/api/knowledge/posts");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.items[0].title, "Legacy Only");
    const facets = await api("/api/knowledge/facets");
    assert.equal(facets.status, 200);
    assert.equal(facets.body.data.stats.posts, 1);
    sqlite.close();
});

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
    `);
    sqlite.exec(fs.readFileSync(
        path.join(rootDir, "migrations", "0002_add_knowledge_content.sql"),
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
        "knowledge_post_tags",
        "knowledge_posts",
        "knowledge_solution_meta",
        "knowledge_tags"
    ]);
    assert.throws(() => sqlite.prepare(`
        INSERT INTO knowledge_posts (
            author_user_id, slug, type, title, status, created_at, updated_at
        ) VALUES (1, 'invalid', 'unknown', 'Invalid', 'draft', 'now', 'now')
    `).run());
    sqlite.close();
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

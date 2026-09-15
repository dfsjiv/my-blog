import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    handleKnowledgeCommentRequest,
    isKnowledgeCommentPath
} from "../functions/lib/knowledge-comments-api.mjs";
import { onRequest } from "../functions/api/[[path]].js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}

function row(overrides = {}) {
    return {
        id: 1,
        post_source: "knowledge",
        post_id: 9,
        parent_id: null,
        content: "root",
        created_at: "2026-09-15T01:00:00Z",
        author_id: 3,
        author_username: "reader",
        author_role: "user",
        ...overrides
    };
}

function environment(options = {}) {
    const calls = { binds: [], batches: [], runs: [] };
    const firstRows = [...(options.firstRows || [])];
    const DB = {
        prepare(sql) {
            const statement = {
                sql,
                values: [],
                bind(...values) {
                    statement.values = values;
                    calls.binds.push({ sql, values });
                    return statement;
                },
                async first() {
                    return firstRows.shift() ?? null;
                },
                async all() {
                    return { results: options.allRows || [] };
                },
                async run() {
                    calls.runs.push({ sql, values: statement.values });
                    return { meta: { last_row_id: 8 } };
                }
            };
            return statement;
        },
        async batch(statements) {
            calls.batches.push(statements.map((statement) => ({
                sql: statement.sql,
                values: statement.values
            })));
            return [];
        }
    };
    return { env: { DB }, calls };
}

function context(request, env, overrides = {}) {
    return {
        request,
        env,
        url: new URL(request.url),
        jsonResponse,
        getBearerToken: () => "session-token",
        getAuthenticatedUser: async () => ({ id: 7, username: "writer", role: "user" }),
        ...overrides
    };
}

assert.equal(isKnowledgeCommentPath("/api/knowledge/post-comments/knowledge/9"), true);
assert.equal(isKnowledgeCommentPath("/api/knowledge/post-comments/legacy-blog/3"), true);
assert.equal(isKnowledgeCommentPath("/api/knowledge/posts/9"), false);

{
    const { env } = environment({
        firstRows: [{ id: 9 }],
        allRows: [row(), row({ id: 2, parent_id: 1, content: "reply" })]
    });
    const request = new Request("https://lilinzheng.top/api/knowledge/post-comments/knowledge/9");
    const response = await handleKnowledgeCommentRequest(context(request, env));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.comments[0].id, 1);
    assert.equal(payload.data.comments[0].replies[0].id, 2);
    assert.equal(payload.data.comments[0].postSource, "knowledge");
}

{
    const created = row({ id: 8, content: "hello", author_id: 7, author_username: "writer" });
    const { env, calls } = environment({ firstRows: [{ id: 9 }, created] });
    const request = new Request("https://lilinzheng.top/api/knowledge/post-comments/knowledge/9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "  hello  " })
    });
    const response = await handleKnowledgeCommentRequest(context(request, env));
    assert.equal(response.status, 201);
    const insert = calls.binds.find((call) => call.sql.includes("INSERT INTO knowledge_comments"));
    assert.deepEqual(insert.values, ["knowledge", "9", 7, null, "hello"]);
    assert.equal((await response.json()).data.comment.id, 8);
}

{
    const { env, calls } = environment({ firstRows: [{ id: 3 }] });
    const request = new Request("https://lilinzheng.top/api/knowledge/post-comments/legacy-blog/3");
    const response = await handleKnowledgeCommentRequest(context(request, env));
    assert.equal(response.status, 200);
    assert.equal(calls.binds[0].sql.includes("FROM articles"), true);
    assert.deepEqual((await response.json()).data.comments, []);
}

{
    const { env } = environment({ firstRows: [{ id: 9 }] });
    const request = new Request("https://lilinzheng.top/api/knowledge/post-comments/knowledge/9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" })
    });
    const response = await handleKnowledgeCommentRequest(context(request, env, {
        getBearerToken: () => ""
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.message, "请先登录");
}

{
    const { env, calls } = environment({ firstRows: [row()] });
    const request = new Request("https://lilinzheng.top/api/knowledge/comments/1", {
        method: "DELETE"
    });
    const response = await handleKnowledgeCommentRequest(context(request, env, {
        getAuthenticatedUser: async () => ({ id: 1, username: "admin", role: "admin" })
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.batches[0].length, 2);
}

{
    const { env } = environment({ firstRows: [{ id: 9 }], allRows: [row()] });
    const request = new Request("https://lilinzheng.top/api/knowledge/post-comments/knowledge/9", {
        headers: { Origin: "https://lilinzheng.top" }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://lilinzheng.top");
}

const migration = fs.readFileSync(
    path.join(rootDir, "migrations/0008_add_knowledge_comments.sql"),
    "utf8"
);
assert.match(migration, /CREATE TABLE IF NOT EXISTS knowledge_comments/);
assert.match(migration, /post_source TEXT NOT NULL/);
assert.match(migration, /FOREIGN KEY \(parent_id\).*ON DELETE CASCADE/);

console.log("knowledge comments API tests passed");

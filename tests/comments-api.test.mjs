import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleCommentRequest, isCommentPath } from "../functions/lib/comments-api.mjs";
import { onRequest } from "../functions/api/[[path]].js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}

function commentRow(overrides = {}) {
    return {
        id: 1,
        article_id: 9,
        parent_id: null,
        content: "root",
        created_at: "2026-09-15T01:00:00Z",
        author_id: 3,
        author_username: "reader",
        author_role: "user",
        ...overrides
    };
}

function createEnvironment(options = {}) {
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
                async all() {
                    return { results: options.allRows || [] };
                },
                async first() {
                    return firstRows.shift() ?? null;
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
        getArticleById: async () => ({ id: 9 }),
        requireAdmin: async () => ({ success: true, user: { id: 1, role: "admin" } }),
        ...overrides
    };
}

assert.equal(isCommentPath("/api/articles/9/comments"), true);
assert.equal(isCommentPath("/api/comments/7"), true);
assert.equal(isCommentPath("/api/articles/9"), false);

{
    const { env } = createEnvironment({
        allRows: [
            commentRow(),
            commentRow({ id: 2, parent_id: 1, content: "reply" })
        ]
    });
    const request = new Request("https://lilinzheng.top/api/articles/9/comments");
    const response = await handleCommentRequest(context(request, env));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.comments.length, 1);
    assert.equal(payload.comments[0].id, 1);
    assert.equal(payload.comments[0].replies[0].id, 2);
    assert.deepEqual(payload.comments[0].author, {
        id: 3,
        username: "reader",
        role: "user"
    });
}

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/articles/9/comments");
    const response = await handleCommentRequest(context(request, env, {
        getArticleById: async () => null
    }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { success: false, message: "文章不存在" });
}

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/articles/9/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" })
    });
    const response = await handleCommentRequest(context(request, env, {
        getBearerToken: () => ""
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, message: "请先登录" });
}

{
    const created = commentRow({ id: 8, content: "hello", author_id: 7, author_username: "writer" });
    const { env, calls } = createEnvironment({ firstRows: [created] });
    const request = new Request("https://lilinzheng.top/api/articles/9/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "  hello  " })
    });
    const response = await handleCommentRequest(context(request, env));
    assert.equal(response.status, 201);
    const insert = calls.binds.find((call) => call.sql.includes("INSERT INTO comments"));
    assert.deepEqual(insert.values, ["9", 7, "hello", null]);
    assert.equal((await response.json()).comment.id, 8);
}

{
    const nestedParent = commentRow({ id: 5, parent_id: 1 });
    const created = commentRow({ id: 8, parent_id: 1, content: "nested reply" });
    const { env, calls } = createEnvironment({ firstRows: [nestedParent, created] });
    const request = new Request("https://lilinzheng.top/api/articles/9/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "nested reply", parent_id: 5 })
    });
    const response = await handleCommentRequest(context(request, env));
    assert.equal(response.status, 201);
    const insert = calls.binds.find((call) => call.sql.includes("INSERT INTO comments"));
    assert.deepEqual(insert.values, ["9", 7, "nested reply", 1]);
}

{
    const { env, calls } = createEnvironment({ firstRows: [commentRow()] });
    const request = new Request("https://lilinzheng.top/api/comments/1", { method: "DELETE" });
    const response = await handleCommentRequest(context(request, env));
    assert.equal(response.status, 200);
    assert.equal(calls.batches.length, 1);
    assert.equal(calls.batches[0].length, 2);
    assert.deepEqual(await response.json(), { success: true, message: "评论删除成功" });
}

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/comments/1");
    const response = await handleCommentRequest(context(request, env));
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { success: false, message: "Method Not Allowed" });
}

{
    const { env } = createEnvironment({
        firstRows: [{ id: 9, title: "Article" }],
        allRows: [commentRow()]
    });
    const request = new Request("https://lilinzheng.top/api/articles/9/comments", {
        headers: { Origin: "https://lilinzheng.top" }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://lilinzheng.top");
    assert.equal((await response.json()).comments[0].id, 1);
}

const routeSource = fs.readFileSync(path.join(rootDir, "functions/api/[[path]].js"), "utf8");
assert.match(routeSource, /from "\.\.\/lib\/comments-api\.mjs"/);
assert.match(routeSource, /else if \(isCommentPath\(url\.pathname\)\)/);
assert.doesNotMatch(routeSource, /async function handleCreateComment/);

console.log("comments API extraction tests passed");

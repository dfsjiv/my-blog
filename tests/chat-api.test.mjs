import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleChatRequest, isChatPath } from "../functions/lib/chat-api.mjs";
import { onRequest } from "../functions/api/[[path]].js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}

function createEnvironment() {
    const calls = { binds: [], roomFetches: [] };
    const rows = [
        { id: 2, content: "later", created_at: "2026-09-15T02:00:00Z", username: "b", role: "user" },
        { id: 1, content: "earlier", created_at: "2026-09-15T01:00:00Z", username: "a", role: "admin" }
    ];
    const inserted = {
        id: 3,
        content: "hello",
        created_at: "2026-09-15T03:00:00Z",
        username: "writer",
        role: "user"
    };

    const DB = {
        prepare(sql) {
            const statement = {
                bind(...values) {
                    calls.binds.push({ sql, values });
                    return statement;
                },
                async all() {
                    return { results: rows };
                },
                async run() {
                    return { meta: { last_row_id: 3 } };
                },
                async first() {
                    return inserted;
                }
            };
            return statement;
        }
    };

    const room = {
        async fetch(url, options) {
            calls.roomFetches.push({ url, options });
            return new Response(null, { status: 204 });
        }
    };

    return {
        env: {
            DB,
            CHAT_ROOM: {
                idFromName(name) {
                    assert.equal(name, "public-lobby");
                    return "room-id";
                },
                get(id) {
                    assert.equal(id, "room-id");
                    return room;
                }
            }
        },
        calls
    };
}

function chatContext(request, env, overrides = {}) {
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

assert.equal(isChatPath("/api/chat/messages"), true);
assert.equal(isChatPath("/api/chat/ws-ticket"), true);
assert.equal(isChatPath("/api/articles"), false);

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/chat/messages");
    const response = await handleChatRequest(chatContext(request, env));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.messages.map((message) => message.id), [1, 2]);
}

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" })
    });
    const response = await handleChatRequest(chatContext(request, env, {
        getBearerToken: () => ""
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, message: "请先登录" });
}

{
    const { env, calls } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "  hello  " })
    });
    const response = await handleChatRequest(chatContext(request, env));
    assert.equal(response.status, 201);
    assert.equal(calls.binds[0].values[0], 7);
    assert.equal(calls.binds[0].values[1], "hello");
    assert.equal(calls.roomFetches[0].url, "https://internal/broadcast");
    const broadcast = JSON.parse(calls.roomFetches[0].options.body);
    assert.equal(broadcast.message.id, 3);
}

{
    const { env, calls } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/chat/ws-ticket", { method: "POST" });
    const response = await handleChatRequest(chatContext(request, env));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(typeof payload.ticket, "string");
    assert.equal(calls.roomFetches[0].url, "https://internal/create-ticket");
    const ticketRequest = JSON.parse(calls.roomFetches[0].options.body);
    assert.deepEqual(ticketRequest.user, {
        id: null,
        username: "游客",
        role: "guest",
        isGuest: true
    });
    assert.equal(ticketRequest.ticket, payload.ticket);
    assert.ok(ticketRequest.expiresAt > Date.now());
}

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/chat/ws-ticket");
    const response = await handleChatRequest(chatContext(request, env));
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { success: false, message: "Method Not Allowed" });
}

{
    const { env } = createEnvironment();
    const request = new Request("https://lilinzheng.top/api/chat/messages", {
        headers: { Origin: "https://lilinzheng.top" }
    });
    const response = await onRequest({ request, env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://lilinzheng.top");
}

const routeSource = fs.readFileSync(path.join(rootDir, "functions/api/[[path]].js"), "utf8");
assert.match(routeSource, /from "\.\.\/lib\/chat-api\.mjs"/);
assert.match(routeSource, /else if \(isChatPath\(url\.pathname\)\)/);
assert.doesNotMatch(routeSource, /async function handleSendChatMessage/);

console.log("chat API extraction tests passed");

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
    handleKnowledgeBackgroundRequest,
    isKnowledgeBackgroundPath
} from "../functions/lib/knowledge-backgrounds.mjs";

const rootDir = path.resolve(import.meta.dirname, "..");

class Statement {
    constructor(database, sql, bindings = []) {
        this.database = database;
        this.sql = sql;
        this.bindings = bindings;
    }
    bind(...bindings) { return new Statement(this.database, this.sql, bindings); }
    first() { return this.database.prepare(this.sql).get(...this.bindings) || null; }
    all() { return { results: this.database.prepare(this.sql).all(...this.bindings) }; }
    run() {
        const result = this.database.prepare(this.sql).run(...this.bindings);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    }
}

class MemoryR2 {
    constructor() { this.objects = new Map(); }
    async put(key, bytes, options) {
        this.objects.set(key, { bytes: new Uint8Array(bytes), options });
    }
    async delete(key) { this.objects.delete(key); }
}

function createEnvironment(withTable = true) {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL);
        INSERT INTO users VALUES (1, 'admin', 'admin'), (2, 'reader', 'user');
    `);
    if (withTable) {
        sqlite.exec(fs.readFileSync(
            path.join(rootDir, "migrations", "0009_add_knowledge_backgrounds.sql"),
            "utf8"
        ));
    }
    return {
        sqlite,
        env: {
            DB: { prepare: (sql) => new Statement(sqlite, sql) },
            KNOWLEDGE_IMAGES: new MemoryR2()
        }
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

async function call(env, pathname, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    const request = new Request(`https://example.test${pathname}`, {
        method: options.method || "GET",
        headers,
        body: options.body
    });
    const response = await handleKnowledgeBackgroundRequest({
        request,
        env,
        url: new URL(request.url),
        jsonResponse
    }, async () => {
        if (options.token === "admin-token") return { user: { id: 1, role: "admin" } };
        return { response: jsonResponse({ success: false, error: { code: "FORBIDDEN" } }, 403) };
    });
    return { response, body: await response.json() };
}

function pngFile() {
    return new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        "night.png",
        { type: "image/png" }
    );
}

test("background route matching and undeployed public fallback are safe", async () => {
    assert.equal(isKnowledgeBackgroundPath("/api/knowledge/backgrounds"), true);
    assert.equal(isKnowledgeBackgroundPath("/api/knowledge/admin/backgrounds/12"), true);
    assert.equal(isKnowledgeBackgroundPath("/api/knowledge/posts"), false);
    const { sqlite, env } = createEnvironment(false);
    const result = await call(env, "/api/knowledge/backgrounds");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.data.items, []);
    sqlite.close();
});

test("only admins can upload and manage the custom background queue", async () => {
    const { sqlite, env } = createEnvironment();
    const forbidden = await call(env, "/api/knowledge/admin/backgrounds", {
        token: "user-token"
    });
    assert.equal(forbidden.response.status, 403);

    const formData = new FormData();
    formData.set("file", pngFile());
    formData.set("title", "Night sky");
    formData.set("focalPosition", "right");
    const uploaded = await call(env, "/api/knowledge/admin/backgrounds", {
        method: "POST",
        token: "admin-token",
        body: formData
    });
    assert.equal(uploaded.response.status, 201);
    assert.equal(uploaded.body.data.background.title, "Night sky");
    assert.equal(uploaded.body.data.background.focalPosition, "right");
    assert.match(uploaded.body.data.background.url, /\/api\/knowledge\/images\/knowledge\/backgrounds\//);
    assert.equal(env.KNOWLEDGE_IMAGES.objects.size, 1);
    const id = uploaded.body.data.background.id;

    const publicList = await call(env, "/api/knowledge/backgrounds");
    assert.equal(publicList.body.data.items.length, 1);
    assert.equal(Object.hasOwn(publicList.body.data.items[0], "uploadedBy"), false);

    const updated = await call(env, `/api/knowledge/admin/backgrounds/${id}`, {
        method: "PATCH",
        token: "admin-token",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: false, focalPosition: "left", sortOrder: 3 })
    });
    assert.equal(updated.body.data.background.isEnabled, false);
    assert.equal(updated.body.data.background.focalPosition, "left");
    assert.equal((await call(env, "/api/knowledge/backgrounds")).body.data.items.length, 0);

    const removed = await call(env, `/api/knowledge/admin/backgrounds/${id}`, {
        method: "DELETE",
        token: "admin-token"
    });
    assert.equal(removed.response.status, 200);
    assert.equal(env.KNOWLEDGE_IMAGES.objects.size, 0);
    sqlite.close();
});

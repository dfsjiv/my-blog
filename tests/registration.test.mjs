import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { handleRegistrationRequest } from "../functions/lib/registration.mjs";

const rootDir = path.resolve(import.meta.dirname, "..");

class D1Statement {
    constructor(database, sql, bindings = []) {
        this.database = database;
        this.sql = sql;
        this.bindings = bindings;
    }
    bind(...bindings) { return new D1Statement(this.database, this.sql, bindings); }
    first() { return this.database.prepare(this.sql).get(...this.bindings) || null; }
    run() {
        const result = this.database.prepare(this.sql).run(...this.bindings);
        return {
            success: true,
            meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
        };
    }
}

function createEnvironment() {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            role TEXT NOT NULL
        );
        CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        INSERT INTO users (username, password_hash, password_salt, role)
        VALUES ('admin', 'hash', 'salt', 'admin');
    `);
    sqlite.exec(fs.readFileSync(path.join(rootDir, "migrations", "0006_add_invitation_codes.sql"), "utf8"));
    sqlite.exec(fs.readFileSync(path.join(rootDir, "migrations", "0007_add_registration_rate_limits.sql"), "utf8"));
    return {
        sqlite,
        env: { DB: { prepare: (sql) => new D1Statement(sqlite, sql) } }
    };
}

async function addInvitation(sqlite, code) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    sqlite.prepare(`
        INSERT INTO knowledge_invitation_codes
            (code_hash, code_preview, expires_at, created_by)
        VALUES (?, ?, ?, 1)
    `).run(hash, "In****23", new Date(Date.now() + 86400000).toISOString());
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

async function callRegistration(env, pathname, body, ip = "203.0.113.10") {
    const request = new Request(`https://example.test${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
        body: JSON.stringify(body)
    });
    const response = await handleRegistrationRequest({
        request,
        env,
        url: new URL(request.url),
        jsonResponse
    });
    return { response, data: await response.json() };
}

test("registration verifies and consumes a one-time invitation", async () => {
    const { sqlite, env } = createEnvironment();
    await addInvitation(sqlite, "Invite123");

    const verification = await callRegistration(env, "/api/register/invitation", {
        invitationCode: "Invite123"
    });
    assert.equal(verification.response.status, 200);
    assert.equal(verification.data.valid, true);

    const registration = await callRegistration(env, "/api/register", {
        invitationCode: "Invite123",
        username: "new_user",
        password: "strong-password"
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.data.user.role, "user");
    assert.ok(registration.data.sessionToken);
    assert.equal(sqlite.prepare("SELECT role FROM users WHERE username = ?").get("new_user").role, "user");
    assert.ok(sqlite.prepare("SELECT used_at FROM knowledge_invitation_codes").get().used_at);
    assert.notEqual(sqlite.prepare("SELECT token_hash FROM sessions").get().token_hash, registration.data.sessionToken);

    const reused = await callRegistration(env, "/api/register", {
        invitationCode: "Invite123",
        username: "another_user",
        password: "strong-password"
    });
    assert.equal(reused.response.status, 400);
});

test("registration rejects duplicate usernames case-insensitively", async () => {
    const { sqlite, env } = createEnvironment();
    await addInvitation(sqlite, "Second123");
    sqlite.prepare(`
        INSERT INTO users (username, password_hash, password_salt, role)
        VALUES ('Reader', 'hash', 'salt', 'user')
    `).run();
    const result = await callRegistration(env, "/api/register", {
        invitationCode: "Second123",
        username: "reader",
        password: "strong-password"
    });
    assert.equal(result.response.status, 409);
    assert.equal(result.data.message, "该用户名已存在");
});

test("invitation verification locks for two hours after exceeding the limit", async () => {
    const { env } = createEnvironment();
    let result;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        result = await callRegistration(env, "/api/register/invitation", {
            invitationCode: "WrongCode"
        });
    }
    assert.equal(result.response.status, 429);
    assert.ok(result.data.retryAfter > 7000);
});

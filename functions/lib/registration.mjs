import {
    consumeInvitationCode,
    isInvitationCodeAvailable
} from "./knowledge-invitations.mjs";

const REGISTER_PATH = "/api/register";
const VERIFY_INVITATION_PATH = "/api/register/invitation";
const PBKDF2_ITERATIONS = 100000;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[A-Za-z0-9_\u3400-\u9fff]{2,32}$/;

export function isRegistrationPath(pathname) {
    return pathname === REGISTER_PATH || pathname === VERIFY_INVITATION_PATH;
}

export async function handleRegistrationRequest({ request, env, url, jsonResponse }) {
    if (request.method !== "POST") {
        return jsonResponse({ success: false, message: "Method Not Allowed" }, 405);
    }

    const clientKey = await getClientKey(request);
    const cooldown = await getCooldown(clientKey, env);
    if (cooldown > 0) return cooldownResponse(cooldown, jsonResponse);

    if (url.pathname === VERIFY_INVITATION_PATH) {
        return verifyInvitation(request, env, clientKey, jsonResponse);
    }
    return registerAccount(request, env, clientKey, jsonResponse);
}

async function verifyInvitation(request, env, clientKey, jsonResponse) {
    const body = await readJson(request);
    const invitationCode = normalizeString(body?.invitationCode);
    const cooldown = await recordAttempt(clientKey, env);
    if (cooldown > 0) return cooldownResponse(cooldown, jsonResponse);
    if (!invitationCode) {
        return jsonResponse({ success: false, message: "邀请码不能为空" }, 400);
    }
    if (!await isInvitationCodeAvailable(invitationCode, env)) {
        return jsonResponse({ success: false, message: "邀请码无效或已失效" }, 400);
    }
    return jsonResponse({ success: true, valid: true });
}

async function registerAccount(request, env, clientKey, jsonResponse) {
    const body = await readJson(request);
    if (!body) return jsonResponse({ success: false, message: "请求数据格式错误" }, 400);

    const invitationCode = normalizeString(body.invitationCode);
    const username = normalizeString(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    if (!invitationCode) {
        return failureWithAttempt("请先输入并验证邀请码", env, clientKey, jsonResponse);
    }
    if (!await isInvitationCodeAvailable(invitationCode, env)) {
        return failureWithAttempt("邀请码无效或已失效", env, clientKey, jsonResponse);
    }
    if (!USERNAME_PATTERN.test(username)) {
        return jsonResponse({
            success: false,
            message: "用户名需为 2 至 32 位中文、字母、数字或下划线"
        }, 400);
    }
    if (password.length < 8 || password.length > 128) {
        return jsonResponse({ success: false, message: "密码长度需为 8 至 128 位" }, 400);
    }

    const existing = await env.DB.prepare(`
        SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1
    `).bind(username).first();
    if (existing) {
        return jsonResponse({ success: false, message: "该用户名已存在" }, 409);
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await derivePasswordHash(password, salt);
    let userId = null;
    try {
        const result = await env.DB.prepare(`
            INSERT INTO users (username, password_hash, password_salt, role)
            VALUES (?, ?, ?, 'user')
        `).bind(username, bytesToHex(passwordHash), bytesToHex(salt)).run();
        userId = Number(result.meta.last_row_id);
    } catch (error) {
        if (/unique|constraint/i.test(String(error?.message || error))) {
            return jsonResponse({ success: false, message: "该用户名已存在" }, 409);
        }
        throw error;
    }

    const consumed = await consumeInvitationCode(invitationCode, userId, env);
    if (!consumed) {
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
        return failureWithAttempt("邀请码已被使用或已经失效", env, clientKey, jsonResponse);
    }

    await clearAttempts(clientKey, env);
    const session = await createSession(userId, env);
    return jsonResponse({
        success: true,
        user: { id: userId, username, role: "user" },
        sessionToken: session.token,
        expiresAt: session.expiresAt
    }, 201);
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

async function failureWithAttempt(message, env, clientKey, jsonResponse) {
    const cooldown = await recordAttempt(clientKey, env);
    if (cooldown > 0) return cooldownResponse(cooldown, jsonResponse);
    return jsonResponse({ success: false, message }, 400);
}

async function getCooldown(clientKey, env) {
    const row = await env.DB.prepare(`
        SELECT locked_until FROM registration_rate_limits WHERE client_key = ?
    `).bind(clientKey).first();
    const lockedUntil = Number(row?.locked_until || 0);
    return lockedUntil > Date.now() ? lockedUntil - Date.now() : 0;
}

async function recordAttempt(clientKey, env) {
    const now = Date.now();
    const row = await env.DB.prepare(`
        SELECT window_started_at, attempt_count, locked_until
        FROM registration_rate_limits WHERE client_key = ?
    `).bind(clientKey).first();

    if (Number(row?.locked_until || 0) > now) return Number(row.locked_until) - now;
    const inWindow = row && now - Number(row.window_started_at) < ATTEMPT_WINDOW_MS;
    const count = inWindow ? Number(row.attempt_count) + 1 : 1;
    const windowStartedAt = inWindow ? Number(row.window_started_at) : now;
    const lockedUntil = count > ATTEMPT_LIMIT ? now + COOLDOWN_MS : null;

    await env.DB.prepare(`
        INSERT INTO registration_rate_limits (
            client_key, window_started_at, attempt_count, locked_until, updated_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(client_key) DO UPDATE SET
            window_started_at = excluded.window_started_at,
            attempt_count = excluded.attempt_count,
            locked_until = excluded.locked_until,
            updated_at = CURRENT_TIMESTAMP
    `).bind(clientKey, windowStartedAt, count, lockedUntil).run();
    return lockedUntil ? lockedUntil - now : 0;
}

async function clearAttempts(clientKey, env) {
    await env.DB.prepare("DELETE FROM registration_rate_limits WHERE client_key = ?")
        .bind(clientKey).run();
}

function cooldownResponse(remainingMs, jsonResponse) {
    const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
    return jsonResponse({
        success: false,
        message: "尝试次数过多，注册已暂停 2 小时",
        retryAfter
    }, 429);
}

async function getClientKey(request) {
    const source = request.headers.get("CF-Connecting-IP")
        || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
        || "unknown";
    return sha256Hex(source);
}

async function derivePasswordHash(password, salt) {
    const material = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const buffer = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: PBKDF2_ITERATIONS
    }, material, 256);
    return new Uint8Array(buffer);
}

async function createSession(userId, env) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .bind(new Date().toISOString()).run();
    await env.DB.prepare(`
        INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)
    `).bind(userId, await sha256Hex(token), expiresAt).run();
    return { token, expiresAt };
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

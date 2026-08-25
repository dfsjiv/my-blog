const INVITATION_PATH = "/api/knowledge/admin/invitations";
const CODE_PATTERN = /^[A-Za-z0-9]{1,64}$/;

export function isKnowledgeInvitationPath(pathname) {
    return pathname === INVITATION_PATH
        || /^\/api\/knowledge\/admin\/invitations\/\d+$/.test(pathname);
}

export async function handleKnowledgeInvitationRequest(context, requireAuthor) {
    const { request, env, url, jsonResponse } = context;
    const auth = await requireAuthor(context);
    if (auth.response) return auth.response;

    if (url.pathname === INVITATION_PATH) {
        if (request.method === "GET") return listInvitations(env, jsonResponse);
        if (request.method === "POST") {
            return createInvitation(request, env, auth.user, jsonResponse);
        }
        return methodNotAllowed(jsonResponse);
    }

    const itemMatch = url.pathname.match(/^\/api\/knowledge\/admin\/invitations\/(\d+)$/);
    if (itemMatch && request.method === "DELETE") {
        return revokeInvitation(Number(itemMatch[1]), env, jsonResponse);
    }
    return methodNotAllowed(jsonResponse);
}

async function listInvitations(env, jsonResponse) {
    const result = await env.DB.prepare(`
        SELECT id, code_preview, expires_at, created_at, used_at, used_by, revoked_at
        FROM knowledge_invitation_codes
        ORDER BY id DESC
        LIMIT 100
    `).all();
    return jsonResponse({
        success: true,
        data: { items: (result.results || []).map(adaptInvitation) }
    });
}

async function createInvitation(request, env, user, jsonResponse) {
    let body;
    try {
        body = await request.json();
    } catch {
        return validationError(jsonResponse, "请求数据无效");
    }

    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt.trim() : "";
    const expiry = Date.parse(expiresAt);
    if (!CODE_PATTERN.test(code)) {
        return validationError(jsonResponse, "邀请码只能包含 1 至 64 位英文字母和数字");
    }
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
        return validationError(jsonResponse, "有效时间必须晚于当前时间");
    }

    const codeHash = await hashInvitationCode(code);
    const existing = await env.DB.prepare(
        "SELECT id FROM knowledge_invitation_codes WHERE code_hash = ?"
    ).bind(codeHash).first();
    if (existing) {
        return jsonResponse({
            success: false,
            error: { code: "CONFLICT", message: "该邀请码已经存在，请更换一个邀请码" }
        }, 409);
    }

    const result = await env.DB.prepare(`
        INSERT INTO knowledge_invitation_codes (
            code_hash, code_preview, expires_at, created_by, created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
        codeHash,
        maskCode(code),
        new Date(expiry).toISOString(),
        Number(user.id)
    ).run();
    const invitation = await getInvitation(Number(result.meta.last_row_id), env);
    return jsonResponse({
        success: true,
        data: { invitation: { ...invitation, code } }
    }, 201);
}

async function revokeInvitation(id, env, jsonResponse) {
    const result = await env.DB.prepare(`
        UPDATE knowledge_invitation_codes
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
    `).bind(id).run();
    if (!Number(result.meta.changes)) {
        return jsonResponse({
            success: false,
            error: { code: "NOT_FOUND", message: "邀请码不存在或已经失效" }
        }, 404);
    }
    return jsonResponse({ success: true, data: { invitation: await getInvitation(id, env) } });
}

// Registration can call this inside its account-creation flow. The conditional
// update makes concurrent attempts consume the code at most once.
export async function consumeInvitationCode(code, userId, env) {
    if (typeof code !== "string" || !CODE_PATTERN.test(code.trim())) return false;
    const codeHash = await hashInvitationCode(code.trim());
    const result = await env.DB.prepare(`
        UPDATE knowledge_invitation_codes
        SET used_at = CURRENT_TIMESTAMP, used_by = ?
        WHERE code_hash = ?
          AND used_at IS NULL
          AND revoked_at IS NULL
          AND datetime(expires_at) > CURRENT_TIMESTAMP
    `).bind(Number(userId), codeHash).run();
    return Number(result.meta.changes) === 1;
}

async function getInvitation(id, env) {
    const row = await env.DB.prepare(`
        SELECT id, code_preview, expires_at, created_at, used_at, used_by, revoked_at
        FROM knowledge_invitation_codes WHERE id = ?
    `).bind(id).first();
    return row ? adaptInvitation(row) : null;
}

function adaptInvitation(row) {
    const now = Date.now();
    let status = "active";
    if (row.used_at) status = "used";
    else if (row.revoked_at) status = "revoked";
    else if (Date.parse(row.expires_at) <= now) status = "expired";
    return {
        id: Number(row.id),
        codePreview: row.code_preview,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        usedAt: row.used_at || null,
        usedBy: row.used_by ? Number(row.used_by) : null,
        revokedAt: row.revoked_at || null,
        status
    };
}

async function hashInvitationCode(code) {
    const bytes = new TextEncoder().encode(code);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function maskCode(code) {
    if (code.length <= 4) return "*".repeat(code.length);
    return `${code.slice(0, 2)}${"*".repeat(Math.min(8, code.length - 4))}${code.slice(-2)}`;
}

function validationError(jsonResponse, message) {
    return jsonResponse({
        success: false,
        error: { code: "VALIDATION_ERROR", message }
    }, 400);
}

function methodNotAllowed(jsonResponse) {
    return jsonResponse({
        success: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "请求方法不受支持" }
    }, 405);
}

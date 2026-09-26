const PUBLIC_PATH = "/api/knowledge/backgrounds";
const ADMIN_PATH = "/api/knowledge/admin/backgrounds";
const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;
const MAX_ENABLED_BACKGROUNDS = 12;
const FOCAL_POSITIONS = new Set(["left", "center", "right"]);

export function isKnowledgeBackgroundPath(pathname) {
    return pathname === PUBLIC_PATH
        || pathname === ADMIN_PATH
        || /^\/api\/knowledge\/admin\/backgrounds\/\d+$/.test(pathname);
}

export async function handleKnowledgeBackgroundRequest(context, requireAdmin) {
    const { request, env, url, jsonResponse } = context;

    if (url.pathname === PUBLIC_PATH) {
        if (request.method !== "GET") return methodNotAllowed(jsonResponse);
        if (!await backgroundsTableExists(env)) {
            return jsonResponse({ success: true, data: { items: [] } });
        }
        return listBackgrounds(env, url.origin, jsonResponse, true);
    }

    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (!await backgroundsTableExists(env)) {
        return failure(jsonResponse, 503, "DATABASE_UNAVAILABLE", "背景管理数据表尚未部署");
    }

    if (url.pathname === ADMIN_PATH) {
        if (request.method === "GET") {
            return listBackgrounds(env, url.origin, jsonResponse, false);
        }
        if (request.method === "POST") {
            return createBackground(context, auth.user);
        }
        return methodNotAllowed(jsonResponse);
    }

    const match = url.pathname.match(/^\/api\/knowledge\/admin\/backgrounds\/(\d+)$/);
    if (!match) return failure(jsonResponse, 404, "NOT_FOUND", "背景不存在");
    const id = Number(match[1]);
    if (request.method === "PATCH") return updateBackground(context, id);
    if (request.method === "DELETE") return deleteBackground(context, id);
    return methodNotAllowed(jsonResponse);
}

async function listBackgrounds(env, origin, jsonResponse, publicOnly) {
    const where = publicOnly ? "WHERE is_enabled = 1" : "";
    const result = await env.DB.prepare(`
        SELECT id, object_key, title, focal_position, sort_order,
               is_enabled, uploaded_by, created_at, updated_at
        FROM knowledge_backgrounds
        ${where}
        ORDER BY sort_order ASC, id ASC
    `).all();
    return jsonResponse({
        success: true,
        data: {
            items: (result.results || []).map((row) => adaptBackground(row, origin, !publicOnly))
        }
    });
}

async function createBackground(context, user) {
    const { request, env, url, jsonResponse } = context;
    if (!env.KNOWLEDGE_IMAGES) {
        return failure(jsonResponse, 503, "STORAGE_UNAVAILABLE", "图片存储服务尚未配置");
    }

    let formData;
    try {
        formData = await request.formData();
    } catch {
        return failure(jsonResponse, 400, "INVALID_BACKGROUND", "请选择有效的背景图片");
    }
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
        return failure(jsonResponse, 400, "INVALID_BACKGROUND", "请选择要上传的背景图片");
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_BACKGROUND_BYTES) {
        return failure(jsonResponse, 400, "INVALID_BACKGROUND", "背景图片必须在 8 MB 以内");
    }

    const enabledCount = await countEnabled(env);
    if (enabledCount >= MAX_ENABLED_BACKGROUNDS) {
        return failure(
            jsonResponse,
            400,
            "BACKGROUND_LIMIT",
            `最多同时启用 ${MAX_ENABLED_BACKGROUNDS} 张自定义背景`
        );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageType = detectImageType(bytes);
    if (!imageType) {
        return failure(jsonResponse, 400, "INVALID_BACKGROUND", "仅支持 JPEG、PNG 或 WebP 图片");
    }
    const title = cleanTitle(formData.get("title"), file.name);
    const focalPosition = cleanFocalPosition(formData.get("focalPosition"));
    const now = new Date();
    const key = [
        "knowledge",
        "backgrounds",
        String(now.getUTCFullYear()),
        String(now.getUTCMonth() + 1).padStart(2, "0"),
        `${crypto.randomUUID()}.${imageType.extension}`
    ].join("/");

    await env.KNOWLEDGE_IMAGES.put(key, bytes, {
        httpMetadata: { contentType: imageType.mimeType },
        customMetadata: {
            uploadedBy: String(user.id),
            originalName: safeMetadataValue(file.name)
        }
    });

    try {
        const maximum = await env.DB.prepare(
            "SELECT COALESCE(MAX(sort_order), -1) AS maximum FROM knowledge_backgrounds"
        ).first();
        const result = await env.DB.prepare(`
            INSERT INTO knowledge_backgrounds (
                object_key, title, focal_position, sort_order,
                is_enabled, uploaded_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(
            key,
            title,
            focalPosition,
            Number(maximum?.maximum ?? -1) + 1,
            Number(user.id)
        ).run();
        const created = await getBackground(env, Number(result.meta.last_row_id));
        return jsonResponse({
            success: true,
            data: { background: adaptBackground(created, url.origin) }
        }, 201);
    } catch (error) {
        if (typeof env.KNOWLEDGE_IMAGES.delete === "function") {
            await env.KNOWLEDGE_IMAGES.delete(key).catch(() => {});
        }
        throw error;
    }
}

async function updateBackground(context, id) {
    const { request, env, url, jsonResponse } = context;
    const existing = await getBackground(env, id);
    if (!existing) return failure(jsonResponse, 404, "NOT_FOUND", "背景不存在");

    let body;
    try {
        body = await request.json();
    } catch {
        return failure(jsonResponse, 400, "VALIDATION_ERROR", "请求数据无效");
    }
    const title = Object.prototype.hasOwnProperty.call(body, "title")
        ? cleanTitle(body.title, existing.title)
        : existing.title;
    const focalPosition = Object.prototype.hasOwnProperty.call(body, "focalPosition")
        ? cleanFocalPosition(body.focalPosition)
        : existing.focal_position;
    const sortOrder = Object.prototype.hasOwnProperty.call(body, "sortOrder")
        ? Number(body.sortOrder)
        : Number(existing.sort_order);
    const isEnabled = Object.prototype.hasOwnProperty.call(body, "isEnabled")
        ? Boolean(body.isEnabled)
        : Boolean(existing.is_enabled);

    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
        return failure(jsonResponse, 400, "VALIDATION_ERROR", "背景顺序无效");
    }
    if (isEnabled && !existing.is_enabled && await countEnabled(env) >= MAX_ENABLED_BACKGROUNDS) {
        return failure(
            jsonResponse,
            400,
            "BACKGROUND_LIMIT",
            `最多同时启用 ${MAX_ENABLED_BACKGROUNDS} 张自定义背景`
        );
    }

    await env.DB.prepare(`
        UPDATE knowledge_backgrounds
        SET title = ?, focal_position = ?, sort_order = ?, is_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).bind(title, focalPosition, sortOrder, isEnabled ? 1 : 0, id).run();
    return jsonResponse({
        success: true,
        data: { background: adaptBackground(await getBackground(env, id), url.origin) }
    });
}

async function deleteBackground(context, id) {
    const { env, jsonResponse } = context;
    const existing = await getBackground(env, id);
    if (!existing) return failure(jsonResponse, 404, "NOT_FOUND", "背景不存在");
    await env.DB.prepare("DELETE FROM knowledge_backgrounds WHERE id = ?").bind(id).run();
    if (env.KNOWLEDGE_IMAGES && typeof env.KNOWLEDGE_IMAGES.delete === "function") {
        try {
            await env.KNOWLEDGE_IMAGES.delete(existing.object_key);
        } catch (error) {
            console.error("Background object cleanup failed:", error?.message || error);
        }
    }
    return jsonResponse({ success: true, data: { deleted: true } });
}

async function getBackground(env, id) {
    return env.DB.prepare(`
        SELECT id, object_key, title, focal_position, sort_order,
               is_enabled, uploaded_by, created_at, updated_at
        FROM knowledge_backgrounds WHERE id = ? LIMIT 1
    `).bind(id).first();
}

async function countEnabled(env) {
    const row = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM knowledge_backgrounds WHERE is_enabled = 1"
    ).first();
    return Number(row?.count) || 0;
}

async function backgroundsTableExists(env) {
    const row = await env.DB.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'knowledge_backgrounds'
        LIMIT 1
    `).first();
    return Boolean(row);
}

function adaptBackground(row, origin, includePrivate = true) {
    const background = {
        id: Number(row.id),
        title: row.title || "",
        url: `${origin}/api/knowledge/images/${encodeKey(row.object_key)}`,
        focalPosition: FOCAL_POSITIONS.has(row.focal_position) ? row.focal_position : "center",
        sortOrder: Number(row.sort_order) || 0,
        isEnabled: Boolean(row.is_enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
    if (includePrivate) background.uploadedBy = Number(row.uploaded_by);
    return background;
}

function cleanTitle(value, fallback) {
    const title = typeof value === "string" ? value.trim() : "";
    return (title || String(fallback || "自定义背景")).slice(0, 80);
}

function cleanFocalPosition(value) {
    return FOCAL_POSITIONS.has(value) ? value : "center";
}

function detectImageType(bytes) {
    if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
    if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { mimeType: "image/png", extension: "png" };
    }
    if (
        matches(bytes, 0, [0x52, 0x49, 0x46, 0x46])
        && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    ) return { mimeType: "image/webp", extension: "webp" };
    return null;
}

function matches(bytes, offset, signature) {
    return signature.every((value, index) => bytes[offset + index] === value);
}

function encodeKey(key) {
    return String(key).split("/").map(encodeURIComponent).join("/");
}

function safeMetadataValue(value) {
    return String(value || "background").replace(/[^\x20-\x7e]/g, "_").slice(0, 200);
}

function failure(jsonResponse, status, code, message) {
    return jsonResponse({ success: false, error: { code, message } }, status);
}

function methodNotAllowed(jsonResponse) {
    return failure(jsonResponse, 405, "METHOD_NOT_ALLOWED", "请求方法不受支持");
}

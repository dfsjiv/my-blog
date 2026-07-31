const FAVORITE_KINDS = new Set(["anime", "game"]);
const FAVORITE_STATUSES = new Set(["draft", "published"]);
const MAX_LINKS = 12;

export function isKnowledgeFavoritePath(pathname) {
    return pathname === "/api/knowledge/favorites"
        || pathname === "/api/knowledge/admin/favorites"
        || /^\/api\/knowledge\/admin\/favorites\/\d+$/.test(pathname);
}

export async function handleKnowledgeFavoriteRequest(context, requireAuthor) {
    const { request, env, url, jsonResponse } = context;
    const itemMatch = url.pathname.match(/^\/api\/knowledge\/admin\/favorites\/(\d+)$/);

    if (url.pathname === "/api/knowledge/favorites" && request.method === "GET") {
        return listFavorites(request, env, jsonResponse, false);
    }

    if (url.pathname === "/api/knowledge/admin/favorites") {
        const auth = await requireAuthor(context);
        if (auth.response) return auth.response;
        if (request.method === "GET") return listFavorites(request, env, jsonResponse, true);
        if (request.method === "POST") return createFavorite(request, env, jsonResponse);
        return methodNotAllowed(jsonResponse);
    }

    if (itemMatch) {
        const auth = await requireAuthor(context);
        if (auth.response) return auth.response;
        const id = Number(itemMatch[1]);
        if (request.method === "PATCH") return updateFavorite(request, id, env, jsonResponse);
        if (request.method === "DELETE") return deleteFavorite(id, env, jsonResponse);
        return methodNotAllowed(jsonResponse);
    }

    return methodNotAllowed(jsonResponse);
}

async function listFavorites(request, env, jsonResponse, includeDrafts) {
    const kind = new URL(request.url).searchParams.get("kind") || "";
    if (kind && !FAVORITE_KINDS.has(kind)) {
        return validationError(jsonResponse, { kind: "kind must be anime or game" });
    }
    const where = [];
    const bindings = [];
    if (kind) {
        where.push("kind = ?");
        bindings.push(kind);
    }
    if (!includeDrafts) where.push("status = 'published'");
    const result = await env.DB.prepare(`
        SELECT id, kind, title, cover_url, description, links_json,
               sort_order, status, created_at, updated_at
        FROM knowledge_favorites
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY sort_order ASC, id DESC
    `).bind(...bindings).all();
    return jsonResponse({
        success: true,
        data: { items: (result.results || []).map(adaptFavorite) }
    });
}

async function createFavorite(request, env, jsonResponse) {
    const parsed = await readFavoriteInput(request, jsonResponse);
    if (parsed.response) return parsed.response;
    const input = parsed.input;
    const result = await env.DB.prepare(`
        INSERT INTO knowledge_favorites (
            kind, title, cover_url, description, links_json,
            sort_order, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
        input.kind,
        input.title,
        input.coverUrl,
        input.description,
        JSON.stringify(input.links),
        input.sortOrder,
        input.status
    ).run();
    const item = await getFavorite(Number(result.meta.last_row_id), env);
    return jsonResponse({ success: true, data: { item } }, 201);
}

async function updateFavorite(request, id, env, jsonResponse) {
    const existing = await getFavorite(id, env);
    if (!existing) return notFound(jsonResponse);
    const parsed = await readFavoriteInput(request, jsonResponse);
    if (parsed.response) return parsed.response;
    const input = parsed.input;
    await env.DB.prepare(`
        UPDATE knowledge_favorites
        SET kind = ?, title = ?, cover_url = ?, description = ?,
            links_json = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).bind(
        input.kind,
        input.title,
        input.coverUrl,
        input.description,
        JSON.stringify(input.links),
        input.sortOrder,
        input.status,
        id
    ).run();
    return jsonResponse({ success: true, data: { item: await getFavorite(id, env) } });
}

async function deleteFavorite(id, env, jsonResponse) {
    const result = await env.DB.prepare(
        "DELETE FROM knowledge_favorites WHERE id = ?"
    ).bind(id).run();
    if (!Number(result.meta.changes)) return notFound(jsonResponse);
    return jsonResponse({ success: true, data: { id } });
}

async function getFavorite(id, env) {
    const row = await env.DB.prepare(`
        SELECT id, kind, title, cover_url, description, links_json,
               sort_order, status, created_at, updated_at
        FROM knowledge_favorites WHERE id = ?
    `).bind(id).first();
    return row ? adaptFavorite(row) : null;
}

async function readFavoriteInput(request, jsonResponse) {
    let body;
    try {
        body = await request.json();
    } catch {
        return { response: validationError(jsonResponse, { request: "Invalid JSON body" }) };
    }
    const fields = {};
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "published";
    const coverUrl = validateUrl(body.coverUrl, true, fields, "coverUrl");
    const sortOrder = Number(body.sortOrder || 0);
    const links = validateLinks(body.links, fields);

    if (!FAVORITE_KINDS.has(kind)) fields.kind = "kind must be anime or game";
    if (!title) fields.title = "Title is required";
    else if (title.length > 120) fields.title = "Title is too long";
    if (description.length > 1000) fields.description = "Description is too long";
    if (!FAVORITE_STATUSES.has(status)) fields.status = "Invalid status";
    if (!Number.isSafeInteger(sortOrder) || sortOrder < -100000 || sortOrder > 100000) {
        fields.sortOrder = "Invalid sort order";
    }
    if (Object.keys(fields).length) {
        return { response: validationError(jsonResponse, fields) };
    }
    return { input: { kind, title, description, status, coverUrl, sortOrder, links } };
}

function validateLinks(value, fields) {
    if (!Array.isArray(value)) {
        fields.links = "Links must be an array";
        return [];
    }
    if (value.length > MAX_LINKS) fields.links = `No more than ${MAX_LINKS} links`;
    return value.slice(0, MAX_LINKS).map((entry, index) => {
        const platform = typeof entry?.platform === "string" ? entry.platform.trim() : "";
        const label = typeof entry?.label === "string" ? entry.label.trim() : "";
        const url = validateUrl(entry?.url, false, fields, `links.${index}.url`);
        if (!platform || platform.length > 40) fields[`links.${index}.platform`] = "Invalid platform";
        if (!label || label.length > 60) fields[`links.${index}.label`] = "Invalid label";
        return { platform, label, url };
    });
}

function validateUrl(value, allowRelative, fields, key) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.length > 2048) {
        fields[key] = "Invalid URL";
        return null;
    }
    const trimmed = value.trim();
    if (allowRelative && /^\/(?!\/)[^\s]*$/.test(trimmed)) return trimmed;
    try {
        const parsed = new URL(trimmed);
        if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
        return trimmed;
    } catch {
        fields[key] = "Only valid HTTP or HTTPS URLs are allowed";
        return null;
    }
}

function adaptFavorite(row) {
    let links = [];
    try {
        const parsed = JSON.parse(row.links_json || "[]");
        if (Array.isArray(parsed)) links = parsed;
    } catch {
        links = [];
    }
    return {
        id: Number(row.id),
        kind: row.kind,
        title: row.title,
        coverUrl: row.cover_url || null,
        description: row.description || "",
        links: links.map((link) => ({
            platform: String(link?.platform || ""),
            label: String(link?.label || ""),
            url: String(link?.url || "")
        })).filter((link) => link.platform && link.label && link.url),
        sortOrder: Number(row.sort_order) || 0,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function validationError(jsonResponse, fields) {
    return jsonResponse({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid favorite data", fields }
    }, 400);
}

function methodNotAllowed(jsonResponse) {
    return jsonResponse({
        success: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }
    }, 405);
}

function notFound(jsonResponse) {
    return jsonResponse({
        success: false,
        error: { code: "NOT_FOUND", message: "Favorite item not found" }
    }, 404);
}

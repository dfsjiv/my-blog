const CONTENT_TYPES = new Set(["article", "solution", "note", "project", "essay"]);
const POST_STATUSES = new Set(["draft", "published", "archived", "deleted"]);
const MAX_PAGE_SIZE = 50;
const MAX_TAGS = 15;
const MAX_TAG_LENGTH = 40;
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_CONTENT_LENGTH + 64 * 1024;

const SORT_ORDERS = {
    latest: "p.is_pinned DESC, p.published_at DESC, p.id DESC",
    updated: "p.is_pinned DESC, p.updated_at DESC, p.id DESC",
    oldest: "p.published_at ASC, p.id ASC"
};

const ADMIN_SORT_ORDERS = {
    latest: "p.updated_at DESC, p.id DESC",
    updated: "p.updated_at DESC, p.id DESC",
    oldest: "p.created_at ASC, p.id ASC"
};

export async function handleKnowledgeRequest(context) {
    const { request, env, url, jsonResponse } = context;

    try {
        const publicPostMatch = matchPath(url.pathname, /^\/api\/knowledge\/posts\/([^/]+)$/);
        const adminPostMatch = matchPath(url.pathname, /^\/api\/knowledge\/admin\/posts\/(\d+)$/);
        const adminActionMatch = matchPath(
            url.pathname,
            /^\/api\/knowledge\/admin\/posts\/(\d+)\/(publish|unpublish|archive|restore)$/
        );

        if (url.pathname === "/api/knowledge/posts" && request.method === "GET") {
            return await getPublicPosts(request, env, jsonResponse);
        }
        if (publicPostMatch && request.method === "GET") {
            return await getPublicPost(publicPostMatch[1], env, jsonResponse);
        }
        if (url.pathname === "/api/knowledge/facets" && request.method === "GET") {
            return await getPublicFacets(env, jsonResponse);
        }

        if (url.pathname === "/api/knowledge/admin/posts" && request.method === "GET") {
            const auth = await requireAuthor(context);
            if (auth.response) return auth.response;
            return await getAdminPosts(request, env, jsonResponse);
        }
        if (url.pathname === "/api/knowledge/admin/posts" && request.method === "POST") {
            const auth = await requireAuthor(context);
            if (auth.response) return auth.response;
            return await createPost(request, env, auth.user, jsonResponse);
        }
        if (adminPostMatch && request.method === "GET") {
            const auth = await requireAuthor(context);
            if (auth.response) return auth.response;
            return await getAdminPost(Number(adminPostMatch[1]), env, jsonResponse);
        }
        if (adminPostMatch && request.method === "PATCH") {
            const auth = await requireAuthor(context);
            if (auth.response) return auth.response;
            return await updatePost(
                request,
                Number(adminPostMatch[1]),
                env,
                jsonResponse
            );
        }
        if (adminPostMatch && request.method === "DELETE") {
            const auth = await requireAuthor(context);
            if (auth.response) return auth.response;
            return await changePostState(
                Number(adminPostMatch[1]),
                "delete",
                env,
                jsonResponse
            );
        }
        if (adminActionMatch && request.method === "POST") {
            const auth = await requireAuthor(context);
            if (auth.response) return auth.response;
            return await changePostState(
                Number(adminActionMatch[1]),
                adminActionMatch[2],
                env,
                jsonResponse
            );
        }

        const knownPath = url.pathname === "/api/knowledge/posts"
            || Boolean(publicPostMatch)
            || url.pathname === "/api/knowledge/facets"
            || url.pathname === "/api/knowledge/admin/posts"
            || Boolean(adminPostMatch)
            || Boolean(adminActionMatch);
        return knownPath
            ? errorResponse(
                jsonResponse,
                405,
                "VALIDATION_ERROR",
                "请求方法不受支持"
            )
            : errorResponse(
                jsonResponse,
                404,
                "NOT_FOUND",
                "接口不存在"
            );
    }
    catch (error) {
        console.error("Knowledge API error:", safeErrorMessage(error));
        const databaseError = isDatabaseError(error);
        return errorResponse(
            jsonResponse,
            500,
            databaseError ? "DATABASE_ERROR" : "INTERNAL_ERROR",
            databaseError ? "知识站数据操作失败" : "服务器内部错误"
        );
    }
}

async function requireAuthor(context) {
    const token = context.getBearerToken(context.request);
    if (!token) {
        return {
            response: errorResponse(
                context.jsonResponse,
                401,
                "UNAUTHORIZED",
                "请先登录"
            )
        };
    }

    const user = await context.getAuthenticatedUser(token, context.env);
    if (!user) {
        return {
            response: errorResponse(
                context.jsonResponse,
                401,
                "UNAUTHORIZED",
                "登录状态已失效"
            )
        };
    }
    if (user.role !== "admin") {
        return {
            response: errorResponse(
                context.jsonResponse,
                403,
                "FORBIDDEN",
                "当前用户没有作者权限"
            )
        };
    }
    return { user };
}

async function getPublicPosts(request, env, jsonResponse) {
    const filters = parseListFilters(request, false);
    if (filters.error) return validationResponse(jsonResponse, filters.error);

    const result = await queryPostList(env, filters, true);
    return jsonResponse({
        success: true,
        data: {
            items: result.items.map(toListPost),
            pagination: makePagination(filters.page, filters.pageSize, result.total)
        }
    });
}

async function getPublicPost(slug, env, jsonResponse) {
    const post = await getPostBySlug(env, slug, true);
    if (!post) {
        return errorResponse(jsonResponse, 404, "NOT_FOUND", "文章不存在");
    }
    return jsonResponse({
        success: true,
        data: { post: toDetailPost(post, false) }
    });
}

async function getPublicFacets(env, jsonResponse) {
    const publishedWhere = "status = 'published' AND deleted_at IS NULL";
    const results = await env.DB.batch([
        env.DB.prepare(`
            SELECT type AS name, COUNT(*) AS count
            FROM knowledge_posts
            WHERE ${publishedWhere}
            GROUP BY type
            ORDER BY type ASC
        `),
        env.DB.prepare(`
            SELECT category AS name, category_slug AS slug, COUNT(*) AS count
            FROM knowledge_posts
            WHERE ${publishedWhere} AND category_slug IS NOT NULL
            GROUP BY category_slug, category
            ORDER BY count DESC, category ASC
        `),
        env.DB.prepare(`
            SELECT t.name, t.slug, COUNT(DISTINCT pt.post_id) AS count
            FROM knowledge_tags AS t
            JOIN knowledge_post_tags AS pt ON pt.tag_id = t.id
            JOIN knowledge_posts AS p ON p.id = pt.post_id
            WHERE p.status = 'published' AND p.deleted_at IS NULL
            GROUP BY t.id, t.name, t.slug
            ORDER BY count DESC, t.name ASC
        `),
        env.DB.prepare(`
            SELECT
                CAST(strftime('%Y', published_at) AS INTEGER) AS year,
                CAST(strftime('%m', published_at) AS INTEGER) AS month,
                COUNT(*) AS count
            FROM knowledge_posts
            WHERE ${publishedWhere} AND published_at IS NOT NULL
            GROUP BY year, month
            ORDER BY year DESC, month DESC
        `),
        env.DB.prepare(`
            SELECT
                COUNT(*) AS posts,
                SUM(CASE WHEN type = 'solution' THEN 1 ELSE 0 END) AS solutions,
                SUM(CASE WHEN type = 'note' THEN 1 ELSE 0 END) AS notes,
                SUM(CASE WHEN type = 'project' THEN 1 ELSE 0 END) AS projects,
                SUM(CASE WHEN type = 'essay' THEN 1 ELSE 0 END) AS essays,
                COALESCE(SUM(word_count), 0) AS words,
                MAX(updated_at) AS last_updated_at
            FROM knowledge_posts
            WHERE ${publishedWhere}
        `)
    ]);

    const stats = firstResult(results[4]) || {};
    return jsonResponse({
        success: true,
        data: {
            types: resultRows(results[0]).map((row) => ({
                type: row.name,
                count: Number(row.count) || 0
            })),
            categories: resultRows(results[1]).map((row) => ({
                name: row.name,
                slug: row.slug,
                count: Number(row.count) || 0
            })),
            tags: resultRows(results[2]).map((row) => ({
                name: row.name,
                slug: row.slug,
                count: Number(row.count) || 0
            })),
            archives: resultRows(results[3]).map((row) => ({
                year: Number(row.year),
                month: Number(row.month),
                count: Number(row.count) || 0
            })),
            stats: {
                posts: Number(stats.posts) || 0,
                solutions: Number(stats.solutions) || 0,
                notes: Number(stats.notes) || 0,
                projects: Number(stats.projects) || 0,
                essays: Number(stats.essays) || 0,
                words: Number(stats.words) || 0,
                lastUpdatedAt: stats.last_updated_at || null
            }
        }
    });
}

async function getAdminPosts(request, env, jsonResponse) {
    const filters = parseListFilters(request, true);
    if (filters.error) return validationResponse(jsonResponse, filters.error);
    const result = await queryPostList(env, filters, false);
    return jsonResponse({
        success: true,
        data: {
            items: result.items.map((post) => toListPost(post, true)),
            pagination: makePagination(filters.page, filters.pageSize, result.total)
        }
    });
}

async function getAdminPost(id, env, jsonResponse) {
    const post = await getPostById(env, id);
    if (!post) {
        return errorResponse(jsonResponse, 404, "NOT_FOUND", "文章不存在");
    }
    return jsonResponse({
        success: true,
        data: { post: toDetailPost(post, true) }
    });
}

async function createPost(request, env, user, jsonResponse) {
    const bodyResult = await readJsonBody(request);
    if (bodyResult.error) return validationResponse(jsonResponse, bodyResult.error);

    const validation = validatePost(bodyResult.body, null);
    if (validation.error) return validationResponse(jsonResponse, validation.error);
    const post = validation.value;

    const requestedSlug = typeof bodyResult.body.slug === "string"
        && bodyResult.body.slug.trim() !== "";
    const slugResult = await resolveCreateSlug(env, post.slug || post.title, requestedSlug);
    if (slugResult.conflict) {
        return errorResponse(jsonResponse, 409, "SLUG_CONFLICT", "文章 Slug 已存在", {
            slug: "该 Slug 已被使用"
        });
    }
    post.slug = slugResult.slug;

    const publishError = post.status === "published" ? validateForPublish(post) : null;
    if (publishError) return validationResponse(jsonResponse, publishError);

    const now = new Date().toISOString();
    const tagDefinitions = await resolveTagDefinitions(env, post.tags, now);
    const statements = [
        env.DB.prepare(`
            INSERT INTO knowledge_posts (
                author_user_id, slug, type, title, summary, content_markdown,
                cover_url, category, category_slug, status, is_pinned,
                is_featured, source_url, word_count, reading_time_minutes,
                version, created_at, updated_at, published_at, deleted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        `).bind(
            user.id,
            post.slug,
            post.type,
            post.title,
            post.summary,
            post.contentMarkdown,
            post.coverUrl,
            post.category,
            post.categorySlug,
            post.status,
            post.isPinned ? 1 : 0,
            post.isFeatured ? 1 : 0,
            post.sourceUrl,
            post.wordCount,
            post.readingTimeMinutes,
            now,
            now,
            post.status === "published" ? now : null,
            post.status === "deleted" ? now : null
        )
    ];

    appendTagCreateStatements(statements, env, tagDefinitions, now);
    appendTagRelationStatementsBySlug(statements, env, tagDefinitions, post.slug);
    if (post.type === "solution") {
        statements.push(solutionInsertBySlug(env, post.slug, post.solutionMeta));
    }

    let batchResults;
    try {
        batchResults = await env.DB.batch(statements);
    }
    catch (error) {
        if (isUniqueConstraintError(error)) {
            return errorResponse(jsonResponse, 409, "SLUG_CONFLICT", "Slug 或标签已存在");
        }
        throw error;
    }

    const insertedId = batchResults[0]?.meta?.last_row_id;
    const created = insertedId
        ? await getPostById(env, Number(insertedId))
        : await getPostBySlug(env, post.slug, false);
    return jsonResponse({
        success: true,
        data: { post: toDetailPost(created, true) }
    }, 201);
}

async function updatePost(request, id, env, jsonResponse) {
    const existing = await getPostById(env, id);
    if (!existing) {
        return errorResponse(jsonResponse, 404, "NOT_FOUND", "文章不存在");
    }

    const bodyResult = await readJsonBody(request);
    if (bodyResult.error) return validationResponse(jsonResponse, bodyResult.error);
    const version = Number(bodyResult.body.version);
    if (!Number.isInteger(version) || version < 1) {
        return validationResponse(jsonResponse, {
            version: "必须提供有效的文章版本"
        });
    }
    if (version !== existing.version) {
        return errorResponse(jsonResponse, 409, "VERSION_CONFLICT", "文章已被其他页面修改");
    }

    const validation = validatePost(bodyResult.body, existing);
    if (validation.error) return validationResponse(jsonResponse, validation.error);
    const post = validation.value;

    if (Object.prototype.hasOwnProperty.call(bodyResult.body, "slug")) {
        const normalized = normalizeSlug(post.slug);
        if (!normalized) {
            return validationResponse(jsonResponse, { slug: "Slug 不能为空" });
        }
        const conflict = await env.DB.prepare(`
            SELECT id FROM knowledge_posts WHERE slug = ? AND id <> ? LIMIT 1
        `).bind(normalized, id).first();
        if (conflict) {
            return errorResponse(jsonResponse, 409, "SLUG_CONFLICT", "文章 Slug 已存在", {
                slug: "该 Slug 已被使用"
            });
        }
        post.slug = normalized;
    }

    const publishError = post.status === "published" ? validateForPublish(post) : null;
    if (publishError) return validationResponse(jsonResponse, publishError);

    const now = new Date().toISOString();
    const nextVersion = version + 1;
    const tagDefinitions = await resolveTagDefinitions(env, post.tags, now);
    const publishedAt = post.status === "published"
        ? (existing.publishedAt || now)
        : existing.publishedAt;
    const deletedAt = post.status === "deleted"
        ? (existing.deletedAt || now)
        : null;

    const statements = [
        env.DB.prepare(`
            UPDATE knowledge_posts
            SET
                slug = ?, type = ?, title = ?, summary = ?, content_markdown = ?,
                cover_url = ?, category = ?, category_slug = ?, status = ?,
                is_pinned = ?, is_featured = ?, source_url = ?, word_count = ?,
                reading_time_minutes = ?, version = version + 1, updated_at = ?,
                published_at = ?, deleted_at = ?
            WHERE id = ? AND version = ?
        `).bind(
            post.slug,
            post.type,
            post.title,
            post.summary,
            post.contentMarkdown,
            post.coverUrl,
            post.category,
            post.categorySlug,
            post.status,
            post.isPinned ? 1 : 0,
            post.isFeatured ? 1 : 0,
            post.sourceUrl,
            post.wordCount,
            post.readingTimeMinutes,
            now,
            publishedAt,
            deletedAt,
            id,
            version
        )
    ];

    appendConditionalTagCreateStatements(
        statements,
        env,
        tagDefinitions,
        now,
        id,
        nextVersion,
        now
    );
    statements.push(env.DB.prepare(`
        DELETE FROM knowledge_post_tags
        WHERE post_id = ?
          AND EXISTS (
              SELECT 1 FROM knowledge_posts
              WHERE id = ? AND version = ? AND updated_at = ?
          )
    `).bind(id, id, nextVersion, now));
    appendConditionalTagRelations(
        statements,
        env,
        tagDefinitions,
        id,
        nextVersion,
        now
    );
    statements.push(env.DB.prepare(`
        DELETE FROM knowledge_solution_meta
        WHERE post_id = ?
          AND EXISTS (
              SELECT 1 FROM knowledge_posts
              WHERE id = ? AND version = ? AND updated_at = ?
          )
    `).bind(id, id, nextVersion, now));
    if (post.type === "solution") {
        statements.push(solutionInsertConditional(
            env,
            id,
            nextVersion,
            now,
            post.solutionMeta
        ));
    }

    const results = await env.DB.batch(statements);
    if (!Number(results[0]?.meta?.changes)) {
        return errorResponse(jsonResponse, 409, "VERSION_CONFLICT", "文章已被其他页面修改");
    }
    const updated = await getPostById(env, id);
    return jsonResponse({
        success: true,
        data: { post: toDetailPost(updated, true) }
    });
}

async function changePostState(id, action, env, jsonResponse) {
    const post = await getPostById(env, id);
    if (!post) {
        return errorResponse(jsonResponse, 404, "NOT_FOUND", "文章不存在");
    }

    const now = new Date().toISOString();
    let status;
    let publishedAt = post.publishedAt;
    let deletedAt = post.deletedAt;

    if (action === "publish") {
        const error = validateForPublish(post);
        if (error) return validationResponse(jsonResponse, error);
        status = "published";
        publishedAt = publishedAt || now;
        deletedAt = null;
    }
    else if (action === "unpublish") {
        status = "draft";
        deletedAt = null;
    }
    else if (action === "archive") {
        status = "archived";
        deletedAt = null;
    }
    else if (action === "delete") {
        status = "deleted";
        deletedAt = now;
    }
    else if (action === "restore") {
        if (post.status !== "deleted") {
            return validationResponse(jsonResponse, {
                status: "只有已删除文章可以恢复"
            });
        }
        status = "draft";
        deletedAt = null;
    }
    else {
        return validationResponse(jsonResponse, { action: "未知状态操作" });
    }

    await env.DB.prepare(`
        UPDATE knowledge_posts
        SET status = ?, published_at = ?, deleted_at = ?,
            updated_at = ?, version = version + 1
        WHERE id = ?
    `).bind(status, publishedAt, deletedAt, now, id).run();

    const updated = await getPostById(env, id);
    return jsonResponse({
        success: true,
        data: { post: toDetailPost(updated, true) }
    });
}

function parseListFilters(request, admin) {
    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get("page"), 1);
    const pageSize = Math.min(
        parsePositiveInteger(url.searchParams.get("pageSize"), 10),
        MAX_PAGE_SIZE
    );
    const type = cleanOptional(url.searchParams.get("type"));
    const status = cleanOptional(url.searchParams.get("status"));
    const sort = cleanOptional(url.searchParams.get("sort")) || "latest";
    const category = cleanOptional(url.searchParams.get("category"));
    const tag = cleanOptional(url.searchParams.get("tag"));
    const q = cleanOptional(url.searchParams.get("q"));

    if (type && !CONTENT_TYPES.has(type)) return { error: { type: "内容类型无效" } };
    if (admin && status && !POST_STATUSES.has(status)) {
        return { error: { status: "文章状态无效" } };
    }
    const allowedSorts = admin ? ADMIN_SORT_ORDERS : SORT_ORDERS;
    if (!Object.prototype.hasOwnProperty.call(allowedSorts, sort)) {
        return { error: { sort: "排序方式无效" } };
    }
    if (category.length > 200) return { error: { category: "分类筛选值过长" } };
    if (tag.length > 200) return { error: { tag: "标签筛选值过长" } };
    if (q.length > 200) return { error: { q: "搜索关键词不能超过 200 个字符" } };

    const featured = parseOptionalBoolean(url.searchParams.get("featured"));
    const pinned = parseOptionalBoolean(url.searchParams.get("pinned"));
    if (featured.error) return { error: { featured: "必须为 true 或 false" } };
    if (pinned.error) return { error: { pinned: "必须为 true 或 false" } };

    return {
        page,
        pageSize,
        type,
        status: admin ? status : null,
        category,
        tag,
        q,
        sort,
        featured: featured.value,
        pinned: pinned.value,
        admin
    };
}

async function queryPostList(env, filters, publicOnly) {
    const where = [];
    const bindings = [];
    if (publicOnly) {
        where.push("p.status = 'published'", "p.deleted_at IS NULL");
    }
    else if (filters.status) {
        where.push("p.status = ?");
        bindings.push(filters.status);
    }
    if (filters.type) {
        where.push("p.type = ?");
        bindings.push(filters.type);
    }
    if (filters.category) {
        where.push("p.category_slug = ?");
        bindings.push(normalizeSlug(filters.category));
    }
    if (filters.tag) {
        where.push(`
            EXISTS (
                SELECT 1
                FROM knowledge_post_tags AS filter_pt
                JOIN knowledge_tags AS filter_t ON filter_t.id = filter_pt.tag_id
                WHERE filter_pt.post_id = p.id AND filter_t.slug = ?
            )
        `);
        bindings.push(normalizeSlug(filters.tag));
    }
    if (filters.q) {
        where.push(`
            (
                LOWER(p.title) LIKE ? OR LOWER(p.summary) LIKE ?
                OR LOWER(p.content_markdown) LIKE ?
                OR EXISTS (
                    SELECT 1
                    FROM knowledge_post_tags AS search_pt
                    JOIN knowledge_tags AS search_t ON search_t.id = search_pt.tag_id
                    WHERE search_pt.post_id = p.id AND LOWER(search_t.name) LIKE ?
                )
            )
        `);
        const query = `%${filters.q.toLowerCase()}%`;
        bindings.push(query, query, query, query);
    }
    if (filters.featured !== null) {
        where.push("p.is_featured = ?");
        bindings.push(filters.featured ? 1 : 0);
    }
    if (filters.pinned !== null) {
        where.push("p.is_pinned = ?");
        bindings.push(filters.pinned ? 1 : 0);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql = (filters.admin ? ADMIN_SORT_ORDERS : SORT_ORDERS)[filters.sort];
    const offset = (filters.page - 1) * filters.pageSize;
    const countRow = await env.DB.prepare(`
        SELECT COUNT(*) AS total FROM knowledge_posts AS p ${whereSql}
    `).bind(...bindings).first();
    const rows = await env.DB.prepare(`
        SELECT ${POST_COLUMNS}
        FROM knowledge_posts AS p
        ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ? OFFSET ?
    `).bind(...bindings, filters.pageSize, offset).all();

    return {
        items: await hydratePosts(env, rows.results || []),
        total: Number(countRow?.total) || 0
    };
}

async function getPostBySlug(env, slug, publicOnly) {
    const normalized = normalizeSlug(slug);
    if (!normalized) return null;
    const visibility = publicOnly
        ? "AND p.status = 'published' AND p.deleted_at IS NULL"
        : "";
    const row = await env.DB.prepare(`
        SELECT ${POST_COLUMNS}
        FROM knowledge_posts AS p
        WHERE p.slug = ? ${visibility}
        LIMIT 1
    `).bind(normalized).first();
    if (!row) return null;
    return (await hydratePosts(env, [row]))[0] || null;
}

async function getPostById(env, id) {
    const row = await env.DB.prepare(`
        SELECT ${POST_COLUMNS}
        FROM knowledge_posts AS p
        WHERE p.id = ?
        LIMIT 1
    `).bind(id).first();
    if (!row) return null;
    return (await hydratePosts(env, [row]))[0] || null;
}

const POST_COLUMNS = `
    p.id, p.author_user_id, p.slug, p.type, p.title, p.summary,
    p.content_markdown, p.cover_url, p.category, p.category_slug,
    p.status, p.is_pinned, p.is_featured, p.source_url, p.word_count,
    p.reading_time_minutes, p.version, p.created_at, p.updated_at,
    p.published_at, p.deleted_at
`;

async function hydratePosts(env, rows) {
    if (!rows.length) return [];
    const ids = rows.map((row) => Number(row.id));
    const placeholders = ids.map(() => "?").join(", ");
    const [tagResult, solutionResult] = await env.DB.batch([
        env.DB.prepare(`
            SELECT pt.post_id, t.name, t.slug
            FROM knowledge_post_tags AS pt
            JOIN knowledge_tags AS t ON t.id = pt.tag_id
            WHERE pt.post_id IN (${placeholders})
            ORDER BY t.name ASC
        `).bind(...ids),
        env.DB.prepare(`
            SELECT *
            FROM knowledge_solution_meta
            WHERE post_id IN (${placeholders})
        `).bind(...ids)
    ]);
    const tagsByPost = new Map();
    resultRows(tagResult).forEach((row) => {
        const tags = tagsByPost.get(Number(row.post_id)) || [];
        tags.push({ name: row.name, slug: row.slug });
        tagsByPost.set(Number(row.post_id), tags);
    });
    const solutionsByPost = new Map(
        resultRows(solutionResult).map((row) => [Number(row.post_id), mapSolution(row)])
    );
    return rows.map((row) => mapPost(
        row,
        tagsByPost.get(Number(row.id)) || [],
        solutionsByPost.get(Number(row.id)) || null
    ));
}

function validatePost(body, existing) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: { request: "请求体必须是 JSON 对象" } };
    }
    const merged = existing ? {
        type: existing.type,
        title: existing.title,
        slug: existing.slug,
        summary: existing.summary,
        contentMarkdown: existing.contentMarkdown,
        coverUrl: existing.coverUrl,
        category: existing.category,
        tags: existing.tags.map((tag) => tag.name),
        status: existing.status,
        isPinned: existing.isPinned,
        isFeatured: existing.isFeatured,
        sourceUrl: existing.sourceUrl,
        solutionMeta: existing.solutionMeta,
        ...body
    } : {
        summary: "",
        contentMarkdown: "",
        coverUrl: null,
        category: null,
        tags: [],
        status: "draft",
        isPinned: false,
        isFeatured: false,
        sourceUrl: null,
        solutionMeta: null,
        ...body
    };
    const fields = {};
    const type = cleanOptional(merged.type);
    const title = typeof merged.title === "string" ? merged.title.trim() : "";
    const suppliedSlug = typeof merged.slug === "string" ? merged.slug.trim() : "";
    const contentMarkdown = typeof merged.contentMarkdown === "string"
        ? merged.contentMarkdown
        : "";
    const category = nullableString(merged.category);
    const status = cleanOptional(merged.status) || "draft";

    if (!CONTENT_TYPES.has(type)) fields.type = "内容类型无效";
    if (!title || title.length > 160) fields.title = "标题长度必须为 1～160 个字符";
    if (suppliedSlug.length > 200) {
        fields.slug = "Slug 不能超过 200 个字符";
    }
    if (contentMarkdown.length > MAX_CONTENT_LENGTH) {
        fields.contentMarkdown = "正文不能超过 2MB";
    }
    if (!POST_STATUSES.has(status)) fields.status = "文章状态无效";
    if (category !== null && category.length > 80) fields.category = "分类不能超过 80 个字符";

    const coverUrl = validateUrlValue(merged.coverUrl, true);
    if (coverUrl.error) fields.coverUrl = coverUrl.error;
    const sourceUrl = validateUrlValue(merged.sourceUrl, false);
    if (sourceUrl.error) fields.sourceUrl = sourceUrl.error;
    const tags = normalizeTags(merged.tags);
    if (tags.error) fields.tags = tags.error;
    if (typeof merged.isPinned !== "boolean") fields.isPinned = "必须为布尔值";
    if (typeof merged.isFeatured !== "boolean") fields.isFeatured = "必须为布尔值";

    let solutionMeta = null;
    if (type === "solution") {
        const solution = validateSolutionMeta(merged.solutionMeta);
        if (solution.error) Object.assign(fields, solution.error);
        else solutionMeta = solution.value;
    }
    else if (
        Object.prototype.hasOwnProperty.call(body, "solutionMeta")
        && body.solutionMeta !== null
        && body.solutionMeta !== undefined
    ) {
        fields.solutionMeta = "只有算法题解可以包含 solutionMeta";
    }

    const explicitSummary = typeof merged.summary === "string" ? merged.summary.trim() : "";
    if (explicitSummary.length > 600) fields.summary = "摘要不能超过 600 个字符";
    if (Object.keys(fields).length) return { error: fields };

    const metrics = calculateContentMetrics(contentMarkdown);
    return {
        value: {
            type,
            title,
            slug: suppliedSlug ? normalizeSlug(suppliedSlug) : normalizeSlug(title),
            summary: explicitSummary || createMarkdownSummary(contentMarkdown),
            contentMarkdown,
            coverUrl: coverUrl.value,
            category,
            categorySlug: category ? normalizeSlug(category) : null,
            tags: tags.value,
            status,
            isPinned: merged.isPinned,
            isFeatured: merged.isFeatured,
            sourceUrl: sourceUrl.value,
            solutionMeta,
            wordCount: metrics.wordCount,
            readingTimeMinutes: metrics.readingTimeMinutes
        }
    };
}

function validateSolutionMeta(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { error: { solutionMeta: "算法题解必须提供 solutionMeta" } };
    }
    const fields = {};
    const result = {
        platform: limitedNullable(value.platform, 80, fields, "solutionMeta.platform"),
        problemId: limitedNullable(value.problemId, 80, fields, "solutionMeta.problemId"),
        problemTitle: limitedNullable(value.problemTitle, 200, fields, "solutionMeta.problemTitle"),
        problemUrl: null,
        difficulty: limitedNullable(value.difficulty, 80, fields, "solutionMeta.difficulty"),
        algorithms: [],
        language: limitedNullable(value.language, 60, fields, "solutionMeta.language"),
        timeComplexity: limitedNullable(
            value.timeComplexity,
            100,
            fields,
            "solutionMeta.timeComplexity"
        ),
        spaceComplexity: limitedNullable(
            value.spaceComplexity,
            100,
            fields,
            "solutionMeta.spaceComplexity"
        ),
        accepted: value.accepted === null || value.accepted === undefined
            ? null
            : value.accepted
    };
    const problemUrl = validateUrlValue(value.problemUrl, false);
    if (problemUrl.error) fields["solutionMeta.problemUrl"] = problemUrl.error;
    result.problemUrl = problemUrl.value;
    const algorithms = normalizeTags(value.algorithms);
    if (algorithms.error) fields["solutionMeta.algorithms"] = algorithms.error;
    else result.algorithms = algorithms.value;
    if (result.accepted !== null && typeof result.accepted !== "boolean") {
        fields["solutionMeta.accepted"] = "必须为布尔值或 null";
    }
    return Object.keys(fields).length ? { error: fields } : { value: result };
}

function validateForPublish(post) {
    const fields = {};
    if (!post.title.trim()) fields.title = "发布前必须填写标题";
    if (!post.slug.trim()) fields.slug = "发布前必须生成 Slug";
    if (!post.contentMarkdown.trim()) fields.contentMarkdown = "发布前必须填写正文";
    if (!CONTENT_TYPES.has(post.type)) fields.type = "内容类型无效";
    if (post.type === "solution") {
        const meta = post.solutionMeta || {};
        if (!meta.platform) fields["solutionMeta.platform"] = "发布题解前必须填写平台";
        if (!meta.problemId) fields["solutionMeta.problemId"] = "发布题解前必须填写题号";
        if (!meta.problemTitle) fields["solutionMeta.problemTitle"] = "发布题解前必须填写题目名称";
    }
    return Object.keys(fields).length ? fields : null;
}

async function resolveCreateSlug(env, source, explicit) {
    const base = normalizeSlug(source).slice(0, 190) || "post";
    const first = await env.DB.prepare(
        "SELECT id FROM knowledge_posts WHERE slug = ? LIMIT 1"
    ).bind(base).first();
    if (!first) return { slug: base };
    if (explicit) return { conflict: true };

    for (let suffix = 2; suffix <= 9999; suffix += 1) {
        const candidate = `${base.slice(0, 200 - String(suffix).length - 1)}-${suffix}`;
        const row = await env.DB.prepare(
            "SELECT id FROM knowledge_posts WHERE slug = ? LIMIT 1"
        ).bind(candidate).first();
        if (!row) return { slug: candidate };
    }
    throw new Error("Unable to generate unique knowledge post slug");
}

async function resolveTagDefinitions(env, names, now) {
    const definitions = [];
    const reserved = new Set();
    for (const name of names) {
        const existing = await env.DB.prepare(
            "SELECT name, slug FROM knowledge_tags WHERE name = ? LIMIT 1"
        ).bind(name).first();
        if (existing) {
            definitions.push({ name: existing.name, slug: existing.slug });
            reserved.add(existing.slug);
            continue;
        }
        const base = normalizeSlug(name).slice(0, 190) || "tag";
        let slug = base;
        let suffix = 2;
        while (reserved.has(slug) || await tagSlugExists(env, slug)) {
            slug = `${base.slice(0, 200 - String(suffix).length - 1)}-${suffix}`;
            suffix += 1;
        }
        reserved.add(slug);
        definitions.push({ name, slug, createdAt: now });
    }
    return definitions;
}

async function tagSlugExists(env, slug) {
    return Boolean(await env.DB.prepare(
        "SELECT id FROM knowledge_tags WHERE slug = ? LIMIT 1"
    ).bind(slug).first());
}

function appendTagCreateStatements(statements, env, tags, now) {
    tags.forEach((tag) => {
        statements.push(env.DB.prepare(`
            INSERT OR IGNORE INTO knowledge_tags (name, slug, created_at)
            VALUES (?, ?, ?)
        `).bind(tag.name, tag.slug, now));
    });
}

function appendTagRelationStatementsBySlug(statements, env, tags, postSlug) {
    tags.forEach((tag) => {
        statements.push(env.DB.prepare(`
            INSERT OR IGNORE INTO knowledge_post_tags (post_id, tag_id)
            SELECT p.id, t.id
            FROM knowledge_posts AS p, knowledge_tags AS t
            WHERE p.slug = ? AND t.name = ?
        `).bind(postSlug, tag.name));
    });
}

function appendConditionalTagCreateStatements(
    statements,
    env,
    tags,
    now,
    postId,
    version,
    updatedAt
) {
    tags.forEach((tag) => {
        statements.push(env.DB.prepare(`
            INSERT OR IGNORE INTO knowledge_tags (name, slug, created_at)
            SELECT ?, ?, ?
            WHERE EXISTS (
                SELECT 1 FROM knowledge_posts
                WHERE id = ? AND version = ? AND updated_at = ?
            )
        `).bind(tag.name, tag.slug, now, postId, version, updatedAt));
    });
}

function appendConditionalTagRelations(
    statements,
    env,
    tags,
    postId,
    version,
    updatedAt
) {
    tags.forEach((tag) => {
        statements.push(env.DB.prepare(`
            INSERT OR IGNORE INTO knowledge_post_tags (post_id, tag_id)
            SELECT ?, t.id
            FROM knowledge_tags AS t
            WHERE t.name = ?
              AND EXISTS (
                  SELECT 1 FROM knowledge_posts
                  WHERE id = ? AND version = ? AND updated_at = ?
              )
        `).bind(postId, tag.name, postId, version, updatedAt));
    });
}

function solutionInsertBySlug(env, postSlug, meta) {
    return env.DB.prepare(`
        INSERT INTO knowledge_solution_meta (
            post_id, platform, problem_id, problem_title, problem_url,
            difficulty, algorithms_json, language, time_complexity,
            space_complexity, accepted
        )
        SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM knowledge_posts
        WHERE slug = ?
    `).bind(...solutionBindings(meta), postSlug);
}

function solutionInsertConditional(env, postId, version, updatedAt, meta) {
    return env.DB.prepare(`
        INSERT INTO knowledge_solution_meta (
            post_id, platform, problem_id, problem_title, problem_url,
            difficulty, algorithms_json, language, time_complexity,
            space_complexity, accepted
        )
        SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM knowledge_posts
        WHERE id = ? AND version = ? AND updated_at = ?
    `).bind(...solutionBindings(meta), postId, version, updatedAt);
}

function solutionBindings(meta) {
    return [
        meta.platform,
        meta.problemId,
        meta.problemTitle,
        meta.problemUrl,
        meta.difficulty,
        JSON.stringify(meta.algorithms),
        meta.language,
        meta.timeComplexity,
        meta.spaceComplexity,
        meta.accepted === null ? null : (meta.accepted ? 1 : 0)
    ];
}

function mapPost(row, tags, solutionMeta) {
    return {
        id: Number(row.id),
        authorUserId: Number(row.author_user_id),
        slug: row.slug,
        type: row.type,
        title: row.title,
        summary: row.summary,
        contentMarkdown: row.content_markdown,
        coverUrl: row.cover_url || null,
        category: row.category || null,
        categorySlug: row.category_slug || null,
        tags,
        status: row.status,
        isPinned: Boolean(row.is_pinned),
        isFeatured: Boolean(row.is_featured),
        sourceUrl: row.source_url || null,
        wordCount: Number(row.word_count) || 0,
        readingTimeMinutes: Math.max(1, Number(row.reading_time_minutes) || 1),
        version: Number(row.version) || 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at || null,
        deletedAt: row.deleted_at || null,
        solutionMeta
    };
}

function mapSolution(row) {
    let algorithms = [];
    try {
        const parsed = JSON.parse(row.algorithms_json || "[]");
        if (Array.isArray(parsed)) algorithms = parsed.filter((item) => typeof item === "string");
    }
    catch {
        algorithms = [];
    }
    return {
        platform: row.platform || null,
        problemId: row.problem_id || null,
        problemTitle: row.problem_title || null,
        problemUrl: row.problem_url || null,
        difficulty: row.difficulty || null,
        algorithms,
        language: row.language || null,
        timeComplexity: row.time_complexity || null,
        spaceComplexity: row.space_complexity || null,
        accepted: row.accepted === null || row.accepted === undefined
            ? null
            : Boolean(row.accepted)
    };
}

function toListPost(post, admin = false) {
    const result = {
        id: post.id,
        slug: post.slug,
        type: post.type,
        title: post.title,
        summary: post.summary,
        coverUrl: post.coverUrl,
        category: post.category,
        categorySlug: post.categorySlug,
        tags: post.tags,
        status: post.status,
        isPinned: post.isPinned,
        isFeatured: post.isFeatured,
        sourceUrl: post.sourceUrl,
        wordCount: post.wordCount,
        readingTimeMinutes: post.readingTimeMinutes,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        publishedAt: post.publishedAt,
        solutionMeta: post.type === "solution" ? post.solutionMeta : null
    };
    if (admin) {
        result.version = post.version;
        result.deletedAt = post.deletedAt;
    }
    return result;
}

function toDetailPost(post, admin) {
    return {
        ...toListPost(post, admin),
        contentMarkdown: post.contentMarkdown,
        authorUserId: admin ? post.authorUserId : undefined
    };
}

function normalizeTags(value) {
    if (value === undefined || value === null) return { value: [] };
    if (!Array.isArray(value)) return { error: "标签必须是字符串数组" };
    const unique = [];
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== "string") return { error: "标签必须是字符串" };
        const name = item.trim();
        if (!name || seen.has(name.toLocaleLowerCase())) continue;
        if (name.length > MAX_TAG_LENGTH) {
            return { error: `单个标签不能超过 ${MAX_TAG_LENGTH} 个字符` };
        }
        seen.add(name.toLocaleLowerCase());
        unique.push(name);
    }
    if (unique.length > MAX_TAGS) return { error: `标签不能超过 ${MAX_TAGS} 个` };
    return { value: unique };
}

export function normalizeSlug(value) {
    return String(value || "")
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, 200);
}

export function calculateContentMetrics(markdown) {
    const text = markdownToPlainText(markdown);
    const chineseCount = (text.match(/[\p{Script=Han}]/gu) || []).length;
    const latinWords = (text
        .replace(/[\p{Script=Han}]/gu, " ")
        .match(/[\p{Letter}\p{Number}]+(?:['’-][\p{Letter}\p{Number}]+)*/gu) || []).length;
    const wordCount = chineseCount + latinWords;
    const readingTimeMinutes = Math.max(1, Math.ceil(chineseCount / 400 + latinWords / 220));
    return { wordCount, readingTimeMinutes };
}

export function createMarkdownSummary(markdown, limit = 240) {
    const text = markdownToPlainText(
        String(markdown || "").replace(/```[\s\S]*?```/g, " ")
    );
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trimEnd()}…`;
}

function markdownToPlainText(markdown) {
    return String(markdown || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/^[>#*+\-\d.\s]+/gm, "")
        .replace(/[*_~|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function validateUrlValue(value, allowRelative) {
    if (value === undefined || value === null || value === "") return { value: null };
    if (typeof value !== "string") return { error: "必须是 URL 字符串" };
    const trimmed = value.trim();
    if (!trimmed) return { value: null };
    if (trimmed.length > 2048) return { error: "URL 不能超过 2048 个字符" };
    if (allowRelative && /^\/(?!\/)[^\s]*$/.test(trimmed)) return { value: trimmed };
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return { error: "只允许 http 或 https URL" };
        }
        return { value: trimmed };
    }
    catch {
        return { error: allowRelative ? "URL 或项目相对路径无效" : "URL 无效" };
    }
}

function limitedNullable(value, maximum, fields, fieldName) {
    const result = nullableString(value);
    if (result !== null && result.length > maximum) {
        fields[fieldName] = `不能超过 ${maximum} 个字符`;
    }
    return result;
}

function nullableString(value) {
    if (value === undefined || value === null) return null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readJsonBody(request) {
    const declaredLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
        return { error: { request: "请求体过大" } };
    }
    try {
        return { body: await request.json() };
    }
    catch {
        return { error: { request: "请求体必须是有效 JSON" } };
    }
}

function makePagination(page, pageSize, total) {
    const totalPages = total ? Math.ceil(total / pageSize) : 0;
    return {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages
    };
}

function parsePositiveInteger(value, fallback) {
    if (!/^\d+$/.test(value || "")) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 1000000
        ? parsed
        : fallback;
}

function parseOptionalBoolean(value) {
    if (value === null || value === "") return { value: null };
    if (value === "true") return { value: true };
    if (value === "false") return { value: false };
    return { value: null, error: true };
}

function cleanOptional(value) {
    return typeof value === "string" ? value.trim() : "";
}

function matchPath(pathname, expression) {
    const match = pathname.match(expression);
    if (!match) return null;
    try {
        match[1] = decodeURIComponent(match[1]);
        return match;
    }
    catch {
        return null;
    }
}

function resultRows(result) {
    return result?.results || [];
}

function firstResult(result) {
    return resultRows(result)[0] || null;
}

function validationResponse(jsonResponse, fields) {
    return errorResponse(
        jsonResponse,
        400,
        "VALIDATION_ERROR",
        "请求数据不合法",
        fields
    );
}

function errorResponse(jsonResponse, status, code, message, fields) {
    const error = { code, message };
    if (fields && Object.keys(fields).length) error.fields = fields;
    return jsonResponse({ success: false, error }, status);
}

function isUniqueConstraintError(error) {
    return /unique|constraint/i.test(safeErrorMessage(error));
}

function isDatabaseError(error) {
    return /d1|sql|sqlite|database|constraint|no such table|no such column/i.test(
        safeErrorMessage(error)
    );
}

function safeErrorMessage(error) {
    return error instanceof Error ? error.message : String(error || "Unknown error");
}

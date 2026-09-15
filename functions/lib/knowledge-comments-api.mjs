const MAX_COMMENT_LENGTH = 2000;
const POST_COMMENTS_PATTERN = /^\/api\/knowledge\/post-comments\/(knowledge|legacy-blog)\/(\d+)$/;
const COMMENT_PATTERN = /^\/api\/knowledge\/comments\/(\d+)$/;

export function isKnowledgeCommentPath(pathname) {
    return POST_COMMENTS_PATTERN.test(pathname)
        || COMMENT_PATTERN.test(pathname);
}

export async function handleKnowledgeCommentRequest(context) {
    const { request, url } = context;
    const postCommentsMatch = url.pathname.match(POST_COMMENTS_PATTERN);
    const commentMatch = url.pathname.match(COMMENT_PATTERN);

    if (postCommentsMatch && request.method === "GET") {
        return getComments(postCommentsMatch[1], postCommentsMatch[2], context);
    }
    if (postCommentsMatch && request.method === "POST") {
        return createComment(postCommentsMatch[1], postCommentsMatch[2], context);
    }
    if (commentMatch && request.method === "DELETE") {
        return deleteComment(commentMatch[1], context);
    }

    return failure(context, 405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
}

async function getComments(postSource, postId, context) {
    const post = await getPublishedPost(postSource, postId, context.env);
    if (!post) return failure(context, 404, "NOT_FOUND", "文章不存在或尚未发布");

    const result = await context.env.DB.prepare(`
        SELECT
            c.id,
            c.post_source,
            c.post_id,
            c.parent_id,
            c.content,
            c.created_at,
            u.id AS author_id,
            u.username AS author_username,
            u.role AS author_role
        FROM knowledge_comments AS c
        JOIN users AS u ON u.id = c.user_id
        WHERE c.post_source = ? AND c.post_id = ?
        ORDER BY c.created_at ASC, c.id ASC
    `).bind(postSource, postId).all();

    return context.jsonResponse({
        success: true,
        data: { comments: buildCommentTree(result.results || []) }
    });
}

async function createComment(postSource, postId, context) {
    const token = context.getBearerToken(context.request);
    if (!token) return failure(context, 401, "UNAUTHORIZED", "请先登录");

    const user = await context.getAuthenticatedUser(token, context.env);
    if (!user) return failure(context, 401, "UNAUTHORIZED", "登录状态已失效");

    const post = await getPublishedPost(postSource, postId, context.env);
    if (!post) return failure(context, 404, "NOT_FOUND", "文章不存在或尚未发布");

    let body;
    try {
        body = await context.request.json();
    }
    catch {
        return failure(context, 400, "INVALID_REQUEST", "请求数据格式错误");
    }

    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return failure(context, 400, "INVALID_COMMENT", "评论内容不能为空");
    if (content.length > MAX_COMMENT_LENGTH) {
        return failure(
            context,
            400,
            "INVALID_COMMENT",
            `评论内容不能超过 ${MAX_COMMENT_LENGTH} 个字符`
        );
    }

    let parentId = null;
    if (body?.parentId !== undefined && body.parentId !== null) {
        const requestedParentId = Number(body.parentId);
        if (!Number.isInteger(requestedParentId) || requestedParentId <= 0) {
            return failure(context, 400, "INVALID_PARENT", "回复的评论无效");
        }
        const parent = await getCommentById(requestedParentId, context.env);
        if (
            !parent
            || parent.postSource !== postSource
            || Number(parent.postId) !== Number(postId)
        ) {
            return failure(context, 400, "INVALID_PARENT", "回复的评论不属于当前文章");
        }
        parentId = parent.parentId || parent.id;
    }

    const result = await context.env.DB.prepare(`
        INSERT INTO knowledge_comments (post_source, post_id, user_id, parent_id, content)
        VALUES (?, ?, ?, ?, ?)
    `).bind(postSource, postId, user.id, parentId, content).run();

    const comment = await getCommentById(result.meta?.last_row_id, context.env);
    return context.jsonResponse({
        success: true,
        data: { comment },
        message: "评论发表成功"
    }, 201);
}

async function deleteComment(commentId, context) {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;

    const comment = await getCommentById(commentId, context.env);
    if (!comment) return failure(context, 404, "NOT_FOUND", "评论不存在");

    if (comment.parentId === null) {
        await context.env.DB.batch([
            context.env.DB.prepare(
                "DELETE FROM knowledge_comments WHERE parent_id = ?"
            ).bind(commentId),
            context.env.DB.prepare(
                "DELETE FROM knowledge_comments WHERE id = ?"
            ).bind(commentId)
        ]);
    }
    else {
        await context.env.DB.prepare(
            "DELETE FROM knowledge_comments WHERE id = ?"
        ).bind(commentId).run();
    }

    return context.jsonResponse({
        success: true,
        data: { id: Number(commentId) },
        message: "评论删除成功"
    });
}

async function requireAdmin(context) {
    const token = context.getBearerToken(context.request);
    if (!token) {
        return { response: failure(context, 401, "UNAUTHORIZED", "请先登录") };
    }
    const user = await context.getAuthenticatedUser(token, context.env);
    if (!user) {
        return { response: failure(context, 401, "UNAUTHORIZED", "登录状态已失效") };
    }
    if (user.role !== "admin") {
        return { response: failure(context, 403, "FORBIDDEN", "没有删除评论的权限") };
    }
    return { user };
}

async function getPublishedPost(postSource, postId, env) {
    if (postSource === "legacy-blog") {
        return env.DB.prepare(`
            SELECT id FROM articles WHERE id = ? LIMIT 1
        `).bind(postId).first();
    }
    return env.DB.prepare(`
            SELECT id
            FROM knowledge_posts
            WHERE id = ? AND status = 'published' AND deleted_at IS NULL
            LIMIT 1
        `).bind(postId).first();
}

async function getCommentById(commentId, env) {
    if (commentId === undefined || commentId === null) return null;
    const row = await env.DB.prepare(`
        SELECT
            c.id,
            c.post_source,
            c.post_id,
            c.parent_id,
            c.content,
            c.created_at,
            u.id AS author_id,
            u.username AS author_username,
            u.role AS author_role
        FROM knowledge_comments AS c
        JOIN users AS u ON u.id = c.user_id
        WHERE c.id = ?
        LIMIT 1
    `).bind(commentId).first();
    return row ? mapComment(row) : null;
}

function buildCommentTree(rows) {
    const comments = rows.map(mapComment);
    const roots = [];
    const rootsById = new Map();
    comments.forEach((comment) => {
        if (comment.parentId === null) {
            comment.replies = [];
            roots.push(comment);
            rootsById.set(comment.id, comment);
        }
    });
    comments.forEach((comment) => {
        if (comment.parentId === null) return;
        const parent = rootsById.get(comment.parentId);
        if (parent) parent.replies.push(comment);
    });
    return roots;
}

function mapComment(row) {
    return {
        id: Number(row.id),
        postSource: row.post_source,
        postId: Number(row.post_id),
        parentId: row.parent_id === null ? null : Number(row.parent_id),
        content: row.content,
        createdAt: row.created_at,
        author: {
            id: Number(row.author_id),
            username: row.author_username,
            role: row.author_role
        }
    };
}

function failure(context, status, code, message) {
    return context.jsonResponse({
        success: false,
        error: { code, message }
    }, status);
}

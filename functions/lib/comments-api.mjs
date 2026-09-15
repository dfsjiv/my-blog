const MAX_COMMENT_LENGTH = 2000;
const ARTICLE_COMMENTS_PATTERN = /^\/api\/articles\/(\d+)\/comments$/;
const COMMENT_PATTERN = /^\/api\/comments\/(\d+)$/;

export function isCommentPath(pathname) {
    return ARTICLE_COMMENTS_PATTERN.test(pathname)
        || COMMENT_PATTERN.test(pathname);
}

export async function handleCommentRequest(context) {
    const { request, url } = context;
    const articleCommentsMatch = url.pathname.match(ARTICLE_COMMENTS_PATTERN);
    const commentMatch = url.pathname.match(COMMENT_PATTERN);

    if (articleCommentsMatch && request.method === "GET") {
        return handleGetComments(articleCommentsMatch[1], context);
    }

    if (articleCommentsMatch && request.method === "POST") {
        return handleCreateComment(request, articleCommentsMatch[1], context);
    }

    if (commentMatch && request.method === "DELETE") {
        return handleDeleteComment(request, commentMatch[1], context);
    }

    return context.jsonResponse(
        { success: false, message: "Method Not Allowed" },
        405
    );
}

async function handleGetComments(articleId, context) {
    const { env, jsonResponse, getArticleById } = context;
    const article = await getArticleById(articleId, env);
    if (!article) {
        return jsonResponse({ success: false, message: "文章不存在" }, 404);
    }

    const result = await env.DB
        .prepare(`
            SELECT
                c.id,
                c.article_id,
                c.parent_id,
                c.content,
                c.created_at,
                u.id AS author_id,
                u.username AS author_username,
                u.role AS author_role
            FROM comments AS c
            JOIN users AS u ON u.id = c.user_id
            WHERE c.article_id = ?
            ORDER BY c.created_at ASC, c.id ASC
        `)
        .bind(articleId)
        .all();

    const rows = (result.results || []).map(mapCommentRow);
    const topLevelComments = [];
    const commentsById = new Map();

    rows.forEach((comment) => {
        if (comment.parent_id === null) {
            comment.replies = [];
            topLevelComments.push(comment);
            commentsById.set(comment.id, comment);
        }
    });
    rows.forEach((comment) => {
        if (comment.parent_id === null) return;
        const parent = commentsById.get(comment.parent_id);
        if (parent) parent.replies.push(comment);
    });

    return jsonResponse({ success: true, comments: topLevelComments });
}

async function handleCreateComment(request, articleId, context) {
    const {
        env,
        jsonResponse,
        getBearerToken,
        getAuthenticatedUser,
        getArticleById
    } = context;
    const sessionToken = getBearerToken(request);
    if (!sessionToken) {
        return jsonResponse({ success: false, message: "请先登录" }, 401);
    }

    const currentUser = await getAuthenticatedUser(sessionToken, env);
    if (!currentUser) {
        return jsonResponse({ success: false, message: "登录已失效" }, 401);
    }

    const article = await getArticleById(articleId, env);
    if (!article) {
        return jsonResponse({ success: false, message: "文章不存在" }, 404);
    }

    let body;
    try {
        body = await request.json();
    }
    catch {
        return jsonResponse({ success: false, message: "请求数据格式错误" }, 400);
    }

    const content = typeof body?.content === "string"
        ? body.content.trim()
        : "";

    if (!content) {
        return jsonResponse({ success: false, message: "评论内容不能为空" }, 400);
    }

    if (content.length > MAX_COMMENT_LENGTH) {
        return jsonResponse(
            {
                success: false,
                message: `评论内容不能超过 ${MAX_COMMENT_LENGTH} 个字符`
            },
            400
        );
    }

    let parentId = null;
    if (body?.parent_id !== undefined && body.parent_id !== null) {
        const requestedParentId = Number(body.parent_id);
        if (!Number.isInteger(requestedParentId) || requestedParentId <= 0) {
            return jsonResponse({ success: false, message: "回复的评论无效" }, 400);
        }

        const parentComment = await getCommentById(requestedParentId, env);
        if (!parentComment || Number(parentComment.article_id) !== Number(articleId)) {
            return jsonResponse({ success: false, message: "回复的评论不属于当前文章" }, 400);
        }
        parentId = parentComment.parent_id || parentComment.id;
    }

    const result = await env.DB
        .prepare(`
            INSERT INTO comments (
                article_id,
                user_id,
                content,
                parent_id
            )
            VALUES (?, ?, ?, ?)
        `)
        .bind(articleId, currentUser.id, content, parentId)
        .run();

    const comment = await getCommentById(result.meta?.last_row_id, env);

    return jsonResponse(
        {
            success: true,
            message: "评论发表成功",
            comment
        },
        201
    );
}

async function handleDeleteComment(request, commentId, context) {
    const { env, jsonResponse, requireAdmin } = context;
    const authResult = await requireAdmin(request, env);
    if (!authResult.success) {
        return authResult.response;
    }

    const comment = await getCommentById(commentId, env);
    if (!comment) {
        return jsonResponse({ success: false, message: "评论不存在" }, 404);
    }

    if (comment.parent_id === null) {
        await env.DB.batch([
            env.DB.prepare("DELETE FROM comments WHERE parent_id = ?").bind(commentId),
            env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(commentId)
        ]);
    }
    else {
        await env.DB
            .prepare("DELETE FROM comments WHERE id = ?")
            .bind(commentId)
            .run();
    }

    return jsonResponse({ success: true, message: "评论删除成功" });
}

async function getCommentById(commentId, env) {
    if (commentId === undefined || commentId === null) return null;

    const row = await env.DB
        .prepare(`
            SELECT
                c.id,
                c.article_id,
                c.parent_id,
                c.content,
                c.created_at,
                u.id AS author_id,
                u.username AS author_username,
                u.role AS author_role
            FROM comments AS c
            JOIN users AS u ON u.id = c.user_id
            WHERE c.id = ?
            LIMIT 1
        `)
        .bind(commentId)
        .first();

    return row ? mapCommentRow(row) : null;
}

function mapCommentRow(row) {
    return {
        id: row.id,
        article_id: row.article_id,
        parent_id: row.parent_id,
        content: row.content,
        created_at: row.created_at,
        author: {
            id: row.author_id,
            username: row.author_username,
            role: row.author_role
        }
    };
}

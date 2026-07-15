import { getContestsResponse } from "../lib/contests/index.mjs";

const ALLOWED_ORIGIN = "https://lilinzheng.bbroot.com";

const PBKDF2_ITERATIONS = 100000;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_ARTICLE_CATEGORIES = [
    "algorithm",
    "computer",
    "essay"
];

const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 500;
const MAX_COMMENT_LENGTH = 2000;
const MAX_CHAT_MESSAGE_LENGTH = 1000;
const CHAT_WS_TICKET_LIFETIME_MS = 60 * 1000;


/* =========================================================
   Cloudflare Pages Functions 入口

   文件位置：
   functions/api/[[path]].js

   D1 绑定变量名：
   DB
   ========================================================= */

export async function onRequest(context) {
    const request = context.request;
    const env = context.env;

    // 处理浏览器跨域预检请求
    if (request.method === "OPTIONS") {
        return addCorsHeaders(
            new Response(null, { status: 204 }),
            request
        );
    }

    const url = new URL(request.url);

    // 匹配：
    // /api/articles/1
    // /api/articles/2
    // /api/articles/123
    const articleMatch =
        url.pathname.match(/^\/api\/articles\/(\d+)$/);

    const articleCommentsMatch =
        url.pathname.match(/^\/api\/articles\/(\d+)\/comments$/);

    const commentMatch =
        url.pathname.match(/^\/api\/comments\/(\d+)$/);

    try {
        let response;

        /* ==============================================
           登录
           POST /api/login
           ============================================== */
        if (
            url.pathname === "/api/login" &&
            request.method === "POST"
        ) {
            response = await handleLogin(request, env);
        }

        /* ==============================================
           获取当前用户
           GET /api/me
           ============================================== */
        else if (
            url.pathname === "/api/me" &&
            request.method === "GET"
        ) {
            response = await handleMe(request, env);
        }

        /* ==============================================
           退出登录
           POST /api/logout
           ============================================== */
        else if (
            url.pathname === "/api/logout" &&
            request.method === "POST"
        ) {
            response = await handleLogout(request, env);
        }

        else if (
            url.pathname === "/api/chat/messages" &&
            request.method === "GET"
        ) {
            response = await handleGetChatMessages(env);
        }

        else if (
            url.pathname === "/api/chat/messages" &&
            request.method === "POST"
        ) {
            response = await handleSendChatMessage(request, env);
        }

        else if (
            url.pathname === "/api/chat/ws-ticket" &&
            request.method === "POST"
        ) {
            response = await handleCreateChatWebSocketTicket(request, env);
        }

        else if (
            url.pathname === "/api/contests" &&
            request.method === "GET"
        ) {
            response = await getContestsResponse(request, {
                waitUntil: context.waitUntil
                    ? context.waitUntil.bind(context)
                    : null
            });
        }

        /* ==============================================
           获取文章列表
           GET /api/articles
           ============================================== */
        else if (
            url.pathname === "/api/articles" &&
            request.method === "GET"
        ) {
            response = await handleGetArticles(request, env);
        }

        /* ==============================================
           发布文章（仅管理员）
           POST /api/articles
           ============================================== */
        else if (
            url.pathname === "/api/articles" &&
            request.method === "POST"
        ) {
            response = await handleCreateArticle(request, env);
        }

        else if (
            articleCommentsMatch &&
            request.method === "GET"
        ) {
            response = await handleGetComments(
                articleCommentsMatch[1],
                env
            );
        }

        else if (
            articleCommentsMatch &&
            request.method === "POST"
        ) {
            response = await handleCreateComment(
                request,
                articleCommentsMatch[1],
                env
            );
        }

        else if (
            commentMatch &&
            request.method === "DELETE"
        ) {
            response = await handleDeleteComment(
                request,
                commentMatch[1],
                env
            );
        }

        /* ==============================================
           获取单篇文章
           GET /api/articles/:id
           ============================================== */
        else if (
            articleMatch &&
            request.method === "GET"
        ) {
            response = await handleGetArticleById(
                articleMatch[1],
                env
            );
        }

        /* ==============================================
           修改文章（仅管理员）
           PUT /api/articles/:id
           ============================================== */
        else if (
            articleMatch &&
            request.method === "PUT"
        ) {
            response = await handleUpdateArticle(
                request,
                articleMatch[1],
                env
            );
        }

        /* ==============================================
           删除文章（仅管理员）
           DELETE /api/articles/:id
           ============================================== */
        else if (
            articleMatch &&
            request.method === "DELETE"
        ) {
            response = await handleDeleteArticle(
                request,
                articleMatch[1],
                env
            );
        }

        /* ==============================================
           接口存在，但是方法不正确
           ============================================== */
        else if (
            url.pathname === "/api/login" ||
            url.pathname === "/api/me" ||
            url.pathname === "/api/logout" ||
            url.pathname === "/api/chat/messages" ||
            url.pathname === "/api/chat/ws-ticket" ||
            url.pathname === "/api/contests" ||
            url.pathname === "/api/articles" ||
            articleMatch ||
            articleCommentsMatch ||
            commentMatch
        ) {
            response = jsonResponse(
                {
                    success: false,
                    message: "Method Not Allowed"
                },
                405
            );
        }

        /* ==============================================
           找不到接口
           ============================================== */
        else {
            response = jsonResponse(
                {
                    success: false,
                    message: "Not Found"
                },
                404
            );
        }

        return addCorsHeaders(response, request);
    }
    catch (error) {
        console.error("Pages Function error:", error);

        const response = jsonResponse(
            {
                success: false,
                message: "服务器内部错误"
            },
            500
        );

        return addCorsHeaders(response, request);
    }
}


/* =========================================================
   登录
   POST /api/login
   ========================================================= */

async function handleLogin(request, env) {
    let body;

    try {
        body = await request.json();
    }
    catch {
        return jsonResponse(
            {
                success: false,
                message: "请求数据格式错误"
            },
            400
        );
    }

    const username =
        typeof body.username === "string"
            ? body.username.trim()
            : "";

    const password =
        typeof body.password === "string"
            ? body.password
            : "";

    if (!username) {
        return jsonResponse(
            {
                success: false,
                message: "用户名不能为空"
            },
            400
        );
    }

    if (!password) {
        return jsonResponse(
            {
                success: false,
                message: "密码不能为空"
            },
            400
        );
    }

    const user = await env.DB
        .prepare(`
            SELECT
                id,
                username,
                password_hash,
                password_salt,
                role
            FROM users
            WHERE username = ?
            LIMIT 1
        `)
        .bind(username)
        .first();

    // 不区分“用户不存在”和“密码错误”，避免泄露账号信息
    if (!user) {
        return jsonResponse(
            {
                success: false,
                message: "用户名或密码错误"
            },
            401
        );
    }

    const saltBytes = hexToBytes(user.password_salt);
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const hashBuffer = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            hash: "SHA-256",
            salt: saltBytes,
            iterations: PBKDF2_ITERATIONS
        },
        keyMaterial,
        256
    );

    const calculatedHash = new Uint8Array(hashBuffer);
    const storedHash = hexToBytes(user.password_hash);

    const passwordCorrect = constantTimeEqual(
        calculatedHash,
        storedHash
    );

    if (!passwordCorrect) {
        return jsonResponse(
            {
                success: false,
                message: "用户名或密码错误"
            },
            401
        );
    }

    /* =============================================
       密码正确，创建 Session
       ============================================= */

    const sessionToken = crypto.randomUUID();

    // 数据库只保存 Session Token 的 SHA-256，不保存原始 Token
    const tokenHash = await sha256Hex(sessionToken);

    const expiresAt = new Date(
        Date.now() + SESSION_LIFETIME_MS
    ).toISOString();

    // 清理已经过期的 Session
    await env.DB
        .prepare(`
            DELETE FROM sessions
            WHERE expires_at <= ?
        `)
        .bind(new Date().toISOString())
        .run();

    // 创建新的 Session
    await env.DB
        .prepare(`
            INSERT INTO sessions (
                user_id,
                token_hash,
                expires_at
            )
            VALUES (?, ?, ?)
        `)
        .bind(
            user.id,
            tokenHash,
            expiresAt
        )
        .run();

    return jsonResponse({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        },
        sessionToken,
        expiresAt
    });
}


/* =========================================================
   获取当前用户
   GET /api/me

   Authorization: Bearer <sessionToken>
   ========================================================= */

async function handleMe(request, env) {
    const sessionToken = getBearerToken(request);

    if (!sessionToken) {
        return jsonResponse(
            {
                success: false,
                message: "未登录"
            },
            401
        );
    }

    const currentUser = await getAuthenticatedUser(
        sessionToken,
        env
    );

    if (!currentUser) {
        return jsonResponse(
            {
                success: false,
                message: "登录已失效"
            },
            401
        );
    }

    return jsonResponse({
        success: true,
        user: {
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role
        },
        expiresAt: currentUser.expires_at
    });
}


/* =========================================================
   退出登录
   POST /api/logout

   Authorization: Bearer <sessionToken>
   ========================================================= */

async function handleLogout(request, env) {
    const sessionToken = getBearerToken(request);

    if (!sessionToken) {
        return jsonResponse(
            {
                success: false,
                message: "未登录"
            },
            401
        );
    }

    const tokenHash = await sha256Hex(sessionToken);

    await env.DB
        .prepare(`
            DELETE FROM sessions
            WHERE token_hash = ?
        `)
        .bind(tokenHash)
        .run();

    return jsonResponse({
        success: true,
        message: "退出登录成功"
    });
}


/* =========================================================
   获取文章列表
   GET /api/articles

   支持：

   /api/articles

   /api/articles?category=algorithm

   /api/articles?category=computer

   /api/articles?category=essay
   ========================================================= */

async function handleGetArticles(request, env) {
    const url = new URL(request.url);

    const category =
        url.searchParams.get("category");

    let query = `
        SELECT
            a.id,
            a.title,
            a.summary,
            a.category,
            a.created_at,
            a.updated_at,
            u.username AS author
        FROM articles AS a

        JOIN users AS u
            ON u.id = a.author_id
    `;

    let statement;

    if (category) {
        if (
            !ALLOWED_ARTICLE_CATEGORIES.includes(
                category
            )
        ) {
            return jsonResponse(
                {
                    success: false,
                    message: "无效的文章分类"
                },
                400
            );
        }

        query += `
            WHERE a.category = ?
            ORDER BY a.created_at DESC
        `;

        statement = env.DB
            .prepare(query)
            .bind(category);
    }
    else {
        query += `
            ORDER BY a.created_at DESC
        `;

        statement = env.DB.prepare(query);
    }

    const result = await statement.all();

    return jsonResponse({
        success: true,
        articles: result.results || []
    });
}


/* =========================================================
   获取单篇文章
   GET /api/articles/:id

   示例：

   GET /api/articles/1
   ========================================================= */

async function handleGetArticleById(
    articleId,
    env
) {
    const article = await getArticleById(
        articleId,
        env
    );

    if (!article) {
        return jsonResponse(
            {
                success: false,
                message: "文章不存在"
            },
            404
        );
    }

    return jsonResponse({
        success: true,
        article: article
    });
}


/* =========================================================
   发布文章
   POST /api/articles

   仅管理员可以使用
   ========================================================= */

async function handleCreateArticle(
    request,
    env
) {
    /*
        第一步：
        验证当前用户是不是管理员
    */

    const authResult = await requireAdmin(
        request,
        env
    );

    if (!authResult.success) {
        return authResult.response;
    }


    /*
        第二步：
        读取 JSON 请求体
    */

    let body;

    try {
        body = await request.json();
    }
    catch {
        return jsonResponse(
            {
                success: false,
                message: "请求数据格式错误"
            },
            400
        );
    }


    /*
        第三步：
        验证文章数据
    */

    const validation =
        validateArticleInput(body);

    if (!validation.success) {
        return validation.response;
    }


    const {
        title,
        summary,
        content,
        category
    } = validation.article;


    /*
        第四步：
        插入 D1 数据库

        author_id 不接受前端传入，
        直接使用当前已登录管理员的 ID。
    */

    const result = await env.DB
        .prepare(`
            INSERT INTO articles (
                title,
                summary,
                content,
                category,
                author_id
            )
            VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
            title,
            summary,
            content,
            category,
            authResult.user.id
        )
        .run();


    /*
        获取新文章 ID
    */

    const newArticleId =
        result.meta?.last_row_id;


    /*
        极少数情况下，如果已经插入成功，
        但没有取得 last_row_id，
        仍然返回发布成功。
    */

    if (
        newArticleId === undefined ||
        newArticleId === null
    ) {
        console.error(
            "文章插入成功，但没有获取到 last_row_id"
        );

        return jsonResponse(
            {
                success: true,
                message: "文章发布成功"
            },
            201
        );
    }


    /*
        再次从数据库读取完整文章
    */

    const article = await getArticleById(
        newArticleId,
        env
    );


    return jsonResponse(
        {
            success: true,
            message: "文章发布成功",
            article: article
        },
        201
    );
}


/* =========================================================
   修改文章
   PUT /api/articles/:id

   示例：

   PUT /api/articles/1

   仅管理员可以使用
   ========================================================= */

async function handleUpdateArticle(
    request,
    articleId,
    env
) {
    /*
        第一步：
        验证管理员权限
    */

    const authResult = await requireAdmin(
        request,
        env
    );

    if (!authResult.success) {
        return authResult.response;
    }


    /*
        第二步：
        检查文章是否存在
    */

    const existingArticle =
        await getArticleById(
            articleId,
            env
        );


    if (!existingArticle) {
        return jsonResponse(
            {
                success: false,
                message: "文章不存在"
            },
            404
        );
    }


    /*
        第三步：
        读取 JSON
    */

    let body;

    try {
        body = await request.json();
    }
    catch {
        return jsonResponse(
            {
                success: false,
                message: "请求数据格式错误"
            },
            400
        );
    }


    /*
        第四步：
        验证文章内容
    */

    const validation =
        validateArticleInput(body);


    if (!validation.success) {
        return validation.response;
    }


    const {
        title,
        summary,
        content,
        category
    } = validation.article;


    /*
        更新时间
    */

    const updatedAt =
        new Date().toISOString();


    /*
        第五步：
        更新数据库
    */

    await env.DB
        .prepare(`
            UPDATE articles
            SET
                title = ?,
                summary = ?,
                content = ?,
                category = ?,
                updated_at = ?
            WHERE id = ?
        `)
        .bind(
            title,
            summary,
            content,
            category,
            updatedAt,
            articleId
        )
        .run();


    /*
        重新读取更新后的文章
    */

    const updatedArticle =
        await getArticleById(
            articleId,
            env
        );


    return jsonResponse({
        success: true,
        message: "文章修改成功",
        article: updatedArticle
    });
}


/* =========================================================
   删除文章
   DELETE /api/articles/:id

   示例：

   DELETE /api/articles/1

   仅管理员可以使用
   ========================================================= */

async function handleDeleteArticle(
    request,
    articleId,
    env
) {
    /*
        第一步：
        验证管理员权限
    */

    const authResult = await requireAdmin(
        request,
        env
    );


    if (!authResult.success) {
        return authResult.response;
    }


    /*
        第二步：
        检查文章是否存在
    */

    const existingArticle =
        await getArticleById(
            articleId,
            env
        );


    if (!existingArticle) {
        return jsonResponse(
            {
                success: false,
                message: "文章不存在"
            },
            404
        );
    }


    /*
        第三步：
        删除文章
    */

    await env.DB
        .prepare(`
            DELETE FROM articles
            WHERE id = ?
        `)
        .bind(articleId)
        .run();


    return jsonResponse({
        success: true,
        message: "文章删除成功"
    });
}


/* =========================================================
   内部读取单篇文章函数

   给这些功能复用：
   GET 单篇文章
   POST 创建文章后读取
   PUT 修改文章后读取
   DELETE 删除前检查文章
   ========================================================= */

async function getArticleById(
    articleId,
    env
) {
    return await env.DB
        .prepare(`
            SELECT
                a.id,
                a.title,
                a.summary,
                a.content,
                a.category,
                a.created_at,
                a.updated_at,
                u.username AS author
            FROM articles AS a

            JOIN users AS u
                ON u.id = a.author_id

            WHERE a.id = ?

            LIMIT 1
        `)
        .bind(articleId)
        .first();
}


/* =========================================================
   管理员权限验证

   检查流程：

   1. 是否存在 Bearer Token
   2. Session 是否有效
   3. 当前用户 role 是否为 admin
   ========================================================= */

async function handleCreateChatWebSocketTicket(request, env) {
    const authorization = request.headers.get("Authorization") || "";
    let user;

    if (authorization) {
        const sessionToken = getBearerToken(request);
        if (!sessionToken) {
            return jsonResponse({ success: false, message: "登录状态无效" }, 401);
        }
        const currentUser = await getAuthenticatedUser(sessionToken, env);
        if (!currentUser) {
            return jsonResponse({ success: false, message: "登录已失效" }, 401);
        }
        user = {
            id: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
            isGuest: false
        };
    }
    else {
        user = {
            id: null,
            username: "游客",
            role: "guest",
            isGuest: true
        };
    }

    const ticket = crypto.randomUUID();
    const expiresAt = Date.now() + CHAT_WS_TICKET_LIFETIME_MS;
    const roomId = env.CHAT_ROOM.idFromName("public-lobby");
    const room = env.CHAT_ROOM.get(roomId);
    const ticketResponse = await room.fetch(
        "https://internal/create-ticket",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket, expiresAt, user })
        }
    );

    if (!ticketResponse.ok) {
        return jsonResponse({ success: false, message: "无法建立聊天室连接" }, 503);
    }
    return jsonResponse({ success: true, ticket });
}

async function handleGetChatMessages(env) {
    const result = await env.DB
        .prepare(`
            SELECT
                m.id,
                m.content,
                m.created_at,
                u.username,
                u.role
            FROM chat_messages AS m
            JOIN users AS u ON u.id = m.user_id
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 50
        `)
        .all();

    const messages = (result.results || []).reverse().map((row) => ({
        id: row.id,
        content: row.content,
        created_at: row.created_at,
        username: row.username,
        role: row.role
    }));

    return jsonResponse({ success: true, messages });
}

async function handleSendChatMessage(request, env) {
    const sessionToken = getBearerToken(request);
    if (!sessionToken) {
        return jsonResponse({ success: false, message: "请先登录" }, 401);
    }

    const currentUser = await getAuthenticatedUser(sessionToken, env);
    if (!currentUser) {
        return jsonResponse({ success: false, message: "登录已失效" }, 401);
    }

    let body;
    try {
        body = await request.json();
    }
    catch {
        return jsonResponse({ success: false, message: "请求数据格式错误" }, 400);
    }

    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
        return jsonResponse({ success: false, message: "消息内容不能为空" }, 400);
    }
    if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
        return jsonResponse(
            { success: false, message: `消息内容不能超过 ${MAX_CHAT_MESSAGE_LENGTH} 个字符` },
            400
        );
    }

    const result = await env.DB
        .prepare(`
            INSERT INTO chat_messages (user_id, content)
            VALUES (?, ?)
        `)
        .bind(currentUser.id, content)
        .run();

    const newMessage = await getChatMessageById(result.meta?.last_row_id, env);

    try {
        const roomId = env.CHAT_ROOM.idFromName("public-lobby");
        const room = env.CHAT_ROOM.get(roomId);
        await room.fetch(
            "https://internal/broadcast",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: newMessage
                })
            }
        );
    }
    catch (error) {
        console.error("Chat realtime broadcast failed:", error);
    }

    return jsonResponse({ success: true, message: newMessage }, 201);
}

async function getChatMessageById(messageId, env) {
    const row = await env.DB
        .prepare(`
            SELECT
                m.id,
                m.content,
                m.created_at,
                u.username,
                u.role
            FROM chat_messages AS m
            JOIN users AS u ON u.id = m.user_id
            WHERE m.id = ?
            LIMIT 1
        `)
        .bind(messageId)
        .first();

    if (!row) return null;
    return {
        id: row.id,
        content: row.content,
        created_at: row.created_at,
        username: row.username,
        role: row.role
    };
}

async function handleGetComments(articleId, env) {
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

    const rows = (result.results || []).map((row) => ({
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
    }));

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

async function handleCreateComment(request, articleId, env) {
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

    const content =
        typeof body?.content === "string"
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

async function handleDeleteComment(request, commentId, env) {
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

    if (!row) return null;

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


async function requireAdmin(
    request,
    env
) {
    /*
        第一步：
        获取 Session Token
    */

    const sessionToken =
        getBearerToken(request);


    if (!sessionToken) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message: "请先登录"
                },
                401
            )
        };
    }


    /*
        第二步：
        根据 Session 获取当前用户
    */

    const user =
        await getAuthenticatedUser(
            sessionToken,
            env
        );


    if (!user) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message: "登录已失效"
                },
                401
            )
        };
    }


    /*
        第三步：
        检查管理员权限
    */

    if (user.role !== "admin") {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message: "无管理员权限"
                },
                403
            )
        };
    }


    /*
        验证成功
    */

    return {
        success: true,
        user: user
    };
}


/* =========================================================
   验证文章输入

   用于：
   POST /api/articles
   PUT /api/articles/:id
   ========================================================= */

function validateArticleInput(body) {

    /*
        标题
    */

    const title =
        typeof body?.title === "string"
            ? body.title.trim()
            : "";


    /*
        摘要允许为空
    */

    const summary =
        typeof body?.summary === "string"
            ? body.summary.trim()
            : "";


    /*
        正文保留原始换行，
        不进行 trim 后重新赋值。

        只使用 trim() 判断是不是空正文。
    */

    const content =
        typeof body?.content === "string"
            ? body.content
            : "";


    /*
        分类
    */

    const category =
        typeof body?.category === "string"
            ? body.category.trim()
            : "";


    /* =============================================
       验证标题
       ============================================= */

    if (!title) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message: "文章标题不能为空"
                },
                400
            )
        };
    }


    if (
        title.length >
        MAX_TITLE_LENGTH
    ) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message:
                        `文章标题不能超过 ${MAX_TITLE_LENGTH} 个字符`
                },
                400
            )
        };
    }


    /* =============================================
       验证摘要
       ============================================= */

    if (
        summary.length >
        MAX_SUMMARY_LENGTH
    ) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message:
                        `文章摘要不能超过 ${MAX_SUMMARY_LENGTH} 个字符`
                },
                400
            )
        };
    }


    /* =============================================
       验证正文
       ============================================= */

    if (!content.trim()) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message: "文章正文不能为空"
                },
                400
            )
        };
    }


    /* =============================================
       验证分类
       ============================================= */

    if (
        !ALLOWED_ARTICLE_CATEGORIES.includes(
            category
        )
    ) {
        return {
            success: false,

            response: jsonResponse(
                {
                    success: false,
                    message: "无效的文章分类"
                },
                400
            )
        };
    }


    /*
        验证成功
    */

    return {
        success: true,

        article: {
            title: title,
            summary: summary,
            content: content,
            category: category
        }
    };
}


/* =========================================================
   根据 Session Token 获取当前用户

   返回：

   {
       id,
       username,
       role,
       expires_at
   }

   如果 Token 无效或者过期：
   返回 null
   ========================================================= */

async function getAuthenticatedUser(
    sessionToken,
    env
) {
    /*
        原始 Session Token
        转换成 SHA-256
    */

    const tokenHash =
        await sha256Hex(sessionToken);


    /*
        当前时间
    */

    const now =
        new Date().toISOString();


    /*
        查询 Session + User
    */

    const user = await env.DB
        .prepare(`
            SELECT
                u.id,
                u.username,
                u.role,
                s.expires_at
            FROM sessions AS s

            JOIN users AS u
                ON u.id = s.user_id

            WHERE
                s.token_hash = ?
                AND s.expires_at > ?

            LIMIT 1
        `)
        .bind(
            tokenHash,
            now
        )
        .first();


    return user || null;
}


/* =========================================================
   工具函数
   ========================================================= */


/* ---------------------------------------------------------
   获取 Authorization Bearer Token

   请求头示例：

   Authorization: Bearer xxxxx
   --------------------------------------------------------- */

function getBearerToken(request) {
    const authorization =
        request.headers.get(
            "Authorization"
        ) || "";


    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {
        return null;
    }


    const token =
        authorization
            .slice(7)
            .trim();


    return token || null;
}


/* ---------------------------------------------------------
   字符串
   →
   SHA-256 十六进制字符串
   --------------------------------------------------------- */

async function sha256Hex(value) {
    const bytes =
        new TextEncoder().encode(value);


    const hashBuffer =
        await crypto.subtle.digest(
            "SHA-256",
            bytes
        );


    return Array.from(
        new Uint8Array(hashBuffer)
    )
        .map(byte =>
            byte
                .toString(16)
                .padStart(2, "0")
        )
        .join("");
}


/* ---------------------------------------------------------
   十六进制字符串
   →
   Uint8Array
   --------------------------------------------------------- */

function hexToBytes(hex) {
    /*
        基础格式检查
    */

    if (
        typeof hex !== "string" ||
        hex.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(hex)
    ) {
        throw new Error(
            "Invalid hex string"
        );
    }


    const bytes =
        new Uint8Array(
            hex.length / 2
        );


    for (
        let i = 0;
        i < bytes.length;
        i++
    ) {
        bytes[i] =
            parseInt(
                hex.slice(
                    i * 2,
                    i * 2 + 2
                ),
                16
            );
    }


    return bytes;
}


/* ---------------------------------------------------------
   尽量避免普通比较中的明显提前退出

   用于比较密码哈希
   --------------------------------------------------------- */

function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }


    let difference = 0;


    for (
        let i = 0;
        i < a.length;
        i++
    ) {
        difference |=
            a[i] ^ b[i];
    }


    return difference === 0;
}


/* ---------------------------------------------------------
   创建 JSON Response
   --------------------------------------------------------- */

function jsonResponse(
    data,
    status = 200
) {
    return new Response(
        JSON.stringify(data),
        {
            status: status,

            headers: {
                "Content-Type":
                    "application/json; charset=utf-8"
            }
        }
    );
}


/* ---------------------------------------------------------
   添加 CORS 响应头
   --------------------------------------------------------- */

function addCorsHeaders(
    response,
    request
) {
    const headers =
        new Headers(
            response.headers
        );


    const origin =
        request.headers.get(
            "Origin"
        );


    /*
        只允许你的博客域名
        进行浏览器跨域访问
    */

    if (
        origin === ALLOWED_ORIGIN
    ) {
        headers.set(
            "Access-Control-Allow-Origin",
            ALLOWED_ORIGIN
        );
    }


    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );


    headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );


    headers.set(
        "Vary",
        "Origin"
    );


    return new Response(
        response.body,
        {
            status: response.status,
            statusText:
                response.statusText,
            headers: headers
        }
    );
}

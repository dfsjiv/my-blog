const MAX_CHAT_MESSAGE_LENGTH = 1000;
const CHAT_WS_TICKET_LIFETIME_MS = 60 * 1000;

export function isChatPath(pathname) {
    return pathname === "/api/chat/messages"
        || pathname === "/api/chat/ws-ticket";
}

export async function handleChatRequest(context) {
    const {
        request,
        env,
        url,
        jsonResponse,
        getBearerToken,
        getAuthenticatedUser
    } = context;

    if (url.pathname === "/api/chat/messages" && request.method === "GET") {
        return handleGetChatMessages(env, jsonResponse);
    }

    if (url.pathname === "/api/chat/messages" && request.method === "POST") {
        return handleSendChatMessage({
            request,
            env,
            jsonResponse,
            getBearerToken,
            getAuthenticatedUser
        });
    }

    if (url.pathname === "/api/chat/ws-ticket" && request.method === "POST") {
        return handleCreateChatWebSocketTicket({
            request,
            env,
            jsonResponse,
            getBearerToken,
            getAuthenticatedUser
        });
    }

    return jsonResponse({ success: false, message: "Method Not Allowed" }, 405);
}

async function handleCreateChatWebSocketTicket(context) {
    const {
        request,
        env,
        jsonResponse,
        getBearerToken,
        getAuthenticatedUser
    } = context;
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

async function handleGetChatMessages(env, jsonResponse) {
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

async function handleSendChatMessage(context) {
    const {
        request,
        env,
        jsonResponse,
        getBearerToken,
        getAuthenticatedUser
    } = context;
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

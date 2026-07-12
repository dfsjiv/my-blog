import {
    DurableObject
} from "cloudflare:workers";


/* =========================================================
   ChatRoom Durable Object

   当前职责：

   1. 接受浏览器 WebSocket 连接
   2. 保存当前公共大厅中的 WebSocket 连接
   3. 接受来自 Pages Function 的可信广播请求
   4. 将真实聊天消息广播给所有在线客户端

   重要：

   浏览器不能直接通过 WebSocket 广播聊天消息。

   正式聊天消息必须经过：

   POST /api/chat/messages
       ↓
   Session 验证
       ↓
   D1 写入成功
       ↓
   Pages Function
       ↓
   Durable Object
       ↓
   广播

   ========================================================= */

export class ChatRoom extends DurableObject {

    constructor(ctx, env) {
        super(ctx, env);

        this.ctx = ctx;
        this.env = env;
    }


    /* =====================================================
       处理请求

       支持：

       1. WebSocket Upgrade
          → 建立实时连接

       2. POST /broadcast
          → 接受 Pages Function 发来的可信消息
          → 广播给全部在线连接
       ===================================================== */

    async fetch(request) {
        const url =
            new URL(request.url);


        const upgradeHeader =
            request.headers.get(
                "Upgrade"
            );


        /* =================================================
           WebSocket 连接
           ================================================= */

        if (
            upgradeHeader &&
            upgradeHeader.toLowerCase() === "websocket"
        ) {
            return this.handleWebSocketConnection(
                request
            );
        }


        /* =================================================
           内部广播接口

           POST /broadcast

           这个请求由 Pages Function
           通过 CHAT_ROOM binding 发起。

           浏览器不直接调用这个接口。
           ================================================= */

        if (
            url.pathname === "/broadcast" &&
            request.method === "POST"
        ) {
            return this.handleBroadcast(
                request
            );
        }

        if (
            url.pathname === "/create-ticket" &&
            request.method === "POST"
        ) {
            return this.handleCreateTicket(request);
        }


        return new Response(
            "Not Found",
            {
                status: 404
            }
        );
    }


    /* =====================================================
       建立 WebSocket 连接
       ===================================================== */

    async handleWebSocketConnection(
        request
    ) {
        const url = new URL(request.url);
        const ticket = url.searchParams.get("ticket");
        if (!ticket) {
            return new Response("Missing WebSocket ticket", { status: 401 });
        }

        const ticketData = await this.ctx.storage.transaction(async (transaction) => {
            const key = `ticket:${ticket}`;
            const stored = await transaction.get(key);
            if (!stored || !Number.isFinite(stored.expiresAt) || stored.expiresAt <= Date.now()) {
                if (stored) await transaction.delete(key);
                return null;
            }
            await transaction.delete(key);
            return stored;
        });

        if (!ticketData || !ticketData.user) {
            return new Response("Invalid or expired WebSocket ticket", { status: 401 });
        }

        const webSocketPair =
            new WebSocketPair();


        const [
            client,
            server
        ] = Object.values(
            webSocketPair
        );


        /*
           使用 WebSocket Hibernation API。

           server 留在 Durable Object。

           client 返回给浏览器。
        */

        server.serializeAttachment({
            userId: ticketData.user.id,
            username: ticketData.user.username,
            role: ticketData.user.role,
            isGuest: ticketData.user.isGuest === true,
            guestId: ticketData.user.isGuest ? ticket : null
        });

        this.ctx.acceptWebSocket(server);
        await this.broadcastPresence();


        return new Response(
            null,
            {
                status: 101,
                webSocket: client
            }
        );
    }


    /* =====================================================
       接受可信聊天消息并广播

       请求体：

       {
           "message": {
               "id": 1,
               "content": "你好",
               "created_at": "...",
               "username": "...",
               "role": "user"
           }
       }
       ===================================================== */

    async handleCreateTicket(request) {
        let body;
        try {
            body = await request.json();
        }
        catch {
            return jsonResponse({ success: false, message: "请求数据格式错误" }, 400);
        }

        if (
            typeof body?.ticket !== "string" ||
            !body.ticket ||
            !Number.isFinite(body.expiresAt) ||
            body.expiresAt <= Date.now() ||
            !body.user ||
            typeof body.user.username !== "string" ||
            !body.user.username
        ) {
            return jsonResponse({ success: false, message: "Ticket 数据无效" }, 400);
        }

        await this.ctx.storage.put(
            `ticket:${body.ticket}`,
            {
                expiresAt: body.expiresAt,
                user: {
                    id: body.user.isGuest ? null : body.user.id,
                    username: body.user.username,
                    role: body.user.isGuest ? "guest" : body.user.role,
                    isGuest: body.user.isGuest === true
                }
            }
        );
        const currentAlarm = await this.ctx.storage.getAlarm();
        if (currentAlarm === null || body.expiresAt < currentAlarm) {
            await this.ctx.storage.setAlarm(body.expiresAt);
        }
        return jsonResponse({ success: true });
    }

    async alarm() {
        const now = Date.now();
        const tickets = await this.ctx.storage.list({ prefix: "ticket:" });
        const expiredKeys = [];
        let nextExpiry = null;

        for (const [key, ticketData] of tickets) {
            if (!ticketData || ticketData.expiresAt <= now) {
                expiredKeys.push(key);
            }
            else if (nextExpiry === null || ticketData.expiresAt < nextExpiry) {
                nextExpiry = ticketData.expiresAt;
            }
        }
        if (expiredKeys.length) await this.ctx.storage.delete(expiredKeys);
        if (nextExpiry !== null) await this.ctx.storage.setAlarm(nextExpiry);
    }

    buildPresence() {
        const usersById = new Map();
        let guestCount = 0;

        for (const socket of this.ctx.getWebSockets()) {
            const user = socket.deserializeAttachment();
            if (!user || typeof user !== "object") continue;
            if (user.isGuest) {
                guestCount += 1;
            }
            else if (user.userId !== undefined && user.userId !== null) {
                usersById.set(String(user.userId), {
                    id: user.userId,
                    username: user.username,
                    role: user.role,
                    isGuest: false
                });
            }
        }

        const users = Array.from(usersById.values());
        return {
            type: "presence_update",
            onlineCount: users.length + guestCount,
            users,
            guestCount
        };
    }

    async broadcastPresence() {
        const payload = JSON.stringify(this.buildPresence());
        for (const socket of this.ctx.getWebSockets()) {
            try {
                socket.send(payload);
            }
            catch (error) {
                console.error("Presence broadcast failed:", error);
            }
        }
    }

    async handleBroadcast(
        request
    ) {
        let body;


        try {
            body =
                await request.json();
        }
        catch {
            return jsonResponse(
                {
                    success: false,
                    message:
                        "请求数据格式错误"
                },
                400
            );
        }


        const message =
            body?.message;


        /* =================================================
           基础验证

           注意：

           这里不接受单独的 username、
           role 或 user_id 参数。

           必须是 Pages Function
           已经从数据库读取出来的完整消息对象。
           ================================================= */

        if (
            !message ||
            typeof message !== "object"
        ) {
            return jsonResponse(
                {
                    success: false,
                    message:
                        "缺少聊天消息"
                },
                400
            );
        }


        if (
            message.id === undefined ||
            message.id === null
        ) {
            return jsonResponse(
                {
                    success: false,
                    message:
                        "聊天消息缺少 id"
                },
                400
            );
        }


        if (
            typeof message.content !== "string" ||
            !message.content
        ) {
            return jsonResponse(
                {
                    success: false,
                    message:
                        "聊天消息内容无效"
                },
                400
            );
        }


        if (
            typeof message.username !== "string" ||
            !message.username
        ) {
            return jsonResponse(
                {
                    success: false,
                    message:
                        "聊天消息缺少用户名"
                },
                400
            );
        }


        /* =================================================
           构造 WebSocket 广播数据
           ================================================= */

        const payload =
            JSON.stringify({
                type: "chat_message",

                message: {
                    id:
                        message.id,

                    content:
                        message.content,

                    created_at:
                        message.created_at,

                    username:
                        message.username,

                    role:
                        message.role
                }
            });


        /* =================================================
           获取公共大厅全部 WebSocket
           ================================================= */

        const sockets =
            this.ctx.getWebSockets();


        let deliveredCount = 0;


        /* =================================================
           广播
           ================================================= */

        for (
            const socket
            of sockets
        ) {
            try {
                socket.send(
                    payload
                );

                deliveredCount++;
            }
            catch (error) {
                console.error(
                    "WebSocket broadcast failed:",
                    error
                );
            }
        }


        return jsonResponse({
            success: true,

            delivered:
                deliveredCount
        });
    }


    /* =====================================================
       浏览器通过 WebSocket 主动发送消息时触发

       当前正式架构中：

       WebSocket 只负责接收实时广播。

       用户发送聊天消息必须走：

       POST /api/chat/messages

       所以这里不再接受：

       {
           type: "chat_message"
       }

       防止用户绕过 Session 和 D1，
       自己伪造身份、角色或消息。
       ===================================================== */

    async webSocketMessage(
        socket,
        message
    ) {
        /*
           可以保留 ping / pong，
           方便以后检测连接状态。
        */

        if (
            typeof message !== "string"
        ) {
            return;
        }


        let data;


        try {
            data =
                JSON.parse(message);
        }
        catch {
            return;
        }


        if (
            data?.type === "ping"
        ) {
            socket.send(
                JSON.stringify({
                    type: "pong"
                })
            );
        }


        /*
           其他客户端主动消息全部忽略。

           特别是：

           type: "chat_message"

           不允许直接广播。
        */
    }


    /* =====================================================
       WebSocket 关闭
       ===================================================== */

    async webSocketClose(
        socket,
        code,
        reason,
        wasClean
    ) {
        await this.broadcastPresence();
        /*
           当前暂时不处理。

           后续做在线人数和在线用户时，
           再在这里扩展。
        */
    }


    /* =====================================================
       WebSocket 错误
       ===================================================== */

    async webSocketError(
        socket,
        error
    ) {
        console.error(
            "WebSocket error:",
            error
        );
        try {
            socket.close(1011, "WebSocket error");
        }
        catch {
            // The socket may already be closed.
        }
        await this.broadcastPresence();
    }
}


/* =========================================================
   JSON Response
   ========================================================= */

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

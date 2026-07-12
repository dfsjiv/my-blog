import {
    DurableObject
} from "cloudflare:workers";


/* =========================================================
   ChatRoom Durable Object

   当前第一版只负责：

   1. 接受 WebSocket 连接
   2. 接收客户端消息
   3. 广播给当前公共大厅中的所有在线连接

   暂时不做：

   - 身份验证
   - D1 写入
   - 在线人数
   - 在线用户列表
   - 私聊
   - 多房间
   ========================================================= */

export class ChatRoom extends DurableObject {

    constructor(ctx, env) {
        super(ctx, env);

        this.ctx = ctx;
        this.env = env;
    }


    /* =====================================================
       接受 WebSocket 连接
       ===================================================== */

    async fetch(request) {
        const upgradeHeader =
            request.headers.get("Upgrade");


        if (
            !upgradeHeader ||
            upgradeHeader.toLowerCase() !== "websocket"
        ) {
            return new Response(
                "Expected WebSocket",
                {
                    status: 426
                }
            );
        }


        /*
           创建 WebSocketPair：

           client
           → 返回给浏览器

           server
           → 留在 Durable Object 中
        */

        const webSocketPair =
            new WebSocketPair();


        const [
            client,
            server
        ] = Object.values(
            webSocketPair
        );


        /*
           使用 Durable Object WebSocket Hibernation API。

           即使 Durable Object 空闲休眠，
           WebSocket 连接也可以继续保持。
        */

        this.ctx.acceptWebSocket(
            server
        );


        return new Response(
            null,
            {
                status: 101,
                webSocket: client
            }
        );
    }


    /* =====================================================
       收到 WebSocket 消息
       ===================================================== */

    async webSocketMessage(
        socket,
        message
    ) {
        /*
           第一版只处理字符串消息。
        */

        if (
            typeof message !== "string"
        ) {
            return;
        }


        let data;


        try {
            data = JSON.parse(
                message
            );
        }
        catch {
            socket.send(
                JSON.stringify({
                    type: "error",
                    message: "消息格式错误"
                })
            );

            return;
        }


        /*
           当前只处理：

           {
               "type": "chat_message",
               "message": {...}
           }
        */

        if (
            data?.type !== "chat_message"
        ) {
            return;
        }


        /*
           获取当前 Durable Object 中
           所有在线 WebSocket 连接。
        */

        const sockets =
            this.ctx.getWebSockets();


        const payload =
            JSON.stringify({
                type: "chat_message",
                message: data.message
            });


        /*
           广播给所有连接。
        */

        for (
            const currentSocket
            of sockets
        ) {
            try {
                currentSocket.send(
                    payload
                );
            }
            catch {
                /*
                   单个连接失败时，
                   不影响其他用户。
                */
            }
        }
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
        /*
           当前第一版不需要额外处理。

           后面做在线人数和在线用户时，
           会在这里加入离线逻辑。
        */
    }


    /* =====================================================
       WebSocket 出错
       ===================================================== */

    async webSocketError(
        socket,
        error
    ) {
        console.error(
            "WebSocket error:",
            error
        );
    }
}
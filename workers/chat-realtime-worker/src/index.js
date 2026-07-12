import {
    ChatRoom
} from "./chat-room.js";


/*
    重新导出 Durable Object 类。

    Cloudflare 部署时需要找到：
    ChatRoom
*/

export {
    ChatRoom
};


/* =========================================================
   实时聊天室 Worker 入口

   当前功能：

   GET /
   → 健康检查

   GET /ws
   → WebSocket 连接入口

   当前所有用户进入同一个公共大厅：

   public-lobby
   ========================================================= */

export default {

    async fetch(
        request,
        env,
        ctx
    ) {
        const url =
            new URL(request.url);


        /* =================================================
           健康检查

           浏览器访问 Worker 根目录时，
           返回一句文字，证明 Worker 正常运行。
           ================================================= */

        if (
            url.pathname === "/"
        ) {
            return new Response(
                "chat-realtime-worker is running",
                {
                    status: 200
                }
            );
        }


        /* =================================================
           WebSocket 入口

           路径：
           /ws
           ================================================= */

        if (
            url.pathname === "/ws"
        ) {
            const upgradeHeader =
                request.headers.get(
                    "Upgrade"
                );


            /*
                只有真正的 WebSocket 升级请求
                才允许进入。
            */

            if (
                !upgradeHeader ||
                upgradeHeader.toLowerCase()
                    !== "websocket"
            ) {
                return new Response(
                    "Expected WebSocket",
                    {
                        status: 426
                    }
                );
            }


            /*
                获取公共大厅对应的 Durable Object。

                所有用户都使用同一个名字：

                public-lobby

                所以大家会进入同一个聊天室。
            */

            const room =
                env.CHAT_ROOM.getByName(
                    "public-lobby"
                );


            /*
                把 WebSocket 请求交给
                ChatRoom Durable Object 处理。
            */

            return room.fetch(
                request
            );
        }


        /* =================================================
           其他路径
           ================================================= */

        return new Response(
            "Not Found",
            {
                status: 404
            }
        );
    }
};
/* =========================================================
   Pages Functions WebSocket 入口

   URL：

   wss://lilinzheng.bbroot.com/ws

   流程：

   浏览器
       ↓
   /ws
       ↓
   Pages Function
       ↓
   CHAT_ROOM Durable Object Binding
       ↓
   ChatRoom
       ↓
   public-lobby 公共大厅
   ========================================================= */


export async function onRequest(context) {
    const request = context.request;
    const env = context.env;
    const url = new URL(request.url);


    /* =====================================================
       1. 检查是不是 WebSocket 升级请求
       ===================================================== */

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


    /* =====================================================
       2. 检查 Durable Object Binding 是否存在
       ===================================================== */

    if (!env.CHAT_ROOM) {
        return new Response(
            "CHAT_ROOM binding is not available",
            {
                status: 500
            }
        );
    }

    const ticket = url.searchParams.get("ticket");
    if (!ticket) {
        return new Response("Missing WebSocket ticket", { status: 401 });
    }


    /* =====================================================
       3. 获取固定公共大厅

       所有用户都进入：

       public-lobby

       因此大家最终连接到同一个 Durable Object。
       ===================================================== */

    const roomId =
        env.CHAT_ROOM.idFromName(
            "public-lobby"
        );


    const room =
        env.CHAT_ROOM.get(
            roomId
        );


    /* =====================================================
       4. 将 WebSocket 请求交给 ChatRoom
       ===================================================== */

    return room.fetch(
        request
    );
}

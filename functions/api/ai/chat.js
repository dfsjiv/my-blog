const MAX_AI_MESSAGE_LENGTH = 2000;

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

    if (!env.AI_API_KEY || !env.AI_API_URL || !env.AI_MODEL) {
        console.error("AI service configuration is incomplete");
        return jsonResponse({ success: false, message: "AI 请求失败" }, 503);
    }

    let body;
    try {
        body = await request.json();
    }
    catch {
        return jsonResponse({ success: false, message: "请求数据格式错误" }, 400);
    }

    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
        return jsonResponse({ success: false, message: "消息不能为空" }, 400);
    }
    if (message.length > MAX_AI_MESSAGE_LENGTH) {
        return jsonResponse(
            { success: false, message: `消息不能超过 ${MAX_AI_MESSAGE_LENGTH} 个字符` },
            400
        );
    }

    try {
        const aiResponse = await fetch(env.AI_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${env.AI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: env.AI_MODEL,
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ]
            })
        });

        let aiData;
        try {
            aiData = await aiResponse.json();
        }
        catch {
            console.error("AI API returned a non-JSON response", aiResponse.status);
            return jsonResponse({ success: false, message: "AI 请求失败" }, 502);
        }

        if (!aiResponse.ok) {
            console.error("AI API request failed with status", aiResponse.status);
            return jsonResponse({ success: false, message: "AI 请求失败" }, 502);
        }

        const reply = aiData?.choices?.[0]?.message?.content;
        if (typeof reply !== "string" || !reply.trim()) {
            console.error("AI API returned an invalid reply format");
            return jsonResponse({ success: false, message: "AI 请求失败" }, 502);
        }

        return jsonResponse({ success: true, reply: reply.trim() });
    }
    catch (error) {
        console.error("AI API network request failed:", error?.message || "unknown error");
        return jsonResponse({ success: false, message: "AI 请求失败" }, 502);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

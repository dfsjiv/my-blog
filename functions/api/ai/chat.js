const MAX_AI_MESSAGE_LENGTH = 2000;
const GEMINI_CHAT_COMPLETIONS_URL =
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEEPSEEK_CHAT_COMPLETIONS_URL =
    "https://api.deepseek.com/chat/completions";

export async function onRequestPost(context) {
    const request = context.request;
    const env = context.env;

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

    const geminiAvailable = Boolean(env.GEMINI_API_KEY && env.GEMINI_MODEL);
    const deepSeekAvailable = Boolean(env.DEEPSEEK_API_KEY && env.DEEPSEEK_MODEL);

    if (geminiAvailable) {
        try {
            const reply = await callGemini(message, env);
            return jsonResponse({ success: true, reply });
        }
        catch (error) {
            console.error("Gemini request failed:", safeErrorMessage(error));
        }
    }
    else {
        console.error("Gemini configuration missing");
    }

    if (deepSeekAvailable) {
        try {
            const reply = await callDeepSeek(message, env);
            return jsonResponse({ success: true, reply });
        }
        catch (error) {
            console.error("DeepSeek request failed:", safeErrorMessage(error));
        }
    }
    else {
        console.error("DeepSeek configuration missing");
    }

    console.error("No AI provider is available");
    return jsonResponse(
        { success: false, message: "AI 暂时无法回复，请稍后重试" },
        502
    );
}

async function callGemini(message, env) {
    if (!env.GEMINI_API_KEY) throw new Error("API key is not configured");
    if (!env.GEMINI_MODEL) throw new Error("model is not configured");
    return callChatCompletions(
        GEMINI_CHAT_COMPLETIONS_URL,
        env.GEMINI_API_KEY,
        env.GEMINI_MODEL,
        message
    );
}

async function callDeepSeek(message, env) {
    if (!env.DEEPSEEK_API_KEY) throw new Error("API key is not configured");
    if (!env.DEEPSEEK_MODEL) throw new Error("model is not configured");
    return callChatCompletions(
        DEEPSEEK_CHAT_COMPLETIONS_URL,
        env.DEEPSEEK_API_KEY,
        env.DEEPSEEK_MODEL,
        message
    );
}

async function callChatCompletions(url, apiKey, model, message) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: "user",
                    content: message
                }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new Error("response is not valid JSON");
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
        throw new Error("response reply format is invalid");
    }
    return reply.trim();
}

function safeErrorMessage(error) {
    return error && typeof error.message === "string"
        ? error.message
        : "unknown error";
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

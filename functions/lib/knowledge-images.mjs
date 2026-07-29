const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = {
    "image/jpeg": { extension: "jpg", signatures: [[0xff, 0xd8, 0xff]] },
    "image/png": { extension: "png", signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
    "image/gif": {
        extension: "gif",
        signatures: [
            [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
            [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
        ]
    },
    "image/webp": { extension: "webp", signatures: [] }
};

export async function uploadKnowledgeImage(context, user) {
    const { request, env, url, jsonResponse } = context;
    if (!env.KNOWLEDGE_IMAGES) {
        console.error("Knowledge image storage binding is missing");
        return failure(jsonResponse, 503, "STORAGE_UNAVAILABLE", "图片存储服务尚未配置");
    }

    let formData;
    try {
        formData = await request.formData();
    } catch (error) {
        return failure(jsonResponse, 400, "INVALID_IMAGE", "请选择有效的图片文件");
    }

    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
        return failure(jsonResponse, 400, "INVALID_IMAGE", "请选择要上传的图片");
    }
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        return failure(jsonResponse, 400, "INVALID_IMAGE", "图片大小必须在 8 MB 以内");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageType = detectImageType(bytes);
    if (!imageType) {
        return failure(
            jsonResponse,
            400,
            "INVALID_IMAGE",
            "仅支持 JPEG、PNG、WebP 或 GIF 图片"
        );
    }

    const now = new Date();
    const key = [
        "knowledge",
        String(now.getUTCFullYear()),
        String(now.getUTCMonth() + 1).padStart(2, "0"),
        `${crypto.randomUUID()}.${imageType.extension}`
    ].join("/");

    await env.KNOWLEDGE_IMAGES.put(key, bytes, {
        httpMetadata: { contentType: imageType.mimeType },
        customMetadata: {
            uploadedBy: String(user.id),
            originalName: safeMetadataValue(file.name)
        }
    });

    return jsonResponse({
        success: true,
        data: {
            image: {
                key,
                url: `${url.origin}/api/knowledge/images/${encodeKey(key)}`,
                size: bytes.byteLength,
                mimeType: imageType.mimeType
            }
        }
    }, 201);
}

export async function getKnowledgeImage(context, rawKey) {
    const { env, jsonResponse } = context;
    if (!env.KNOWLEDGE_IMAGES) {
        return failure(jsonResponse, 503, "STORAGE_UNAVAILABLE", "图片存储服务尚未配置");
    }

    let key;
    try {
        key = decodeURIComponent(rawKey);
    } catch (error) {
        return failure(jsonResponse, 400, "INVALID_IMAGE_KEY", "图片地址无效");
    }
    if (!isSafeImageKey(key)) {
        return failure(jsonResponse, 400, "INVALID_IMAGE_KEY", "图片地址无效");
    }

    const object = await env.KNOWLEDGE_IMAGES.get(key);
    if (!object) {
        return failure(jsonResponse, 404, "NOT_FOUND", "图片不存在");
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
}

function detectImageType(bytes) {
    for (const [mimeType, type] of Object.entries(IMAGE_TYPES)) {
        if (mimeType === "image/webp") {
            if (
                matches(bytes, 0, [0x52, 0x49, 0x46, 0x46])
                && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])
            ) {
                return { mimeType, extension: type.extension };
            }
            continue;
        }
        if (type.signatures.some((signature) => matches(bytes, 0, signature))) {
            return { mimeType, extension: type.extension };
        }
    }
    return null;
}

function matches(bytes, offset, signature) {
    return signature.every((value, index) => bytes[offset + index] === value);
}

function encodeKey(key) {
    return key.split("/").map(encodeURIComponent).join("/");
}

function isSafeImageKey(key) {
    return /^knowledge\/\d{4}\/\d{2}\/[0-9a-f-]+\.(?:jpg|png|webp|gif)$/i.test(key);
}

function safeMetadataValue(value) {
    return String(value || "image").replace(/[^\x20-\x7e]/g, "_").slice(0, 200);
}

function failure(jsonResponse, status, code, message) {
    return jsonResponse({
        success: false,
        error: { code, message }
    }, status);
}

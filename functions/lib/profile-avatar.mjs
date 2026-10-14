import { detectImageType } from './knowledge-images.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const fail = (c, status, message) => c.jsonResponse({ success: false, error: { message } }, status);

// One replaceable object per account; no schema migration or accumulating uploads.
export async function handleAvatarRequest(c) {
    const { request, env, url } = c;
    const publicMatch = url.pathname.match(/^\/api\/profile\/avatar\/([1-9]\d{0,14})$/);
    if (publicMatch && request.method === 'GET') {
        if (!env.KNOWLEDGE_IMAGES) return fail(c, 503, '图片存储服务尚未配置');
        const object = await env.KNOWLEDGE_IMAGES.get('avatars/' + publicMatch[1]);
        if (!object) {
            const response = fail(c, 404, '尚未设置头像');
            response.headers.set('Cache-Control', 'no-store');
            return response;
        }
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
        headers.set('ETag', object.httpEtag);
        headers.set('X-Content-Type-Options', 'nosniff');
        if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers });
        return new Response(object.body, { headers });
    }
    if (url.pathname !== '/api/profile/avatar' || !['POST', 'DELETE'].includes(request.method)) return fail(c, 404, '接口不存在');
    const token = c.getBearerToken(request);
    const user = token ? await c.getAuthenticatedUser(token, env) : null;
    if (!user || !['user', 'admin'].includes(user.role)) return fail(c, 401, '请先登录');
    if (!Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) return fail(c, 401, '账户无效');
    if (!env.KNOWLEDGE_IMAGES) return fail(c, 503, '图片存储服务尚未配置');
    const key = 'avatars/' + Number(user.id);
    if (request.method === 'DELETE') {
        await env.KNOWLEDGE_IMAGES.delete(key);
        const response = c.jsonResponse({ success: true });
        response.headers.set('Cache-Control', 'no-store');
        return response;
    }
    if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return fail(c, 413, '头像不能超过 2 MB');
    // Stream-limit before buffering, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return fail(c, 400, '请选择头像图片');
    let size = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return fail(c, 413, '头像不能超过 2 MB'); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const type = detectImageType(bytes);
    if (!type) return fail(c, 400, '仅支持 JPEG、PNG、WebP 或 GIF 图片');
    await env.KNOWLEDGE_IMAGES.put(key, bytes, {
        httpMetadata: { contentType: type.mimeType },
        customMetadata: { uploadedBy: String(user.id) }
    });
    const response = c.jsonResponse({ success: true, data: { url: '/api/profile/avatar/' + Number(user.id) + '?v=' + crypto.randomUUID() } });
    response.headers.set('Cache-Control', 'no-store');
    return response;
}

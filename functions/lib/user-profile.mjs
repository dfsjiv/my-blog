const MAX_NICKNAME = 40;
export function validateNickname(value) {
    if (typeof value !== 'string') throw new Error('昵称必须是文字');
    const nickname = value.trim();
    if ([...nickname].length > MAX_NICKNAME) throw new Error('昵称最多 40 个字符');
    // Preserve emoji/ZWJ and international scripts, but not invisible bidi tricks or controls.
    if (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(nickname)) throw new Error('昵称不能包含换行、控制字符或方向控制符');
    return nickname;
}

export async function handleProfileRequest(c) {
    const { request, env, url } = c;
    const fail = (status, message) => c.jsonResponse({ success: false, error: { message } }, status);
    if (url.pathname === '/api/profile/public' && request.method === 'GET') {
        const ids = [...new Set((url.searchParams.get('ids') || '').split(','))];
        if (ids.length > 50 || ids.some(id => !/^[1-9]\d{0,14}$/.test(id))) return fail(400, '用户编号无效');
        const profiles = await Promise.all(ids.map(async id => {
            try {
                const object = env.KNOWLEDGE_IMAGES ? await env.KNOWLEDGE_IMAGES.get('profiles/' + id) : null;
                const saved = object ? JSON.parse(await object.text()) : {};
                return { id: Number(id), nickname: validateNickname(saved.nickname || '') };
            } catch { return { id: Number(id), nickname: '' }; }
        }));
        const response = c.jsonResponse({ success: true, data: { profiles } });
        response.headers.set('Cache-Control', 'no-store');
        return response;
    }
    if (url.pathname !== '/api/profile' || request.method !== 'PATCH') return fail(404, '接口不存在');
    const token = c.getBearerToken(request);
    const user = token ? await c.getAuthenticatedUser(token, env) : null;
    if (!user || !['user', 'admin'].includes(user.role)) return fail(401, '请先登录');
    if (!Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) return fail(401, '账户无效');
    if (!env.KNOWLEDGE_IMAGES) return fail(503, '图片存储服务尚未配置');
    if (Number(request.headers.get('Content-Length')) > 4096) return fail(413, '请求内容过大');
    const reader = request.body?.getReader();
    if (!reader) return fail(400, '请求内容无效');
    const chunks = []; let size = 0;
    while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return fail(413, '请求内容过大'); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let nickname;
    try { nickname = validateNickname(JSON.parse(new TextDecoder().decode(bytes)).nickname); }
    catch (error) { return fail(400, error.message || '昵称无效'); }
    await env.KNOWLEDGE_IMAGES.put('profiles/' + Number(user.id), JSON.stringify({ nickname }), {
        httpMetadata: { contentType: 'application/json' }
    });
    const response = c.jsonResponse({ success: true, data: { id: Number(user.id), nickname } });
    response.headers.set('Cache-Control', 'no-store');
    return response;
}

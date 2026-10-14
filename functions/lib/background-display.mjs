const validKey = key => /^(builtin-[1-4]|[1-9]\d{0,14})$/.test(String(key));
export function validateDisplay(value) {
    if (!value || typeof value !== 'object') throw new Error('背景设置无效');
    const result = {};
    for (const [name, min, max] of [['x', 0, 100], ['y', 0, 100], ['zoom', 1, 3]]) {
        if (typeof value[name] !== 'number' || !Number.isFinite(value[name]) || value[name] < min || value[name] > max) throw new Error('背景位置或缩放超出范围');
        result[name] = Math.round(value[name] * 100) / 100;
    }
    return result;
}
export async function handleBackgroundDisplay(c) {
    const { request, env, url } = c;
    const fail = (status, message) => c.jsonResponse({ success: false, error: { message } }, status);
    if (request.method === 'GET') {
        const ids = [...new Set((url.searchParams.get('ids') || '').split(','))];
        if (ids.length > 50 || ids.some(id => !validKey(id))) return fail(400, '背景编号无效');
        const settings = await Promise.all(ids.map(async key => {
            try {
                const object = env.KNOWLEDGE_IMAGES ? await env.KNOWLEDGE_IMAGES.get('background-display/' + key) : null;
                return { key, display: object ? validateDisplay(JSON.parse(await object.text())) : null };
            } catch { return { key, display: null }; }
        }));
        const response = c.jsonResponse({ success: true, data: { settings } }); response.headers.set('Cache-Control', 'no-store'); return response;
    }
    if (request.method !== 'PATCH') return fail(405, '方法不支持');
    const token = c.getBearerToken(request);
    const user = token ? await c.getAuthenticatedUser(token, env) : null;
    if (!user) return fail(401, '请先登录');
    if (user.role !== 'admin') return fail(403, '仅管理员可以调整首页背景');
    if (!env.KNOWLEDGE_IMAGES) return fail(503, '图片存储服务尚未配置');
    const reader = request.body?.getReader(); if (!reader) return fail(400, '请求无效');
    const chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return fail(413, '请求内容过大'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let key, display;
    try { const body = JSON.parse(new TextDecoder().decode(bytes)); key = String(body.key); if (!validKey(key)) throw new Error('背景编号无效'); display = validateDisplay(body.display); }
    catch (error) { return fail(400, error.message); }
    if (!key.startsWith('builtin-')) {
        const row = await env.DB.prepare('SELECT id FROM knowledge_backgrounds WHERE id = ?').bind(Number(key)).first();
        if (!row) return fail(404, '背景不存在');
    }
    await env.KNOWLEDGE_IMAGES.put('background-display/' + key, JSON.stringify(display), { httpMetadata: { contentType: 'application/json' } });
    const response = c.jsonResponse({ success: true, data: { key, display } }); response.headers.set('Cache-Control', 'no-store'); return response;
}

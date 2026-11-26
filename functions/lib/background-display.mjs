const validKey = key => /^(builtin-[1-4]|[1-9]\d{0,14})$/.test(String(key));
const states = new Set(['active', 'paused', 'removed']);
export function validateDisplay(value) {
    if (!value || typeof value !== 'object') throw new Error('背景设置无效');
    const result = {};
    for (const [name, min, max] of [['x', 0, 100], ['y', 0, 100], ['zoom', 1, 3]]) {
        if (typeof value[name] !== 'number' || !Number.isFinite(value[name]) || value[name] < min || value[name] > max) throw new Error('背景位置或缩放超出范围');
        result[name] = Math.round(value[name] * 100) / 100;
    }
    return result;
}
async function readSetting(storage, key) {
    const object = storage ? await storage.get('background-display/' + key) : null;
    const value = object ? JSON.parse(await object.text()) : {};
    const status = storage && key.startsWith('builtin-') ? await storage.get('background-state/' + key) : null;
    const state = status ? JSON.parse(await status.text()).state : 'active';
    if (!states.has(state)) throw new Error('背景状态无效');
    return { key, display: ['x','y','zoom'].some(name => Object.hasOwn(value,name)) ? validateDisplay(value) : null, state };
}
export async function handleBackgroundDisplay(c) {
    const { request, env, url } = c;
    const fail = (status, message) => c.jsonResponse({ success: false, error: { message } }, status);
    if (request.method === 'GET') {
        const ids = [...new Set((url.searchParams.get('ids') || '').split(','))];
        if (ids.length > 50 || ids.some(id => !validKey(id))) return fail(400, '背景编号无效');
        try {
            const settings = await Promise.all(ids.map(key => readSetting(env.KNOWLEDGE_IMAGES,key)));
            const response = c.jsonResponse({ success: true, data: { settings } }); response.headers.set('Cache-Control', 'no-store'); return response;
        } catch { return fail(503, '背景设置暂时无法读取，请重试'); }
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
    let key, display, state, hasDisplay, hasState;
    try {
        const body = JSON.parse(new TextDecoder().decode(bytes)); key = String(body.key);
        if (!validKey(key)) throw new Error('背景编号无效');
        hasDisplay = Object.hasOwn(body,'display'); hasState = Object.hasOwn(body,'state');
        if (!hasDisplay && !hasState) throw new Error('请选择背景调整或状态');
        if (hasDisplay) display = validateDisplay(body.display);
        if (hasState) { if (!key.startsWith('builtin-') || !states.has(body.state)) throw new Error('背景状态无效'); state = body.state; }
    } catch (error) { return fail(400, error.message); }
    if (!key.startsWith('builtin-')) {
        const row = await env.DB.prepare('SELECT id FROM knowledge_backgrounds WHERE id = ?').bind(Number(key)).first();
        if (!row) return fail(404, '背景不存在');
    }
    try {
        // Availability is independent of crop data, so saving a crop from another
        // tab cannot accidentally reactivate a background that was removed.
        const options={ httpMetadata: { contentType: 'application/json' } };
        if(hasDisplay)await env.KNOWLEDGE_IMAGES.put('background-display/' + key, JSON.stringify(display), options);
        if(hasState)await env.KNOWLEDGE_IMAGES.put('background-state/' + key, JSON.stringify({state}), options);
        const setting = await readSetting(env.KNOWLEDGE_IMAGES,key);
        const response = c.jsonResponse({ success: true, data: setting }); response.headers.set('Cache-Control', 'no-store'); return response;
    } catch { return fail(503, '背景设置保存失败，请重试'); }
}

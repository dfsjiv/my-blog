import { tableExists } from './legacy-knowledge-adapter.mjs';

const ROOT = '/api/knowledge/pages';
const ADMIN = '/api/knowledge/admin/pages';
const encoder = new TextEncoder();
export const PAGE_LIMITS = Object.freeze({ user: { pages: 8, bytes: 256 * 1024 }, admin: { pages: 30, bytes: 1024 * 1024 } });
export function isCustomPagePath(path) { return path === ROOT || path.startsWith(ROOT + '/') || path === ADMIN || path.startsWith(ADMIN + '/'); }

export function validatePage(input, limits = PAGE_LIMITS.user) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('页面配置无效');
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const slug = typeof input.slug === 'string' ? input.slug.trim() : '';
    if (!title || Array.from(title).length > 100) throw new Error('页面名称需要 1–100 个字符');
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug) || ['home', 'admin', 'new'].includes(slug)) throw new Error('访问标识需为 1–64 位小写字母、数字或连字符，不能使用 home、admin、new');
    for (const name of ['html', 'css', 'markdown']) if (input[name] !== undefined && typeof input[name] !== 'string') throw new Error('HTML、CSS 和 Markdown 必须是文本');
    if (!Array.isArray(input.postSlugs) || input.postSlugs.length > 12 || input.postSlugs.some(s => typeof s !== 'string' || !s || s.length > 200)) throw new Error('最多关联 12 篇文章');
    const result = { title, slug, html: input.html || '', css: input.css || '', markdown: input.markdown || '', postSlugs: [...new Set(input.postSlugs)] };
    if (!result.html.trim()) throw new Error('请填写页面 HTML');
    if (encoder.encode(JSON.stringify(result)).length > limits.bytes) throw new Error(`页面配置超过 ${limits.bytes / 1024} KB 上限`);
    return result;
}

async function readBody(request, maxBytes) {
    if (Number(request.headers.get('Content-Length')) > maxBytes) throw new Error('请求体过大');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('缺少页面配置');
    let size = 0, chunks = [];
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new Error('请求体过大'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('请求必须是有效 JSON'); }
}

function summary(row) {
    return { id: row.id, title: row.title, slug: row.slug, version: row.version, ownerUserId: row.owner_user_id,
        isPublished: Boolean(row.published_at), isHomepage: Boolean(row.is_homepage), deletedAt: row.deleted_at,
        createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at };
}
function publicPage(row) {
    if (!row) return null;
    return { ...JSON.parse(row.published_json), id: row.id, publishedAt: row.published_at,
        author: row.nickname || row.username || '', isHomepage: Boolean(row.is_homepage) };
}

export async function handleCustomPageRequest(context, requireAuthor) {
    const { env, request, url, jsonResponse } = context;
    const isAdmin = url.pathname === ADMIN || url.pathname.startsWith(ADMIN + '/');
    const reply = (data, status = 200) => {
        const response = jsonResponse({ success: true, data }, status);
        response.headers.set('Cache-Control', isAdmin ? 'private, no-store' : 'public, max-age=0, must-revalidate');
        return response;
    };
    const fail = (status, code, message) => {
        const response = jsonResponse({ success: false, error: { code, message } }, status);
        response.headers.set('Cache-Control', 'no-store'); return response;
    };
    let auth;
    if (isAdmin) { auth = await requireAuthor(context); if (auth.response) return auth.response; }
    if (!await tableExists(env, 'custom_pages')) {
        if (isAdmin) return fail(503, 'MIGRATION_REQUIRED', '自定义页面数据表尚未部署');
        return reply(url.pathname === ROOT ? { items: [] } : { page: null });
    }
    if (!isAdmin) {
        if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持');
        // Only published design snapshots are public; never return draft_json here.
        if (url.pathname === ROOT) {
            const rows = await env.DB.prepare(`SELECT json_extract(published_json, '$.title') AS title, slug, published_at FROM custom_pages
                WHERE published_json IS NOT NULL AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 60`).all();
            return reply({ items: rows.results.map(r => ({ title: r.title, slug: r.slug, publishedAt: r.published_at })) });
        }
        const slug = url.pathname.slice(ROOT.length + 1);
        let decoded; try { decoded = decodeURIComponent(slug); } catch { return fail(400, 'VALIDATION_ERROR', '访问标识无效'); }
        const row = await env.DB.prepare(`SELECT ${slug === 'home' ? "json_extract(p.published_json, '$.title') AS title, p.slug" : 'p.published_json'}, p.id, p.published_at, p.is_homepage, u.username
            FROM custom_pages p JOIN users u ON u.id=p.owner_user_id
            WHERE ${slug === 'home' ? 'p.is_homepage=1' : 'p.slug=?'} AND p.published_json IS NOT NULL AND p.deleted_at IS NULL LIMIT 1`)
            .bind(...(slug === 'home' ? [] : [decoded])).first();
        if (!row && slug !== 'home') return fail(404, 'NOT_FOUND', '页面不存在或尚未发布');
        return reply({ page: slug === 'home' ? row ? { slug: row.slug, title: row.title } : null : publicPage(row) });
    }
    const user = auth.user, limits = PAGE_LIMITS[user.role === 'admin' ? 'admin' : 'user'];
    const match = url.pathname.match(/^\/api\/knowledge\/admin\/pages\/(\d+)(?:\/(publish|unpublish|homepage|trash|restore))?$/);
    if (url.pathname === ADMIN && request.method === 'GET') {
        const rows = await env.DB.prepare(`SELECT id, owner_user_id, title, slug, version, is_homepage, published_at, created_at, updated_at, deleted_at
            FROM custom_pages WHERE owner_user_id=? ORDER BY updated_at DESC, id DESC LIMIT 60`).bind(user.id).all();
        return reply({ items: rows.results.map(summary), limits });
    }
    if (url.pathname !== ADMIN && !match) return fail(404, 'NOT_FOUND', '接口不存在');
    let existing;
    if (match) {
        existing = await env.DB.prepare('SELECT * FROM custom_pages WHERE id=? AND owner_user_id=?').bind(Number(match[1]), user.id).first();
        if (!existing) return fail(404, 'NOT_FOUND', '页面不存在或不属于当前账号');
        if (request.method === 'GET' && !match[2]) return reply({ page: { ...summary(existing), draft: JSON.parse(existing.draft_json) }, limits });
    }
    if (existing && request.method === 'POST' && match[2]) {
        const action = match[2];
        let input; try { input = await readBody(request, 1024); } catch (e) { return fail(400, 'VALIDATION_ERROR', e.message); }
        if (!Number.isInteger(input.version) || input.version !== existing.version) return fail(409, 'VERSION_CONFLICT', '页面已被其他窗口修改，请重新打开；当前内容可先导出');
        if (existing.deleted_at && action !== 'restore') return fail(400, 'VALIDATION_ERROR', '请先从回收站恢复此页面');
        const now = new Date().toISOString(); let result;
        if (action === 'homepage') {
            if (user.role !== 'admin') return fail(403, 'FORBIDDEN', '只有管理员可以设置全站首页');
            if (!existing.published_json) return fail(400, 'VALIDATION_ERROR', '请先发布页面');
            const results = await env.DB.batch([
                env.DB.prepare(`UPDATE custom_pages SET is_homepage=0 WHERE is_homepage=1 AND EXISTS
                    (SELECT 1 FROM custom_pages WHERE id=? AND owner_user_id=? AND version=? AND deleted_at IS NULL AND published_json IS NOT NULL)`)
                    .bind(existing.id, user.id, input.version),
                env.DB.prepare('UPDATE custom_pages SET is_homepage=1, version=version+1, updated_at=? WHERE id=? AND owner_user_id=? AND version=? AND deleted_at IS NULL AND published_json IS NOT NULL')
                    .bind(now, existing.id, user.id, input.version)
            ]); result = results[1];
        } else {
            const assignments = {
                publish: 'published_json=draft_json, published_at=?',
                unpublish: 'published_json=NULL, published_at=NULL, is_homepage=0',
                trash: 'deleted_at=?, published_json=NULL, published_at=NULL, is_homepage=0',
                restore: 'deleted_at=NULL'
            }[action];
            if (!assignments) return fail(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持');
            if (action === 'restore') {
                const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM custom_pages WHERE owner_user_id=? AND deleted_at IS NULL').bind(user.id).first();
                if (count.total >= limits.pages) return fail(400, 'LIMIT_REACHED', '已达到页面数量上限');
            }
            result = await env.DB.prepare(`UPDATE custom_pages SET ${assignments}, version=version+1, updated_at=? WHERE id=? AND owner_user_id=? AND version=?`)
                .bind(...(['publish', 'trash'].includes(action) ? [now] : []), now, existing.id, user.id, input.version).run();
        }
        if (!result.meta?.changes) return fail(409, 'VERSION_CONFLICT', '页面已被其他窗口修改，请重新打开');
        const row = await env.DB.prepare('SELECT * FROM custom_pages WHERE id=?').bind(existing.id).first();
        return reply({ page: { ...summary(row), draft: JSON.parse(row.draft_json) } });
    }
    if (!(url.pathname === ADMIN && request.method === 'POST' || existing && !match[2] && request.method === 'PATCH')) return fail(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持');
    if (existing?.deleted_at) return fail(400, 'VALIDATION_ERROR', '请先恢复页面');
    let input, draft;
    try { input = await readBody(request, limits.bytes + 4096); draft = validatePage(input, limits); } catch (e) { return fail(400, 'VALIDATION_ERROR', e.message); }
    const now = new Date().toISOString();
    if (existing) {
        if (input.version !== existing.version) return fail(409, 'VERSION_CONFLICT', '页面已被其他窗口修改，请重新打开；当前内容可先导出');
        if (draft.slug !== existing.slug) return fail(400, 'VALIDATION_ERROR', '保存后的访问标识不能更改，请新建页面');
    }
    try {
        let id = existing?.id;
        if (!existing) {
            // Atomic count guard also bounds concurrent creates. Include trash to bound retained data.
            const inserted = await env.DB.prepare(`INSERT INTO custom_pages (owner_user_id, slug, title, draft_json, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM custom_pages WHERE owner_user_id=?) < ?`)
                .bind(user.id, draft.slug, draft.title, JSON.stringify(draft), now, now, user.id, limits.pages).run();
            if (!inserted.meta?.changes) return fail(400, 'LIMIT_REACHED', `每个账号最多保存 ${limits.pages} 个页面（含回收站）`);
            id = inserted.meta.last_row_id;
        } else {
            const updated = await env.DB.prepare('UPDATE custom_pages SET title=?, draft_json=?, version=version+1, updated_at=? WHERE id=? AND owner_user_id=? AND version=? AND deleted_at IS NULL')
                .bind(draft.title, JSON.stringify(draft), now, id, user.id, input.version).run();
            if (!updated.meta?.changes) return fail(409, 'VERSION_CONFLICT', '页面已被其他窗口修改，请重新打开');
        }
        const row = await env.DB.prepare('SELECT * FROM custom_pages WHERE id=? AND owner_user_id=?').bind(id, user.id).first();
        return reply({ page: { ...summary(row), draft: JSON.parse(row.draft_json) } }, existing ? 200 : 201);
    } catch (error) {
        if (/UNIQUE constraint failed.*slug/i.test(String(error.message))) return fail(409, 'SLUG_CONFLICT', '此访问标识已被使用，请换一个');
        throw error;
    }
}

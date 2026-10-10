import { normalizeExternalHandle, normalizeOneTimeCookie, fetchExternalSnapshot, buildPlatformCookie, resolveExternalIdentity } from './external-providers.mjs';

const LIMIT = 12288;
async function readBody(request) {
    if (Number(request.headers.get('Content-Length')) > LIMIT) throw new Error('INVALID_REQUEST');
    const reader = request.body?.getReader(); if (!reader) throw new Error('INVALID_REQUEST');
    let text = '', bytes = 0;
    const decoder = new TextDecoder();
    try {
        while (true) {
            const part = await reader.read(); if (part.done) break;
            bytes += part.value.byteLength; if (bytes > LIMIT) throw new Error('INVALID_REQUEST');
            text += decoder.decode(part.value, { stream: true });
        }
        try { return JSON.parse(text + decoder.decode()); } catch { throw new Error('INVALID_REQUEST'); }
    } finally { text = ''; try { await reader.cancel(); } catch {} reader.releaseLock(); }
}

export async function handleExternalAccounts(c, user) {
    const { request, url } = c, db = c.env.DB;
    const fail = (status, code) => c.jsonResponse({ success: false, code }, status);
    let body, cookie = '', account, acquired = false;
    try {
        if (url.pathname === '/api/algorithm/external/dashboard' && request.method === 'GET') {
            const { results } = await db.prepare('SELECT * FROM algorithm_external_accounts WHERE user_id=? ORDER BY platform').bind(user.id).all();
            const accounts = (results || []).map(row => ({ id: row.id, platform: row.platform, handle: row.handle,
                lastSyncedAt: row.last_synced_at, previousSolved: row.previous_solved,
                snapshot: JSON.parse(row.snapshot_json) }));
            return c.jsonResponse({ success: true, data: { accounts } });
        }
        const remove = url.pathname.match(/^\/api\/algorithm\/external\/accounts\/(\d+)$/);
        const now = Math.floor((c.now?.() ?? Date.now()) / 1000);
        if (remove && request.method === 'DELETE') {
            const result = await db.prepare('DELETE FROM algorithm_external_accounts WHERE id=? AND user_id=? AND sync_lock_until<=?')
                .bind(remove[1], user.id, now).run();
            if (!result.meta?.changes) return fail(409, 'NOT_FOUND_OR_BUSY');
            return c.jsonResponse({ success: true });
        }
        if (url.pathname !== '/api/algorithm/external/sync' || request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
        body = await readBody(request);
        const platform = body?.platform;
        const providerOptions = platform === 'luogu' ? { luoguDomain: body.luoguDomain || 'www.luogu.com.cn' } : {};
        if (platform === 'luogu' && !['www.luogu.com.cn', 'www.luogu.com'].includes(providerOptions.luoguDomain)) throw new Error('INVALID_REQUEST');
        cookie = body?.credentials ? buildPlatformCookie(platform, body.credentials) : normalizeOneTimeCookie(body?.cookie);
        if (cookie && !body.credentials) cookie = buildPlatformCookie(platform, Object.fromEntries(cookie.split(';').map(part => {
            const at = part.indexOf('='); return [part.slice(0, at).trim(), part.slice(at + 1)];
        })));
        const handle = cookie ? await resolveExternalIdentity(platform, cookie, c.fetch || fetch) : normalizeExternalHandle(platform, body?.handle);
        body.cookie = ''; if (body.credentials) Object.keys(body.credentials).forEach(key => { body.credentials[key] = ''; }); body = null;
        account = await db.prepare('SELECT * FROM algorithm_external_accounts WHERE user_id=? AND platform=?').bind(user.id, platform).first();
        if (account && account.handle !== handle) return fail(409, 'ALREADY_BOUND');
        if (!account) {
            // Reserve an account/lease before making upstream requests (including the initial sync).
            await db.prepare('INSERT INTO algorithm_external_accounts (user_id, platform, handle) VALUES (?, ?, ?) ON CONFLICT(user_id,platform) DO NOTHING')
                .bind(user.id, platform, handle).run();
            account = await db.prepare('SELECT * FROM algorithm_external_accounts WHERE user_id=? AND platform=?').bind(user.id, platform).first();
            if (account.handle !== handle) return fail(409, 'ALREADY_BOUND');
        }
        const last = Date.parse(account.last_synced_at || '') / 1000;
        if (Number.isFinite(last) && now - last < 30) return fail(429, 'SYNC_COOLDOWN');
        const lock = await db.prepare('UPDATE algorithm_external_accounts SET sync_lock_until=? WHERE id=? AND user_id=? AND sync_lock_until<=?')
            .bind(now + 90, account.id, user.id, now).run();
        if (!lock.meta?.changes) return fail(409, 'SYNC_BUSY');
        acquired = true;
        const snapshot = await fetchExternalSnapshot(platform, handle, cookie, c.fetch || fetch, providerOptions);
        cookie = '';
        let previous; try { const old = JSON.parse(account.snapshot_json); previous = old.scope === snapshot.scope ? old.solved ?? null : null; } catch { previous = null; }
        await db.prepare('UPDATE algorithm_external_accounts SET snapshot_json=?, previous_solved=?, last_synced_at=?, sync_lock_until=0 WHERE id=? AND user_id=?')
            .bind(JSON.stringify(snapshot), previous, new Date(now * 1000).toISOString(), account.id, user.id).run();
        return c.jsonResponse({ success: true, data: { id: account.id } });
    } catch (error) {
        // Do not log exception strings: upstream fetch implementations may embed submitted credentials.
        if (/no such table/.test(error.message)) return fail(503, 'MIGRATION_REQUIRED');
        const codes = ['INVALID_REQUEST', 'INVALID_HANDLE', 'INVALID_COOKIE', 'COOKIE_EXPIRED', 'COOKIE_MISMATCH', 'PROFILE_NOT_FOUND'];
        const upstream = ['PROVIDER_ACCESS_BLOCKED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_FORMAT_CHANGED', 'PROVIDER_REDIRECT', 'PROVIDER_TIMEOUT'];
        return fail(codes.includes(error.message) ? 400 : 502, [...codes, ...upstream].includes(error.message) ? error.message : 'PROVIDER_UNAVAILABLE');
    } finally {
        cookie = ''; if (body && typeof body === 'object') { body.cookie = ''; if (body.credentials && typeof body.credentials === 'object') Object.keys(body.credentials).forEach(key => { body.credentials[key] = ''; }); } body = null;
        if (acquired) await db.prepare('UPDATE algorithm_external_accounts SET sync_lock_until=0 WHERE id=? AND user_id=?').bind(account.id, user.id).run();
    }
}

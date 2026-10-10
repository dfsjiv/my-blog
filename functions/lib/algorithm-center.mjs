import { analyzeSubmissions } from './algorithm/analytics.mjs';
import { aggregatePlatforms } from './algorithm/aggregate.mjs';
import { handleExternalAccounts } from './algorithm/external-accounts.mjs';
import { normalizeHandle, verifyProfile, fetchSubmissionPage, fetchProfileDetails,
    fetchAtCoderModels, atCoderDifficulty } from './algorithm/providers.mjs';

const MAX_RECORDS = 20000; // Per account; never let one sync create an unbounded DB write.
const SYNC_COOLDOWN = 30;
const fail = (c, status, code) => c.jsonResponse({ success: false, code }, status);

export async function handleAlgorithmRequest(context) {
    // Personal training data must never be stored in a browser/CDN shared cache.
    const c = { ...context, jsonResponse(data, status) {
        const response = context.jsonResponse(data, status);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    } }, { request, url, env } = c;
    const token = c.getBearerToken(request);
    const user = token ? await c.getAuthenticatedUser(token, env) : null;
    if (!user || user.role === 'guest') return fail(c, 401, 'UNAUTHORIZED');
    const db = env.DB, fetchImpl = c.fetch || fetch;
    const accountMatch = url.pathname.match(/^\/api\/algorithm\/accounts\/(\d+)(\/sync)?$/);
    try {
        if (url.pathname.startsWith('/api/algorithm/external/')) return await handleExternalAccounts(c, user);
        if (url.pathname === '/api/algorithm/dashboard' && request.method === 'GET') {
            const { results: accounts } = await db.prepare('SELECT * FROM algorithm_accounts WHERE user_id = ? ORDER BY platform').bind(user.id).all();
            const { results: rows } = await db.prepare(`SELECT s.*, a.platform FROM algorithm_submissions s
                JOIN algorithm_accounts a ON a.id=s.account_id WHERE a.user_id=?`).bind(user.id).all();
            const data = analyzeSubmissions(rows || [], accounts || [], c.now?.() ?? Date.now());
            let external = [];
            try { external = (await db.prepare('SELECT * FROM algorithm_external_accounts WHERE user_id=? ORDER BY platform').bind(user.id).all()).results || []; }
            catch (error) { if (!/no such table/.test(error.message)) throw error; }
            data.aggregate = aggregatePlatforms(data, external);
            return c.jsonResponse({ success: true, data });
        }
        if (url.pathname === '/api/algorithm/accounts' && request.method === 'POST') {
            if (Number(request.headers.get('Content-Length')) > 2048) return fail(c, 413, 'INVALID_REQUEST');
            let body;
            try { body = await request.json(); } catch { return fail(c, 400, 'INVALID_REQUEST'); }
            let handle;
            try { handle = normalizeHandle(body?.platform, body?.handle); } catch { return fail(c, 400, 'INVALID_HANDLE'); }
            const existing = await db.prepare('SELECT id FROM algorithm_accounts WHERE user_id=? AND platform=?').bind(user.id, body.platform).first();
            if (existing) return fail(c, 409, 'ALREADY_BOUND');
            let profile;
            try { profile = await verifyProfile(body.platform, handle, fetchImpl); }
            catch (error) {
                if (error.message === 'PROVIDER_HTTP_404') return fail(c, 400, 'PROFILE_NOT_FOUND');
                throw error;
            }
            // Do not claim ownership verification: a public handle is a self-declared association.
            const result = await db.prepare(`INSERT INTO algorithm_accounts (user_id, platform, handle, profile_json)
                VALUES (?, ?, ?, ?) ON CONFLICT(user_id, platform) DO NOTHING`)
                .bind(user.id, body.platform, profile.handle || handle, JSON.stringify(profile)).run();
            if (!result.meta?.changes) return fail(c, 409, 'ALREADY_BOUND');
            return c.jsonResponse({success: true, data: { id: result.meta.last_row_id }}, 201);
        }
        if (accountMatch) {
            // Every query scopes ownership. An admin also cannot read another user's private analysis.
            const account = await db.prepare('SELECT * FROM algorithm_accounts WHERE id=? AND user_id=?').bind(accountMatch[1], user.id).first();
            if (!account) return fail(c, 404, 'NOT_FOUND');
            if (!accountMatch[2] && request.method === 'DELETE') {
                const now = Math.floor((c.now?.() ?? Date.now()) / 1000);
                if (account.sync_lock_until > now) return fail(c, 409, 'SYNC_BUSY');
                await db.batch([
                    db.prepare('DELETE FROM algorithm_submissions WHERE account_id=?').bind(account.id),
                    db.prepare('DELETE FROM algorithm_accounts WHERE id=? AND user_id=?').bind(account.id, user.id)
                ]);
                return c.jsonResponse({success:true});
            }
            if (accountMatch[2] && request.method === 'POST') return await syncAccount(account, c, fetchImpl);
        }
        return fail(c, 405, 'METHOD_NOT_ALLOWED');
    } catch (error) {
        console.error('Algorithm center:', error.message);
        if (/no such table/.test(error.message)) return fail(c, 503, 'MIGRATION_REQUIRED');
        if (/PROFILE_NOT_FOUND/.test(error.message)) return fail(c, 400, 'PROFILE_NOT_FOUND');
        return fail(c, 502, 'PROVIDER_UNAVAILABLE');
    }
}

async function syncAccount(account, c, fetchImpl) {
    const db = c.env.DB, now = Math.floor((c.now?.() ?? Date.now()) / 1000);
    const last = Date.parse(account.last_synced_at || '') / 1000;
    if (Number.isFinite(last) && now - last < SYNC_COOLDOWN) return fail(c, 429, 'SYNC_COOLDOWN');
    const lock = await db.prepare(`UPDATE algorithm_accounts SET sync_lock_until=?
        WHERE id=? AND sync_lock_until<=?`).bind(now + 90, account.id, now).run();
    if (!lock.meta?.changes) return fail(c, 409, 'SYNC_BUSY');
    try {
        const mode = account.history_complete ? 'recent' : 'history';
        const page = await fetchSubmissionPage(account, mode, fetchImpl);
        const warnings = [];
        let profile; try { profile = JSON.parse(account.profile_json); } catch { profile = {}; }
        // Rating requests are optional. A failure must not erase already-synced training data.
        if (!profile.metadataAt || now - profile.metadataAt > 3600) {
            try {
                // Respect public API request intervals without holding one sync unboundedly.
                await new Promise(resolve => setTimeout(resolve, account.platform === 'codeforces' ? 2100 : 1100));
                profile = { ...profile, ...await fetchProfileDetails(account, fetchImpl), metadataAt: now };
            } catch { warnings.push('RATING_UNAVAILABLE'); }
        }
        if (account.platform === 'atcoder' && page.rows.length) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1100));
                const models = await fetchAtCoderModels(fetchImpl);
                page.rows.forEach(row => { row.problem.difficulty = atCoderDifficulty(models[row.problem.key]); });
            } catch { warnings.push('DIFFICULTY_UNAVAILABLE'); }
        }
        const { total } = await db.prepare('SELECT COUNT(*) AS total FROM algorithm_submissions WHERE account_id=?').bind(account.id).first();
        // At the storage cap, continue refreshing existing IDs but do not silently drop new history.
        const existing = await db.prepare('SELECT submission_id FROM algorithm_submissions WHERE account_id=?').bind(account.id).all();
        const ids = new Set(existing.results.map(row => row.submission_id));
        let slots = MAX_RECORDS - total, capped = false;
        const rows = page.rows.filter(row => {
            if (ids.has(row.id)) return true;
            if (slots-- > 0) { ids.add(row.id); return true; }
            capped = true; return false;
        });
        if (capped) warnings.push('RECORD_LIMIT');
        const statements = rows.map(row => db.prepare(`INSERT INTO algorithm_submissions
            (account_id, submission_id, problem_key, submitted_second, verdict, problem_json, language)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, submission_id) DO UPDATE SET
            verdict=excluded.verdict, problem_json=excluded.problem_json, language=excluded.language`)
            .bind(account.id, row.id, row.problem.key, row.second, row.verdict,
                JSON.stringify(row.problem), row.language.slice(0, 120)));
        // D1 batches are bounded. Cursor is committed only after all rows succeed; retry is idempotent.
        for (let i=0; i<statements.length; i+=100) await db.batch(statements.slice(i, i+100));
        const latest = Math.max(account.latest_second || 0, ...rows.map(row => row.second));
        let cursor = account.history_cursor, complete = account.history_complete;
        if (mode === 'history') { cursor = page.cursor; complete = page.complete ? 1 : 0; }
        else if (account.platform === 'codeforces' && page.resetHistory) { cursor = 1; complete = 0; warnings.push('HISTORY_GAP'); }
        else if (account.platform === 'atcoder') {
            // ASC pages: if new records exceed one page, continue from this cursor next sync.
            cursor = page.cursor; complete = page.complete ? 1 : 0;
        }
        if (capped) { cursor = account.history_cursor; complete = 0; }
        const syncedAt = new Date(now * 1000).toISOString();
        profile.warnings = warnings;
        await db.prepare(`UPDATE algorithm_accounts SET profile_json=?, history_cursor=?, history_complete=?,
            latest_second=?, last_synced_at=?, sync_lock_until=0 WHERE id=?`)
            .bind(JSON.stringify(profile), cursor, complete, latest, syncedAt, account.id).run();
        return c.jsonResponse({success:true, data:{ imported: rows.length, historyComplete: Boolean(complete), warnings }});
    } finally {
        await db.prepare('UPDATE algorithm_accounts SET sync_lock_until=0 WHERE id=?').bind(account.id).run();
    }
}

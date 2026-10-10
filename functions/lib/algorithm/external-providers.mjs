// One-request credentials only. Never return raw upstream responses or cookie-bearing errors.
export const EXTERNAL_PLATFORMS = ['vjudge', 'luogu', 'nowcoder', 'leetcode'];
const MAX_RESPONSE = 2 * 1024 * 1024;
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 10000000 ? value : null;
const invalid = () => { throw new Error('PROVIDER_FORMAT_CHANGED'); };
export const COOKIE_FIELDS = { vjudge: ['JSESSIONID'], luogu: ['_uid', '__client_id'], nowcoder: ['t'], leetcode: ['LEETCODE_SESSION', 'csrftoken'] };
export function buildPlatformCookie(platform, credentials) {
    const fields = COOKIE_FIELDS[platform];
    if (!fields || !credentials || typeof credentials !== 'object') throw new Error('INVALID_COOKIE');
    return normalizeOneTimeCookie(fields.map(name => {
        const value = credentials[name];
        if (typeof value !== 'string' || !value || /[;\s\x00-\x1f\x7f-\uffff]/.test(value)) throw new Error('INVALID_COOKIE');
        return name + '=' + value;
    }).join('; '));
}
export async function resolveExternalIdentity(platform, cookie, fetchImpl = fetch) {
    try {
        let handle;
        if (platform === 'luogu') handle = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('_uid='))?.slice(5);
        else if (platform === 'leetcode') {
            const csrf = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('csrftoken='))?.slice(10);
            const payload = parseJson(await read('https://leetcode.cn/graphql/', cookie, fetchImpl,
                { query: 'query { userStatus { isSignedIn userSlug } }' }, { 'X-CSRFToken': csrf || '', Referer: 'https://leetcode.cn/' }));
            if (payload.data?.userStatus?.isSignedIn) handle = payload.data.userStatus.userSlug;
        } else if (platform === 'nowcoder') {
            const html = await read('https://ac.nowcoder.com/', cookie, fetchImpl);
            // Read only the logged-in user's globalInfo, never arbitrary profile links or device cookies.
            const info = html.match(/(?:window\.)?globalInfo\s*=\s*\{([\s\S]*?)\}\s*;/)?.[1];
            handle = info?.match(/["']?ownerId["']?\s*:\s*["']?(\d+)/)?.[1];
        } else if (platform === 'vjudge') {
            handle = parseJson(await read('https://vjudge.net/user/changeUsernameInfo', cookie, fetchImpl)).currentUsername;
        }
        if (!handle) throw new Error('COOKIE_EXPIRED');
        return normalizeExternalHandle(platform, String(handle));
    } finally { cookie = ''; }
}

export function normalizeExternalHandle(platform, value) {
    if (!EXTERNAL_PLATFORMS.includes(platform) || typeof value !== 'string') throw new Error('INVALID_HANDLE');
    const handle = value.trim();
    const pattern = ['luogu', 'nowcoder'].includes(platform) ? /^[1-9]\d{0,11}$/ : /^[a-zA-Z0-9_-]{1,40}$/;
    if (!pattern.test(handle)) throw new Error('INVALID_HANDLE');
    return handle;
}

export function normalizeOneTimeCookie(value) {
    if (value == null || value === '') return '';
    if (typeof value !== 'string' || value.length > 8192 || /[^\x20-\x7e]/.test(value)
        || !value.split(';').every(part => /^\s*[^\s=;:]+=[^;]*$/.test(part))) throw new Error('INVALID_COOKIE');
    return value.trim();
}

async function read(url, cookie, fetchImpl, jsonBody, extraHeaders = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    let response, reader, headers = { Accept: 'application/json, text/html', 'User-Agent': 'Mozilla/5.0', ...extraHeaders };
    if (cookie) headers.Cookie = cookie;
    try {
        response = await fetchImpl(url, { method: jsonBody ? 'POST' : 'GET', redirect: 'manual',
            cache: 'no-store', signal: controller.signal, headers: { ...headers,
                ...(jsonBody ? { 'Content-Type': 'application/json' } : {}) },
            ...(jsonBody ? { body: JSON.stringify(jsonBody) } : {}) });
        // Never forward authentication to redirects, even between a provider's domains.
        if (response.status >= 300 && response.status < 400) throw new Error('PROVIDER_REDIRECT');
        if (response.status === 404) throw new Error('PROFILE_NOT_FOUND');
        if (response.status === 403) throw new Error('PROVIDER_ACCESS_BLOCKED');
        if (response.status === 429) throw new Error('PROVIDER_RATE_LIMITED');
        if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
        if (Number(response.headers.get('Content-Length')) > MAX_RESPONSE) invalid();
        reader = response.body?.getReader();
        if (!reader) invalid();
        const decoder = new TextDecoder(); let bytes = 0, text = '';
        while (true) {
            const part = await reader.read(); if (part.done) break;
            bytes += part.value.byteLength; if (bytes > MAX_RESPONSE) invalid();
            text += decoder.decode(part.value, { stream: true });
        }
        return text + decoder.decode();
    } catch (error) {
        // Fetch failures can contain URLs/headers. Export only a fixed error code.
        const allowed = ['PROVIDER_REDIRECT', 'PROFILE_NOT_FOUND', 'PROVIDER_FORMAT_CHANGED', 'PROVIDER_ACCESS_BLOCKED', 'PROVIDER_RATE_LIMITED'];
        if (controller.signal.aborted) throw new Error('PROVIDER_TIMEOUT');
        throw new Error(allowed.includes(error.message) ? error.message : 'PROVIDER_UNAVAILABLE');
    } finally {
        clearTimeout(timer); if (reader) { try { await reader.cancel(); } catch {} reader.releaseLock(); }
        headers.Cookie = ''; headers = null; cookie = ''; response = null;
    }
}
function parseJson(text) { try { return JSON.parse(text); } catch { invalid(); } }
function scriptJson(html, id) {
    const match = html.match(new RegExp('<script[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)<\\/script>'));
    if (!match) invalid();
    return parseJson(match[1]);
}
function safeRecords(records) {
    if (!records || typeof records !== 'object' || Array.isArray(records)) invalid();
    const result = new Map(); let entries = 0;
    for (const [oj, list] of Object.entries(records)) {
        if (!/^[A-Za-z0-9_-]{1,30}$/.test(oj) || !Array.isArray(list)) invalid();
        const values = new Set();
        for (const value of list) {
            if (++entries > 100000 || !/^[A-Za-z0-9_.-]{1,50}$/.test(String(value))) invalid();
            values.add(String(value));
        }
        result.set(oj, values);
    }
    return result;
}

export async function fetchExternalSnapshot(platform, handle, cookie = '', fetchImpl = fetch, options = {}) {
    handle = normalizeExternalHandle(platform, handle); cookie = normalizeOneTimeCookie(cookie);
    try {
        let result;
        if (platform === 'vjudge') {
            const html = await read('https://vjudge.net/user/' + encodeURIComponent(handle), cookie, fetchImpl);
            const header = scriptJson(html, 'profile-header-data');
            if (header.username?.toLowerCase() !== handle.toLowerCase()) throw new Error('PROFILE_NOT_FOUND');
            const payload = parseJson(await read('https://vjudge.net/user/solveDetail/' + encodeURIComponent(handle), cookie, fetchImpl));
            const accepted = safeRecords(payload.acRecords), failed = safeRecords(payload.failRecords);
            const origins = [...new Set([...accepted.keys(), ...failed.keys()])].map(oj => {
                const ac = accepted.get(oj) || new Set(), fail = failed.get(oj) || new Set();
                return { name: oj, solved: ac.size, attempted: new Set([...ac, ...fail]).size };
            }).sort((a, b) => b.solved - a.solved);
            const solved = origins.reduce((n, o) => n + o.solved, 0), attempted = origins.reduce((n, o) => n + o.attempted, 0);
            // A hidden/truncated list must not silently replace a previously complete count with zero.
            if (count(header.counts?.acAll) !== solved || count(header.counts?.attAll) !== attempted) invalid();
            result = { solved, attempted, submissions: null, difficulty: [], origins: origins.slice(0, 50), scope: 'vjudge-recorded-problems' };
        } else if (platform === 'luogu') {
            // Explicit domain selection: never forward a login Cookie through redirects or domain fallbacks.
            const domain = options.luoguDomain || 'www.luogu.com.cn';
            if (!['www.luogu.com.cn', 'www.luogu.com'].includes(domain)) throw new Error('INVALID_REQUEST');
            const html = await read('https://' + domain + '/user/' + handle, cookie, fetchImpl, undefined,
                { Accept: 'text/html', 'User-Agent': 'KnowledgeAlgorithmCenter/1.0', Referer: 'https://' + domain + '/', 'Cache-Control': 'no-cache' });
            const context = scriptJson(html, 'lentille-context'), profile = context.data?.user;
            if (String(profile?.uid) !== handle) throw new Error('PROFILE_NOT_FOUND');
            if (cookie && context.user?.uid && String(context.user.uid) !== handle) throw new Error('COOKIE_MISMATCH');
            if (cookie && !context.user?.uid) throw new Error('COOKIE_EXPIRED');
            result = { solved: count(profile.passedProblemCount), attempted: count(profile.submittedProblemCount),
                submissions: null, difficulty: [], origins: [], scope: 'luogu-profile' };
        } else if (platform === 'nowcoder') {
            const payload = parseJson(await read('https://www.nowcoder.com/problem/tracker/ranks/problem?userId=' + handle, cookie, fetchImpl,
                undefined, { Referer: 'https://www.nowcoder.com/problem/tracker' }));
            if (payload.code !== 0 || !Array.isArray(payload.data?.ranks)) invalid();
            const ranks = payload.data.ranks.filter(row => String(row.uid) === handle);
            // An empty ranking is not proof of zero solves. The user-info endpoint supplies the same tracker count.
            let tracker = ranks.length === 1 ? count(ranks[0].count) : null;
            if (tracker == null) {
                const info = parseJson(await read('https://www.nowcoder.com/problem/tracker/user-info?userId=' + handle, cookie, fetchImpl));
                if (info.code !== 0 || String(info.data?.user?.uid) !== handle) invalid();
                tracker = count(info.data.user.count);
            }
            if (tracker == null) invalid();
            const html = await read('https://ac.nowcoder.com/acm/contest/profile/' + handle + '/practice-coding', cookie, fetchImpl);
            if (html.includes('<title>牛客网-用户不存在</title>')) throw new Error('PROFILE_NOT_FOUND');
            const value = label => {
                const match = html.match(new RegExp('<div\\s+class="state-num"[^>]*>\\s*(\\d+)\\s*<\\/div>\\s*<span>' + label + '<\\/span>'));
                return match ? count(Number(match[1])) : null;
            };
            const acm = { name: 'ACM_PRACTICE', solved: value('题已通过'), attempted: value('题已挑战'), submissions: value('次提交') };
            if (acm.solved == null || (acm.attempted != null && acm.attempted < acm.solved)) invalid();
            result = { solved: acm.solved + tracker, attempted: null, submissions: null,
                difficulty: [], origins: [], sources: [acm, { name: 'TRACKER', solved: tracker, attempted: null, submissions: null }],
                scope: 'nowcoder-acm-plus-tracker-sum', deduplication: 'not-available' };
        } else {
            const query = `query($name:String!) {
                userStatus { isSignedIn userSlug }
                userProfilePublicProfile(userSlug:$name) { username profile { userSlug } }
                userProfileUserQuestionProgress(userSlug:$name) {
                    numAcceptedQuestions { difficulty count }
                    numFailedQuestions { difficulty count }
                }
            }`;
            const csrf = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('csrftoken='))?.slice(10);
            const payload = parseJson(await read('https://leetcode.cn/graphql/', cookie, fetchImpl,
                { query, variables: { name: handle } }, csrf ? { 'X-CSRFToken': csrf, Referer: 'https://leetcode.cn/' } : {}));
            if (payload.errors?.length) invalid();
            const data = payload.data;
            if (data?.userProfilePublicProfile?.profile?.userSlug !== handle) throw new Error('PROFILE_NOT_FOUND');
            if (cookie && !data.userStatus?.isSignedIn) throw new Error('COOKIE_EXPIRED');
            if (cookie && data.userStatus.userSlug !== handle) throw new Error('COOKIE_MISMATCH');
            const progress = data.userProfileUserQuestionProgress;
            const buckets = ['EASY', 'MEDIUM', 'HARD'];
            const values = list => {
                if (!Array.isArray(list) || list.length !== 3) invalid();
                return buckets.map(name => {
                    const found = list.filter(row => row.difficulty === name);
                    if (found.length !== 1 || count(found[0].count) == null) invalid();
                    return found[0].count;
                });
            };
            const ac = values(progress?.numAcceptedQuestions), failed = values(progress?.numFailedQuestions);
            result = { solved: ac.reduce((a,b) => a+b, 0), attempted: ac.reduce((n, a, i) => n+a+failed[i], 0), submissions: null,
                difficulty: buckets.map((name, i) => ({ name, solved: ac[i], attempted: ac[i] + failed[i] })), origins: [], scope: 'leetcode-cn-current-progress' };
        }
        if (result.solved == null || (result.attempted != null && result.attempted < result.solved)) invalid();
        return result; // Fixed whitelist: no HTML, raw JSON, credentials, Set-Cookie or user biography.
    } finally { cookie = ''; }
}

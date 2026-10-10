// Public profiles only. URLs are fixed; never accept a user-supplied URL or credential.
export const PAGE_SIZE = { codeforces: 1000, atcoder: 500 };

export function normalizeHandle(platform, input) {
    const handle = typeof input === 'string' ? input.trim() : '';
    const pattern = platform === 'codeforces' ? /^[a-zA-Z0-9_.-]{3,24}$/
        : platform === 'atcoder' ? /^[a-zA-Z0-9_]{1,32}$/ : null;
    if (!pattern || !pattern.test(handle)) throw new Error('INVALID_HANDLE');
    return handle;
}

async function read(url, fetchImpl, text = false) {
    const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: text ? 'text/html' : 'application/json', 'User-Agent': 'AlgorithmCenter/1.0' }
    });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    return text ? response.text() : response.json();
}

async function cf(method, params, fetchImpl) {
    const data = await read(`https://codeforces.com/api/${method}?${new URLSearchParams(params)}`, fetchImpl);
    if (data.status !== 'OK') throw new Error(/not found|not exist/i.test(data.comment || '') ? 'PROFILE_NOT_FOUND' : 'PROVIDER_REJECTED');
    return data.result;
}

export async function verifyProfile(platform, handle, fetchImpl = fetch) {
    if (platform === 'codeforces') {
        const users = await cf('user.info', { handles: handle }, fetchImpl);
        if (!users?.[0]) throw new Error('PROFILE_NOT_FOUND');
        return { handle: users[0].handle, rating: users[0].rating ?? null,
            maxRating: users[0].maxRating ?? null, rank: users[0].rank || '', ratings: [] };
    }
    // history/json may return [] for an unrated user. The profile page verifies existence.
    const html = await read(`https://atcoder.jp/users/${encodeURIComponent(handle)}?lang=en`, fetchImpl, true);
    if (!/id=["']user-nav-tabs["']/.test(html)) throw new Error('PROFILE_NOT_FOUND');
    return { handle, ratings: [] };
}

function cfProblem(problem) {
    const key = problem.contestId != null ? `${problem.contestId}/${problem.index}`
        : `gym/${problem.problemsetName || ''}/${problem.index}/${problem.name}`;
    return { key, name: String(problem.name || key).slice(0, 200),
        url: problem.contestId ? `https://codeforces.com/${problem.contestId >= 100000 ? 'gym' : 'contest'}/${problem.contestId}/problem/${encodeURIComponent(problem.index)}` : null,
        difficulty: Number.isFinite(problem.rating) ? problem.rating : null,
        tags: Array.isArray(problem.tags) ? problem.tags.slice(0, 20) : [] };
}

export async function fetchSubmissionPage(account, mode, fetchImpl = fetch) {
    const size = PAGE_SIZE[account.platform];
    if (account.platform === 'codeforces') {
        // history_cursor is an API offset, not the number of successfully imported records.
        const from = mode === 'history' ? Math.max(1, account.history_cursor || 1) : 1;
        const raw = await cf('user.status', { handle: account.handle, from: String(from), count: String(size) }, fetchImpl);
        if (!Array.isArray(raw)) throw new Error('INVALID_PROVIDER_RESPONSE');
        const rows = raw.filter(s => s.problem && s.id && s.creationTimeSeconds).map(s => ({
            id: String(s.id), second: s.creationTimeSeconds, verdict: s.verdict || 'PENDING',
            language: s.programmingLanguage || '', problem: cfProblem(s.problem)
        }));
        return { rows, cursor: from + raw.length, complete: raw.length < size,
            // More than one page since the previous refresh can create a gap. Rescan history.
            resetHistory: mode !== 'history' && raw.length === size
                && Number(account.latest_second) > 0
                && raw[raw.length - 1].creationTimeSeconds > Number(account.latest_second) };
    }
    const from = mode === 'history' ? account.history_cursor || 0 : account.latest_second || 0;
    const raw = await read(`https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?${new URLSearchParams({user: account.handle, from_second: String(from)})}`, fetchImpl);
    if (!Array.isArray(raw)) throw new Error('INVALID_PROVIDER_RESPONSE');
    const rows = raw.filter(s => s.id && s.problem_id && s.contest_id && s.epoch_second).map(s => ({
        id: String(s.id), second: s.epoch_second, verdict: s.result === 'AC' ? 'OK' : s.result || 'PENDING',
        language: s.language || '', problem: { key: s.problem_id, name: s.problem_id,
            url: `https://atcoder.jp/contests/${encodeURIComponent(s.contest_id)}/tasks/${encodeURIComponent(s.problem_id)}`,
            difficulty: null, tags: [] }
    }));
    const cursor = rows.length ? Math.max(...rows.map(s => s.second)) : from;
    // Inclusive cursor + database upsert keeps submissions at the same second from being lost.
    if (raw.length >= size && cursor <= from) throw new Error('CURSOR_STALLED');
    return { rows, cursor, complete: raw.length < size, resetHistory: false };
}

export async function fetchProfileDetails(account, fetchImpl = fetch) {
    if (account.platform === 'codeforces') {
        const ratings = await cf('user.rating', { handle: account.handle }, fetchImpl);
        if (!Array.isArray(ratings)) throw new Error('INVALID_PROVIDER_RESPONSE');
        const history = ratings.map(r => ({ contest: r.contestName, rating: r.newRating,
            change: r.newRating - r.oldRating, rank: r.rank, second: r.ratingUpdateTimeSeconds,
            url: `https://codeforces.com/contest/${r.contestId}` }));
        return { ratings: history.slice(-100), rating: history.at(-1)?.rating ?? null,
            maxRating: history.length ? Math.max(...history.map(r => r.rating)) : null,
            ratedContests: history.length, source: 'Codeforces API' };
    }
    const ratings = await read(`https://atcoder.jp/users/${encodeURIComponent(account.handle)}/history/json`, fetchImpl);
    if (!Array.isArray(ratings)) throw new Error('INVALID_PROVIDER_RESPONSE');
    // AtCoder can include heuristic events; this analysis keeps only rated algorithm contests.
    const history = ratings.filter(r => r.IsRated && !String(r.ContestScreenName).startsWith('ahc')).map(r => ({
        contest: r.ContestName, rating: r.NewRating, change: r.NewRating - r.OldRating,
        rank: r.Place, second: Math.floor(Date.parse(r.EndTime) / 1000),
        url: `https://atcoder.jp/contests/${encodeURIComponent(String(r.ContestScreenName).replace(/\.contest\.atcoder\.jp$/, ''))}`
    }));
    return { ratings: history.slice(-100), rating: history.at(-1)?.rating ?? null,
        maxRating: history.length ? Math.max(...history.map(r => r.rating)) : null,
        ratedContests: history.length, source: 'AtCoder / AtCoder Problems (unofficial)' };
}

export async function fetchAtCoderModels(fetchImpl = fetch) {
    const key = new Request('https://kenkoooo.com/atcoder/resources/problem-models.json');
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cached = await cache?.match(key);
    if (cached) return cached.json();
    const models = await read(key.url, fetchImpl);
    if (!models || typeof models !== 'object' || Array.isArray(models)) throw new Error('INVALID_PROVIDER_RESPONSE');
    if (cache) await cache.put(key, new Response(JSON.stringify(models), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' }
    }));
    return models;
}

export function atCoderDifficulty(model) {
    const d = model?.difficulty;
    if (!Number.isFinite(d)) return null;
    return Math.round(d < 400 ? 400 / Math.exp(1 - d / 400) : d);
}

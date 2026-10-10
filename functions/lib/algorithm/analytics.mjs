import { analyzeProblemEvidence } from './diagnostics.mjs';
const DAY = 86400;
const dateKey = second => new Date((second + 8 * 3600) * 1000).toISOString().slice(0, 10);
const rate = (n, d) => d ? Math.round(n / d * 1000) / 10 : null;

export function analyzeSubmissions(rows, accounts, now = Date.now()) {
    const nowSecond = Math.floor(now / 1000);
    const today = dateKey(nowSecond);
    const problems = new Map(), activity = new Map(), verdicts = new Map(), languages = new Map();
    let accepted = 0, judged = 0;
    for (const row of [...rows].sort((a, b) => a.submitted_second - b.submitted_second || Number(a.submission_id) - Number(b.submission_id))) {
        let info;
        try { info = JSON.parse(row.problem_json); } catch { continue; }
        const key = `${row.platform}:${row.problem_key}`;
        let problem = problems.get(key);
        if (!problem) {
            problem = { ...info, platform: row.platform, attempts: 0, failures: 0, first: row.submitted_second,
                last: row.submitted_second, solvedAt: null, firstVerdict: row.verdict };
            problems.set(key, problem);
        }
        // Prefer current metadata over old snapshots that had unknown difficulty.
        if (info.difficulty != null) problem.difficulty = info.difficulty;
        if (info.tags?.length) problem.tags = info.tags;
        problem.attempts++;
        problem.last = row.submitted_second;
        const isJudged = !['PENDING', 'TESTING', 'WJ', 'WR', 'RUNNING'].includes(row.verdict);
        if (isJudged) judged++;
        if (row.verdict === 'OK') {
            accepted++;
            if (problem.solvedAt === null) problem.solvedAt = row.submitted_second;
        } else if (isJudged) problem.failures++;
        verdicts.set(row.verdict, (verdicts.get(row.verdict) || 0) + 1);
        languages.set(row.language || 'Unknown', (languages.get(row.language || 'Unknown') || 0) + 1);
        const day = dateKey(row.submitted_second);
        const active = activity.get(day) || { date: day, submissions: 0, solved: 0 };
        active.submissions++;
        activity.set(day, active);
    }
    const all = [...problems.values()], solved = all.filter(p => p.solvedAt !== null);
    const tags = new Map(), months = new Map();
    for (const p of all) {
        for (const tag of new Set(p.tags || [])) {
            const entry = tags.get(tag) || { tag, attempted: 0, solved: 0, failures: 0, firstTry: 0 };
            entry.attempted++; entry.failures += p.failures;
            if (p.solvedAt !== null) entry.solved++;
            if (p.firstVerdict === 'OK') entry.firstTry++;
            tags.set(tag, entry);
        }
        if (p.solvedAt !== null) {
            const day = dateKey(p.solvedAt);
            if (activity.has(day)) activity.get(day).solved++;
            const month = day.slice(0, 7);
            months.set(month, (months.get(month) || 0) + 1);
        }
    }
    const heatmap = Array.from({length: 91}, (_, i) => {
        const day = dateKey(nowSecond - (90 - i) * DAY);
        return activity.get(day) || { date: day, submissions: 0, solved: 0 };
    });
    let streak = 0, longestStreak = 0, run = 0, previous = null;
    const activeDays = [...activity.keys()].filter(d => d <= today).sort();
    for (const day of activeDays) {
        run = previous && Date.parse(day) - Date.parse(previous) === DAY * 1000 ? run + 1 : 1;
        longestStreak = Math.max(longestStreak, run); previous = day;
    }
    // A streak may continue from yesterday if today has not started training yet.
    let end = activity.has(today) ? nowSecond : nowSecond - DAY;
    while (activity.has(dateKey(end))) { streak++; end -= DAY; }
    const platforms = accounts.map(account => {
        const set = all.filter(p => p.platform === account.platform);
        const ac = set.filter(p => p.solvedAt !== null);
        const distribution = new Map();
        for (const p of ac) {
            const bucket = p.difficulty == null ? 'unrated' : String(Math.floor(p.difficulty / 400) * 400);
            distribution.set(bucket, (distribution.get(bucket) || 0) + 1);
        }
        const rated = ac.filter(p => p.difficulty != null).map(p => p.difficulty).sort((a,b) => a-b);
        let profile; try { profile = JSON.parse(account.profile_json); } catch { profile = {}; }
        return { id: account.id, platform: account.platform, handle: account.handle,
            solved: ac.length, attempted: set.length, submissions: rows.filter(r => r.account_id === account.id).length,
            historyComplete: Boolean(account.history_complete), lastSyncedAt: account.last_synced_at,
            profile, difficulty: [...distribution].map(([bucket, count]) => ({ bucket, count }))
                .sort((a,b) => (a.bucket === 'unrated' ? Infinity : +a.bucket) - (b.bucket === 'unrated' ? Infinity : +b.bucket)),
            medianDifficulty: rated.length ? (rated[Math.floor((rated.length - 1) / 2)] + rated[Math.floor(rated.length / 2)]) / 2 : null,
            maxDifficulty: rated.at(-1) ?? null, ratedProblems: rated.length };
    });
    const tagList = [...tags.values()].map(e => ({ ...e, completionRate: rate(e.solved, e.attempted) }))
        .sort((a,b) => b.attempted - a.attempted);
    const countDays = days => solved.filter(p => p.solvedAt <= nowSecond && p.solvedAt >= nowSecond - days * DAY).length;
    return { summary: { solved: solved.length, attempted: all.length, submissions: rows.length,
        accepted, judged, acceptanceRate: rate(accepted, judged), firstTryRate: rate(solved.filter(p => p.firstVerdict === 'OK').length, solved.length),
        solved7: countDays(7), solved30: countDays(30), previous30: countDays(60) - countDays(30),
        activeDays30: activeDays.filter(d => d >= dateKey(nowSecond - 29 * DAY)).length,
        streak, longestStreak, unresolved: all.length - solved.length,
        historyComplete: accounts.length > 0 && accounts.every(a => a.history_complete && a.last_synced_at) },
        platforms, tags: tagList.slice(0, 30), heatmap, diagnostics: analyzeProblemEvidence(all, accounts, now),
        months: [...months].sort(([a],[b]) => a.localeCompare(b)).slice(-12).map(([month, count]) => ({ month, count })),
        verdicts: [...verdicts].map(([name,count]) => ({name,count})).sort((a,b) => b.count-a.count),
        languages: [...languages].map(([name,count]) => ({name,count})).sort((a,b) => b.count-a.count).slice(0, 10),
        recent: solved.sort((a,b) => b.solvedAt - a.solvedAt).slice(0, 12),
        unresolved: all.filter(p => p.solvedAt === null).sort((a,b) => b.last - a.last).slice(0, 12),
        // Explainable recommendations, not an unsupported composite ability score.
        weakTags: tagList.filter(e => e.attempted >= 3 && e.completionRate < 70).sort((a,b) => a.completionRate - b.completionRate).slice(0, 3),
        strongTags: tagList.filter(e => e.solved >= 5 && e.completionRate >= 80).slice(0, 3),
        generatedAt: new Date(now).toISOString(), timezone: 'Asia/Shanghai' };
}

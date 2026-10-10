// Evidence from imported submissions, never a standardized ability score.
export function analyzeProblemEvidence(problems, accounts, now) {
    const pct = (n,d) => d ? Math.round(n/d*1000)/10 : null;
    const topics = new Map(), difficulty = new Map();
    let tagged = 0, rated = 0;
    for (const p of problems) {
        const solved = p.solvedAt !== null;
        const tags = p.platform === 'codeforces' ? [...new Set(p.tags || [])] : [];
        if (tags.length) tagged++;
        for (const tag of tags) {
            const t = topics.get(tag) || { tag, attempted:0, solved:0, firstTry:0, attempts:0, failures:0 };
            t.attempted++; t.solved += Number(solved); t.firstTry += Number(solved && p.firstVerdict === 'OK');
            t.attempts += p.attempts; t.failures += p.failures; topics.set(tag,t);
        }
        if (Number.isFinite(p.difficulty)) rated++;
        const bucket = Number.isFinite(p.difficulty) ? String(Math.floor(p.difficulty/400)*400) : 'unrated';
        const key = p.platform + ':' + bucket;
        const d = difficulty.get(key) || { platform:p.platform, bucket, attempted:0, solved:0 };
        d.attempted++; d.solved += Number(solved); difficulty.set(key,d);
    }
    const topicRows = [...topics.values()].map(t => ({ ...t, completion:pct(t.solved,t.attempted),
        firstTryRate:pct(t.firstTry,t.solved), averageAttempts:Math.round(t.attempts/t.attempted*10)/10,
        evidence: t.attempted < 5 ? 'insufficient' : t.solved < t.attempted*.7 ? 'review' : t.solved >= 5 && t.solved >= t.attempted*.8 ? 'consistent' : 'developing' }))
        .sort((a,b) => b.attempted-a.attempted);
    const recent = problems.filter(p => p.solvedAt !== null && p.solvedAt >= now/1000-30*86400);
    const previous = problems.filter(p => p.solvedAt !== null && p.solvedAt < now/1000-30*86400 && p.solvedAt >= now/1000-60*86400);
    const period = list => ({ solved:list.length, averageAttempts:list.length ? Math.round(list.reduce((n,p)=>n+p.attempts,0)/list.length*10)/10 : null,
        firstTryRate:pct(list.filter(p=>p.firstVerdict==='OK').length,list.length) });
    return { topics:topicRows.slice(0,40), difficulty:[...difficulty.values()],
        coverage:{ attempted:problems.length, tagged, rated, historyComplete:accounts.length>0 && accounts.every(a=>a.history_complete && a.last_synced_at) },
        periods:{recent:period(recent), previous:period(previous)},
        review:problems.filter(p=>p.solvedAt===null && p.failures>0).sort((a,b)=>b.failures-a.failures || b.last-a.last).slice(0,30)
            .map(p=>({platform:p.platform,name:p.name,key:p.key,url:p.url,tags:p.tags||[],difficulty:p.difficulty,attempts:p.attempts,failures:p.failures,last:p.last})) };
}

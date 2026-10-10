// Cross-platform totals are sums, not globally deduplicated problem identities.
export function aggregatePlatforms(analysis, external = []) {
    const platforms = analysis.platforms.filter(p => p.lastSyncedAt).map(p => ({ platform: p.platform, handle: p.handle,
        solved: p.solved, attempted: p.attempted, submissions: p.submissions, lastSyncedAt: p.lastSyncedAt, coverage: 'records' }));
    for (const row of external) {
        if (row.platform === 'vjudge' || !row.last_synced_at) continue;
        let s; try { s = JSON.parse(row.snapshot_json); } catch { continue; }
        if (!Number.isSafeInteger(s.solved) || s.solved < 0) continue;
        platforms.push({ platform: row.platform, handle: row.handle, solved: s.solved, attempted: s.attempted,
            submissions: s.submissions, lastSyncedAt: row.last_synced_at, coverage: s.scope, difficulty:s.difficulty || [] });
    }
    const sum = key => platforms.reduce((n,p) => n + (Number.isSafeInteger(p[key]) ? p[key] : 0), 0);
    const attemptedSources = platforms.filter(p => Number.isSafeInteger(p.attempted));
    const attempted = sum('attempted'), comparableSolved = attemptedSources.reduce((n,p) => n+p.solved,0);
    return { platforms, solved: sum('solved'), attempted, comparableSolved, submissions: sum('submissions'),
        attemptedSources: attemptedSources.length, submissionSources: platforms.filter(p => Number.isSafeInteger(p.submissions)).length,
        completionRate: attempted ? Math.round(comparableSolved / attempted * 1000) / 10 : null,
        unresolved: attempted - comparableSolved, recordSources: platforms.filter(p => p.coverage === 'records').length };
}

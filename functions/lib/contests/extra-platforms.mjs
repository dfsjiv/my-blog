import { createContest, PLATFORM_NAMES } from './normalize.mjs';

export async function fetchYukicoderContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl('https://yukicoder.me/api/v1/contest/future', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`yukicoder HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid yukicoder response');
    return data.map(c => createContest({ id: `yukicoder-${c.Id}`, platform: PLATFORM_NAMES.yukicoder,
        title: c.Name, url: `https://yukicoder.me/contests/${c.Id}`, startTime: c.Date,
        endTime: c.EndDate, durationSeconds: (Date.parse(c.EndDate) - Date.parse(c.Date)) / 1000, eventMode: 'online', feeType: 'free',
        sourceConfidence: 'official-api', sourceUpdatedAt: now }, now)).filter(Boolean);
}

export async function fetchTopcoderContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl('https://api.topcoder.com/v6/challenges?status=Active&perPage=100', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Topcoder HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid Topcoder response');
    // Active includes non-algorithm development tasks and occasionally expired entries.
    return data.filter(c => /marathon|algorithm/i.test(c.type?.name || c.name || '')
        && Date.parse(c.endDate) > now).map(c => createContest({
        id: `topcoder-${c.id}`, platform: PLATFORM_NAMES.topcoder, title: c.name,
        url: `https://www.topcoder.com/challenges/${c.id}`, startTime: c.startDate,
        endTime: c.endDate, durationSeconds: (Date.parse(c.endDate) - Date.parse(c.startDate)) / 1000, eventMode: 'online', feeType: 'free',
        sourceConfidence: 'official-api', sourceUpdatedAt: now }, now)).filter(Boolean);
}

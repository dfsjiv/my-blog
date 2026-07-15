import { createContest, fromUnixSeconds, PLATFORM_NAMES } from "./normalize.mjs";

const API_URL = "https://www.hackerrank.com/rest/contests/upcoming?offset=0&limit=50";
const COMPETITIVE_PATTERN = /(?:week of code|hourrank|codesprint|101 hack|world codesprint|algorithm|competitive programming)/i;
const HIRING_PATTERN = /(?:hiring|recruit|university|company|women'?s codesprint)/i;

export function parseHackerRankPayload(payload, now = Date.now()) {
    if (!payload || !Array.isArray(payload.models)) throw new Error("HackerRank response is invalid");
    return payload.models.filter((item) => {
        const title = String(item.name || "");
        const starts = Number(item.epoch_starttime) * 1000;
        const ends = Number(item.epoch_endtime) * 1000;
        const duration = ends - starts;
        return starts > now
            && duration > 0
            && duration <= 7 * 24 * 60 * 60 * 1000
            && COMPETITIVE_PATTERN.test(title)
            && !HIRING_PATTERN.test(title);
    }).map((item) => createContest({
        id: "hackerrank-" + (item.id || item.slug),
        platform: PLATFORM_NAMES.hackerrank,
        title: item.name,
        url: "https://www.hackerrank.com/contests/" + item.slug,
        startTime: fromUnixSeconds(item.epoch_starttime),
        endTime: fromUnixSeconds(item.epoch_endtime),
        feeType: "unknown",
        rated: typeof item.rated === "boolean" ? item.rated : null,
        contestKind: "competitive-programming",
        importance: "normal",
        sourceConfidence: "official-api",
        sourceUpdatedAt: now
    }, now)).filter(Boolean);
}

export async function fetchHackerRankContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(API_URL, {
        headers: { "Accept": "application/json", "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error("HackerRank HTTP " + response.status);
    return parseHackerRankPayload(await response.json(), now);
}

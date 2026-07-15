import { fetchCodeforcesContests } from "./codeforces.mjs";
import { fetchAtCoderContests } from "./atcoder.mjs";
import { fetchNowCoderContests } from "./nowcoder.mjs";
import { fetchLuoguContests } from "./luogu.mjs";
import { sortContests } from "./normalize.mjs";

export const CONTEST_CACHE_SECONDS = 10 * 60;

const SOURCES = [
    ["Codeforces", fetchCodeforcesContests],
    ["AtCoder", fetchAtCoderContests],
    ["NowCoder", fetchNowCoderContests],
    ["Luogu", fetchLuoguContests]
];

async function fetchAllContests(fetchImpl = fetch, now = Date.now()) {
    const settled = await Promise.allSettled(
        SOURCES.map(([, adapter]) => adapter(fetchImpl, now))
    );
    const contests = [];
    const warnings = [];

    settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
            contests.push(...result.value);
            return;
        }
        const sourceName = SOURCES[index][0];
        console.error(`${sourceName} contests fetch failed:`, result.reason?.message || result.reason);
        warnings.push(`${sourceName} fetch failed`);
    });

    return { success: true, contests: sortContests(contests), warnings };
}

export async function getContestsResponse(request, context = {}) {
    const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
    const cacheUrl = new URL(request.url);
    cacheUrl.search = "?source-cache=v3";
    const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

    if (cache) {
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
    }

    const data = await fetchAllContests(context.fetch || fetch, Date.now());
    const response = new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": `public, max-age=${CONTEST_CACHE_SECONDS}`
        }
    });

    if (cache) {
        const cacheWrite = cache.put(cacheKey, response.clone());
        if (typeof context.waitUntil === "function") context.waitUntil(cacheWrite);
        else await cacheWrite;
    }
    return response;
}

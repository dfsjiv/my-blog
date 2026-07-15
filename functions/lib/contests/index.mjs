import { fetchCodeforcesContests } from "./codeforces.mjs";
import { fetchAtCoderContests } from "./atcoder.mjs";
import { fetchNowCoderContests } from "./nowcoder.mjs";
import { fetchLuoguContests } from "./luogu.mjs";
import { fetchLeetCodeContests } from "./leetcode.mjs";
import { fetchCodeChefContests } from "./codechef.mjs";
import { fetchHackerRankContests } from "./hackerrank.mjs";
import { fetchDmojContests } from "./dmoj.mjs";
import { fetchKattisContests } from "./kattis.mjs";
import {
    fetchLanqiaoCupContests,
    fetchBaiduStarContests,
    fetchRaicomContests,
    fetchChuanZhiCupContests,
    fetchGpltContests,
    fetchMatiCupContests
} from "./china-events.mjs";
import { sortContests } from "./normalize.mjs";

export const CONTEST_CACHE_SECONDS = 10 * 60;
const SOURCE_TIMEOUT_MS = 12 * 1000;

const SOURCES = [
    ["Codeforces", fetchCodeforcesContests],
    ["AtCoder", fetchAtCoderContests],
    ["NowCoder", fetchNowCoderContests],
    ["Luogu", fetchLuoguContests],
    ["LeetCode", fetchLeetCodeContests],
    ["CodeChef", fetchCodeChefContests],
    ["HackerRank", fetchHackerRankContests],
    ["DMOJ", fetchDmojContests],
    ["Kattis", fetchKattisContests],
    ["Lanqiao Cup", fetchLanqiaoCupContests],
    ["Baidu Star", fetchBaiduStarContests],
    ["RAICOM", fetchRaicomContests],
    ["ChuanZhi Cup", fetchChuanZhiCupContests],
    ["GPLT", fetchGpltContests],
    ["Mati Cup", fetchMatiCupContests]
];

function withTimeout(promise, sourceName) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(sourceName + " request timed out")),
            SOURCE_TIMEOUT_MS
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchAllContests(fetchImpl = fetch, now = Date.now()) {
    const settled = await Promise.allSettled(
        SOURCES.map(([sourceName, adapter]) => withTimeout(adapter(fetchImpl, now), sourceName))
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
    cacheUrl.search = "?source-cache=v6";
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

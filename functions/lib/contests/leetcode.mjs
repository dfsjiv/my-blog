import { createContest, fromUnixSeconds, PLATFORM_NAMES } from "./normalize.mjs";

const GRAPHQL_URL = "https://leetcode.com/graphql";
const QUERY = [
    "query contestUpcomingContests {",
    "  contestUpcomingContests { title titleSlug startTime duration }",
    "}"
].join("\n");

export function parseLeetCodePayload(payload, now = Date.now()) {
    const rows = payload && payload.data && payload.data.contestUpcomingContests;
    if (!Array.isArray(rows)) throw new Error("LeetCode contest data was not found");
    return rows
        .filter((item) => /^(?:Weekly|Biweekly) Contest\b/i.test(String(item.title || "")))
        .map((item) => createContest({
            id: "leetcode-" + item.titleSlug,
            platform: PLATFORM_NAMES.leetcode,
            title: item.title,
            url: "https://leetcode.com/contest/" + item.titleSlug + "/",
            startTime: fromUnixSeconds(item.startTime),
            durationSeconds: Number(item.duration) || null,
            feeType: "unknown",
            rated: true,
            contestKind: "competitive-programming",
            importance: "high",
            sourceConfidence: "official-api",
            sourceUpdatedAt: now
        }, now))
        .filter(Boolean);
}

export async function fetchLeetCodeContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(GRAPHQL_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Referer": "https://leetcode.com/contest/",
            "User-Agent": "ContestCenter/1.0"
        },
        body: JSON.stringify({ query: QUERY })
    });
    if (!response.ok) throw new Error("LeetCode HTTP " + response.status);
    return parseLeetCodePayload(await response.json(), now);
}

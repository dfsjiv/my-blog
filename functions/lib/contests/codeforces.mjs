import { createContest, fromUnixSeconds, PLATFORM_NAMES } from "./normalize.mjs";

const API_URL = "https://codeforces.com/api/contest.list";

export async function fetchCodeforcesContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(API_URL, {
        headers: { "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error(`Codeforces HTTP ${response.status}`);

    const data = await response.json();
    if (!data || data.status !== "OK" || !Array.isArray(data.result)) {
        throw new Error("Codeforces response is invalid");
    }

    const recentThreshold = now - 14 * 24 * 60 * 60 * 1000;
    return data.result
        .map((contest) => createContest({
            id: `codeforces-${contest.id}`,
            platform: PLATFORM_NAMES.codeforces,
            title: contest.name,
            url: `https://codeforces.com/contest/${contest.id}`,
            startTime: fromUnixSeconds(contest.startTimeSeconds),
            durationSeconds: contest.durationSeconds,
            feeType: "unknown",
            rated: typeof contest.type === "string" ? contest.type === "CF" : null,
            importance: /(?:round|global|educational|div\.?\s*[1-4])/i.test(contest.name) ? "high" : "normal",
            sourceConfidence: "official-api",
            sourceUpdatedAt: now
        }, now))
        .filter((contest) => contest && (
            contest.status !== "finished" || Date.parse(contest.endTime) >= recentThreshold
        ));
}

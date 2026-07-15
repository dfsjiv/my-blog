import { createContest, PLATFORM_NAMES } from "./normalize.mjs";

const API_URL = "https://www.codechef.com/api/list/contests/all";

export function parseCodeChefPayload(payload, now = Date.now()) {
    if (!payload || payload.status !== "success") throw new Error("CodeChef response is invalid");
    const rows = [
        ...(Array.isArray(payload.present_contests) ? payload.present_contests : []),
        ...(Array.isArray(payload.future_contests) ? payload.future_contests : [])
    ];
    return rows.map((item) => {
        const title = String(item.contest_name || "");
        const isStarters = /\bStarters\b/i.test(title);
        const isTraining = /(?:dev challenge|munch|practice|skill)/i.test(title);
        return createContest({
            id: "codechef-" + item.contest_code,
            platform: PLATFORM_NAMES.codechef,
            title,
            url: "https://www.codechef.com/" + encodeURIComponent(item.contest_code),
            startTime: item.contest_start_date_iso,
            endTime: item.contest_end_date_iso,
            durationSeconds: Number(item.contest_duration) * 60,
            feeType: "unknown",
            rated: /rated/i.test(title) ? true : null,
            contestKind: isTraining ? "training" : "competitive-programming",
            importance: isStarters ? "high" : (isTraining ? "low" : "normal"),
            sourceConfidence: "official-api",
            sourceUpdatedAt: now
        }, now);
    }).filter(Boolean);
}

export async function fetchCodeChefContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(API_URL, {
        headers: { "Accept": "application/json", "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error("CodeChef HTTP " + response.status);
    return parseCodeChefPayload(await response.json(), now);
}

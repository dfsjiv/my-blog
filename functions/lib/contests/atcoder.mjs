import {
    createContest,
    normalizeOffsetTime,
    PLATFORM_NAMES,
    stripHtml
} from "./normalize.mjs";

const CONTESTS_URL = "https://atcoder.jp/contests/?lang=en";

function parseDuration(value) {
    const match = String(value || "").trim().match(/^(\d+):(\d{2})$/);
    return match ? (Number(match[1]) * 60 + Number(match[2])) * 60 : null;
}

export function parseAtCoderHtml(html, now = Date.now()) {
    const section = String(html).match(/id=["']contest-table-upcoming["'][\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
    if (!section) throw new Error("AtCoder upcoming table was not found");

    const contests = [];
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(section[1])) !== null) {
        const row = rowMatch[1];
        const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
        const link = row.match(/<a[^>]+href=["'](\/contests\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const time = row.match(/<time[^>]*>([\s\S]*?)<\/time>/i);
        if (!link || !time || cells.length < 4) continue;

        const startTime = normalizeOffsetTime(stripHtml(time[1]));
        const durationSeconds = parseDuration(stripHtml(cells[2][1]));
        const slug = link[1].split("/").filter(Boolean).pop();
        const contest = createContest({
            id: `atcoder-${slug}`,
            platform: PLATFORM_NAMES.atcoder,
            title: stripHtml(link[2]),
            url: `https://atcoder.jp${link[1]}`,
            startTime,
            durationSeconds,
            feeType: "unknown",
            rated: null,
            ratingRange: stripHtml(cells[3][1]) || null,
            importance: /AtCoder (?:Beginner|Regular|Grand) Contest|\b(?:ABC|ARC|AGC)\s*\d+/i.test(stripHtml(link[2]))
                ? "high"
                : "normal",
            sourceConfidence: "official-page",
            sourceUpdatedAt: now
        }, now);
        if (contest) contests.push(contest);
    }
    return contests;
}

export async function fetchAtCoderContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(CONTESTS_URL, {
        headers: { "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error(`AtCoder HTTP ${response.status}`);
    return parseAtCoderHtml(await response.text(), now);
}

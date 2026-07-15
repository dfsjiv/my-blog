import { createContest, PLATFORM_NAMES, stripHtml } from "./normalize.mjs";

const CONTESTS_URL = "https://dmoj.ca/contests/";

export function parseDmojHtml(html, now = Date.now()) {
    const source = String(html || "");
    if (/Just a moment|cf-chl-/i.test(source)) throw new Error("DMOJ page is protected");
    const upcoming = source.match(/id=["']?upcoming-contests["']?[\s\S]*?(?:<table[^>]*>([\s\S]*?)<\/table>|$)/i)
        || source.match(/Upcoming Contests[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!upcoming) return [];
    const contests = [];
    for (const rowMatch of upcoming[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = rowMatch[1];
        const link = row.match(/<a[^>]+href=["'](\/contest\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const timeValues = Array.from(row.matchAll(/<time[^>]+datetime=["']([^"']+)["']/gi), (match) => match[1]);
        if (!link || !timeValues[0]) continue;
        const slug = link[1].split("/").filter(Boolean).pop();
        const durationText = stripHtml(row).match(/(?:Window(?: Duration)?|Duration)\s*:?\s*(\d+)\s*(?:h|hours?)/i);
        contests.push(createContest({
            id: "dmoj-" + slug,
            platform: PLATFORM_NAMES.dmoj,
            title: stripHtml(link[2]),
            url: "https://dmoj.ca" + link[1],
            startTime: timeValues[0],
            endTime: timeValues[1] || null,
            durationSeconds: durationText ? Number(durationText[1]) * 3600 : null,
            feeType: "unknown",
            contestKind: "competitive-programming",
            importance: "normal",
            sourceConfidence: "official-page",
            sourceUpdatedAt: now
        }, now));
    }
    return contests.filter(Boolean).filter((contest) => contest.status === "upcoming");
}

export async function fetchDmojContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(CONTESTS_URL, {
        headers: { "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error("DMOJ HTTP " + response.status);
    return parseDmojHtml(await response.text(), now);
}

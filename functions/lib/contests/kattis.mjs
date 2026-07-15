import { createContest, PLATFORM_NAMES, stripHtml } from "./normalize.mjs";

const CONTESTS_URL = "https://open.kattis.com/contests";
const LOW_VALUE_PATTERN = /(?:practice|training|homework|assignment|class|course|summer practice)/i;
const HIGH_VALUE_PATTERN = /(?:ICPC|regional|championship|open contest|challenge)/i;

function normalizeZoneTime(value) {
    return String(value || "").trim()
        .replace(/\sCEST$/i, "+02:00")
        .replace(/\sCET$/i, "+01:00")
        .replace(/\sEDT$/i, "-04:00")
        .replace(/\sEST$/i, "-05:00")
        .replace(/\sUTC$/i, "Z");
}

function parseLength(value) {
    const match = String(value || "").trim().match(/^(\d+):(\d{2}):(\d{2})$/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

export function parseKattisHtml(html, now = Date.now()) {
    const source = String(html || "");
    const sections = Array.from(source.matchAll(/<table[^>]+id=["']table-contests-(ongoing|upcoming)["'][^>]*>([\s\S]*?)<\/table>/gi));
    if (!sections.length) throw new Error("Kattis contest tables were not found");
    const contests = [];
    sections.forEach((section) => {
        for (const rowMatch of section[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
            const row = rowMatch[1];
            const link = row.match(/<a[^>]+href=["'](\/contests\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
            const start = row.match(/<td[^>]+data-col=["']start["'][^>]*>([\s\S]*?)<\/td>/i);
            const length = row.match(/<td[^>]+data-col=["']length["'][^>]*>([\s\S]*?)<\/td>/i);
            if (!link || !start) continue;
            const title = stripHtml(link[2]);
            const durationSeconds = length ? parseLength(stripHtml(length[1])) : null;
            const isUserCreated = /fa-user|glyphicon-other/i.test(row);
            const isLow = isUserCreated || LOW_VALUE_PATTERN.test(title)
                || (durationSeconds !== null && durationSeconds > 3 * 24 * 3600);
            const slug = link[1].split("/").filter(Boolean).pop();
            contests.push(createContest({
                id: "kattis-" + slug,
                platform: PLATFORM_NAMES.kattis,
                title,
                url: "https://open.kattis.com" + link[1],
                startTime: normalizeZoneTime(stripHtml(start[1])),
                durationSeconds,
                feeType: "unknown",
                contestKind: isLow ? "training" : "competitive-programming",
                importance: isLow ? "low" : (HIGH_VALUE_PATTERN.test(title) ? "high" : "normal"),
                sourceConfidence: "official-page",
                sourceUpdatedAt: now
            }, now));
        }
    });
    return contests.filter(Boolean);
}

export async function fetchKattisContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(CONTESTS_URL, {
        headers: { "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error("Kattis HTTP " + response.status);
    return parseKattisHtml(await response.text(), now);
}

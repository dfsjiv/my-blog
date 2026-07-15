import { createContest, decodeHtml, PLATFORM_NAMES } from "./normalize.mjs";

const CONTESTS_URL = "https://www.luogu.com.cn/contest/list?_contentOnly=1";

function contestArrayFromPayload(payload) {
    const roots = [
        payload,
        payload && payload.currentData,
        payload && payload.data,
        payload && payload.data && payload.data.currentData,
        payload && payload._feInjection,
        payload && payload._feInjection && payload._feInjection.currentData
    ].filter(Boolean);

    for (const root of roots) {
        const candidates = [
            root.contests,
            root.contests && root.contests.result,
            root.contestList,
            root.result
        ];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
            if (candidate && Array.isArray(candidate.result)) return candidate.result;
        }
    }
    return null;
}

function unixTime(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return number < 100000000000 ? number * 1000 : number;
}

export function parseLuoguPayload(payload, now = Date.now()) {
    const rows = contestArrayFromPayload(payload);
    if (!rows) throw new Error("Luogu contest data was not found");
    return rows.map((item) => createContest({
        id: `luogu-${item.id}`,
        platform: PLATFORM_NAMES.luogu,
        title: item.name || item.title,
        url: `https://www.luogu.com.cn/contest/${item.id}`,
        startTime: unixTime(item.startTime || item.start_time),
        endTime: unixTime(item.endTime || item.end_time),
        registrationDeadline: unixTime(item.registrationDeadline || item.registration_deadline),
        feeType: "unknown",
        rated: null,
        importance: /(?:月赛|公开赛|ICPC|CCPC|NOI|NOIP)/i.test(item.name || item.title || "") ? "high" : "normal",
        sourceConfidence: "official-api",
        sourceUpdatedAt: now
    }, now)).filter(Boolean);
}

function parsePayloadText(text) {
    const source = String(text || "").trim();
    if (source.startsWith("{")) return JSON.parse(source);
    const script = source.match(/<script[^>]+(?:id=["']lentille-context["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i);
    if (!script) throw new Error("Luogu response is not JSON");
    return JSON.parse(decodeHtml(script[1]));
}

export async function fetchLuoguContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(CONTESTS_URL, {
        redirect: "follow",
        headers: {
            "Accept": "application/json, text/html;q=0.9",
            "User-Agent": "ContestCenter/1.0",
            "x-lentille-request": "content-only"
        }
    });
    if (!response.ok) throw new Error(`Luogu HTTP ${response.status}`);
    return parseLuoguPayload(parsePayloadText(await response.text()), now);
}

import { createContest, stripHtml } from "./normalize.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /(20\d{2})\s*[\u5e74\-\/.]\s*(\d{1,2})\s*[\u6708\-\/.]\s*(\d{1,2})\s*\u65e5?/g;
const EVENT_PATTERN = /\u6bd4\u8d5b|\u7ade\u8d5b|\u521d\u8d5b|\u7701\u8d5b|\u56fd\u8d5b|\u51b3\u8d5b|\u9009\u62d4|\u62a5\u540d/;
const NON_EVENT_PATTERN = /\u83b7\u5956|\u540d\u5355|\u8bc1\u4e66|\u516c\u793a|\u9881\u5956|\u6559\u5e08|\u57f9\u8bad|\u7814\u4fee|\u6210\u7ee9/;

function responseFailed(response) {
    return !response || response.ok === false;
}

function chinaDateToIso(year, month, day, hour = 9) {
    const pad = (value) => String(value).padStart(2, "0");
    return new Date(
        `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:00:00+08:00`
    ).toISOString();
}

function phaseFromContext(context) {
    for (const phase of ["\u5168\u56fd\u603b\u51b3\u8d5b", "\u56fd\u8d5b", "\u7701\u8d5b", "\u521d\u8d5b", "\u9009\u62d4\u8d5b", "\u62a5\u540d"]) {
        if (context.includes(phase)) return phase;
    }
    return "\u6bd4\u8d5b";
}

export function parseOfficialEventText(text, config, now = Date.now()) {
    const source = stripHtml(text);
    const contests = [];
    const seenDates = new Set();
    let match;

    DATE_PATTERN.lastIndex = 0;
    while ((match = DATE_PATTERN.exec(source))) {
        const context = source.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100);
        if (!EVENT_PATTERN.test(context) || NON_EVENT_PATTERN.test(context)) continue;
        const startTime = chinaDateToIso(Number(match[1]), Number(match[2]), Number(match[3]));
        const start = Date.parse(startTime);
        if (start < now - DAY_MS || start > now + 400 * DAY_MS || seenDates.has(startTime)) continue;
        seenDates.add(startTime);
        const phase = phaseFromContext(context);
        const contest = createContest({
            id: `${config.idPrefix}-${startTime.slice(0, 10)}-${phase}`,
            platform: config.platform,
            title: `${config.title} ${phase}`,
            url: config.url,
            startTime,
            durationSeconds: config.durationSeconds || null,
            feeType: "unknown",
            rated: null,
            contestKind: "competitive-programming",
            importance: "high",
            sourceConfidence: "official-page"
        }, now);
        if (contest) contests.push(contest);
    }
    return contests;
}

export function parseLanqiaoPayload(payload, now = Date.now()) {
    const notices = Array.isArray(payload?.datalist) ? payload.datalist : [];
    const contests = [];
    notices.forEach((notice) => {
        const title = stripHtml(notice?.title);
        const synopsis = stripHtml(notice?.synopsis);
        if (!title.includes("\u84dd\u6865\u676f") || NON_EVENT_PATTERN.test(title)) return;
        contests.push(...parseOfficialEventText(`${title} ${synopsis}`, {
            idPrefix: `lanqiao-${notice.nnid || "notice"}`,
            platform: "\u84dd\u6865\u676f",
            title: title.replace(/\u5173\u4e8e|\u901a\u77e5/g, "").trim() || "\u84dd\u6865\u676f",
            url: notice?.nnid
                ? `https://dasai.lanqiao.cn/notices/${encodeURIComponent(notice.nnid)}/`
                : "https://dasai.lanqiao.cn/",
            durationSeconds: null
        }, now));
    });
    return contests;
}

export async function fetchLanqiaoCupContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(
        "https://www.guoxinlanqiao.com/api/news/find?status=1&project=dasai&progid=20&pageno=1&pagesize=60",
        { headers: { Accept: "application/json" } }
    );
    if (responseFailed(response)) throw new Error("Lanqiao official API request failed");
    return parseLanqiaoPayload(await response.json(), now);
}

export function parseRaicomPayload(payload, now = Date.now()) {
    const matches = Array.isArray(payload?.data) ? payload.data : [];
    return matches.map((item) => {
        const start = Number(item?.enrollstartdate);
        const end = Number(item?.enrollenddate);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < now - DAY_MS) return null;
        return createContest({
            id: `raicom-${item.id}`,
            platform: "\u777f\u6297",
            title: `${stripHtml(item.matchname) || "\u777f\u6297机器人开发者大赛"}\uff08\u62a5\u540d\u671f\uff09`,
            url: "https://www.raicom.com.cn/",
            startTime: new Date(start).toISOString(),
            endTime: new Date(end).toISOString(),
            registrationDeadline: new Date(end).toISOString(),
            feeType: "unknown",
            rated: null,
            contestKind: "competitive-programming",
            importance: "high",
            sourceConfidence: "official-api",
            sourceUpdatedAt: Number(item.modified) || Number(item.created) || now
        }, now);
    }).filter(Boolean);
}

export async function fetchRaicomContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl("https://service.raicom.com.cn/api/matches", {
        headers: { Accept: "application/json" }
    });
    if (responseFailed(response)) throw new Error("RAICOM official API request failed");
    return parseRaicomPayload(await response.json(), now);
}

async function fetchOfficialPage(fetchImpl, now, config) {
    const response = await fetchImpl(config.url, {
        headers: { Accept: "text/html,application/xhtml+xml" }
    });
    if (responseFailed(response)) throw new Error(`${config.platform} official page request failed`);
    return parseOfficialEventText(await response.text(), config, now);
}

export function fetchBaiduStarContests(fetchImpl = fetch, now = Date.now()) {
    return fetchOfficialPage(fetchImpl, now, {
        idPrefix: "baidu-star", platform: "\u767e\u5ea6\u4e4b\u661f", title: "\u767e\u5ea6\u4e4b\u661f\u7a0b\u5e8f\u8bbe\u8ba1\u5927\u8d5b",
        url: "https://star.baidu.com/", durationSeconds: null
    });
}

export function fetchChuanZhiCupContests(fetchImpl = fetch, now = Date.now()) {
    return fetchOfficialPage(fetchImpl, now, {
        idPrefix: "chuanzhi", platform: "\u4f20\u667a\u676f", title: "\u4f20\u667a\u676f\u5168\u56fd\u5927\u5b66\u751fIT\u6280\u80fd\u5927\u8d5b",
        url: "https://www.boxuegu.com/match/", durationSeconds: null
    });
}

export function fetchGpltContests(fetchImpl = fetch, now = Date.now()) {
    return fetchOfficialPage(fetchImpl, now, {
        idPrefix: "gplt", platform: "\u5929\u68af\u8d5b", title: "\u56e2\u4f53\u7a0b\u5e8f\u8bbe\u8ba1\u5929\u68af\u8d5b",
        url: "https://gplt.patest.cn/", durationSeconds: null
    });
}

export function fetchMatiCupContests(fetchImpl = fetch, now = Date.now()) {
    return fetchOfficialPage(fetchImpl, now, {
        idPrefix: "mati", platform: "\u7801\u8e44\u676f", title: "\u7801\u8e44\u676f\u5168\u56fd\u5927\u5b66\u751f\u7a0b\u5e8f\u8bbe\u8ba1\u5927\u8d5b",
        url: "https://www.matiji.net/exam/contest", durationSeconds: null
    });
}

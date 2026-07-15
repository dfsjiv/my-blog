export const PLATFORM_NAMES = Object.freeze({
    codeforces: "Codeforces",
    atcoder: "AtCoder",
    nowcoder: "牛客",
    luogu: "洛谷",
    leetcode: "LeetCode",
    codechef: "CodeChef",
    hackerrank: "HackerRank",
    dmoj: "DMOJ",
    kattis: "Kattis"
});

const CONTEST_KINDS = new Set([
    "competitive-programming", "training", "mirror", "hiring", "hackathon", "other"
]);
const IMPORTANCE_LEVELS = new Set(["high", "normal", "low"]);
const SOURCE_CONFIDENCE_LEVELS = new Set(["official-api", "official-page", "inferred"]);

export function toIsoTime(value) {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function fromUnixSeconds(value) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? toIsoTime(seconds * 1000) : null;
}

export function normalizeOffsetTime(value) {
    const source = String(value || "").trim();
    const normalized = source.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return toIsoTime(normalized);
}

export function getContestStatus(startTime, endTime, now = Date.now()) {
    const start = Date.parse(startTime);
    const end = endTime ? Date.parse(endTime) : NaN;
    if (!Number.isFinite(start)) return "finished";
    if (now < start) return "upcoming";
    if (!Number.isFinite(end) || now < end) return "running";
    return "finished";
}

export function createContest(input, now = Date.now()) {
    const startTime = toIsoTime(input.startTime);
    if (!startTime) return null;

    const duration = Number(input.durationSeconds);
    let durationSeconds = Number.isFinite(duration) && duration >= 0
        ? Math.round(duration)
        : null;
    let endTime = toIsoTime(input.endTime);
    if (!endTime && durationSeconds !== null) {
        endTime = toIsoTime(Date.parse(startTime) + durationSeconds * 1000);
    }
    if (endTime && durationSeconds === null) {
        durationSeconds = Math.max(0, Math.round((Date.parse(endTime) - Date.parse(startTime)) / 1000));
    }

    const feeType = ["free", "paid", "unknown"].includes(input.feeType)
        ? input.feeType
        : "unknown";
    const hasFeeAmount = input.feeAmount !== null
        && input.feeAmount !== undefined
        && input.feeAmount !== "";
    const amount = hasFeeAmount ? Number(input.feeAmount) : NaN;

    return {
        id: String(input.id),
        platform: String(input.platform),
        title: String(input.title || "未命名比赛").trim(),
        url: String(input.url),
        startTime,
        endTime,
        durationSeconds,
        registrationDeadline: toIsoTime(input.registrationDeadline),
        feeType,
        feeAmount: Number.isFinite(amount) ? amount : null,
        feeCurrency: input.feeCurrency ? String(input.feeCurrency) : null,
        feeUnit: input.feeUnit ? String(input.feeUnit) : null,
        rated: typeof input.rated === "boolean" ? input.rated : null,
        ratingRange: input.ratingRange ? String(input.ratingRange).trim() : null,
        contestKind: CONTEST_KINDS.has(input.contestKind) ? input.contestKind : "competitive-programming",
        importance: IMPORTANCE_LEVELS.has(input.importance) ? input.importance : "normal",
        sourceConfidence: SOURCE_CONFIDENCE_LEVELS.has(input.sourceConfidence)
            ? input.sourceConfidence
            : "official-page",
        status: getContestStatus(startTime, endTime, now),
        sourceUpdatedAt: toIsoTime(input.sourceUpdatedAt || now)
    };
}

export function sortContests(contests) {
    const order = { upcoming: 0, running: 1, finished: 2 };
    return contests.sort((left, right) => {
        const statusDifference = order[left.status] - order[right.status];
        if (statusDifference) return statusDifference;
        const leftStart = Date.parse(left.startTime);
        const rightStart = Date.parse(right.startTime);
        return left.status === "finished"
            ? rightStart - leftStart
            : leftStart - rightStart;
    });
}

export function decodeHtml(value) {
    return String(value || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

export function stripHtml(value) {
    return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
}

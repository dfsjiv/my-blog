import { createContest, decodeHtml, PLATFORM_NAMES, stripHtml } from "./normalize.mjs";

const CONTESTS_URL = "https://ac.nowcoder.com/acm/contest/vip-index";

function parseContestData(attribute) {
    let decoded = String(attribute || "");
    for (let index = 0; index < 3 && /&(?:amp;)?quot;/.test(decoded); index += 1) {
        decoded = decodeHtml(decoded);
    }
    return JSON.parse(decoded);
}

export function parseNowCoderHtml(html, now = Date.now()) {
    const contests = [];
    const pattern = /data-json="([^"]+)"/gi;
    let match;
    while ((match = pattern.exec(String(html))) !== null) {
        let item;
        try {
            item = parseContestData(match[1]);
        } catch (error) {
            continue;
        }
        if (!item || !item.contestId || !item.contestStartTime) continue;

        const settings = item.settingInfo || {};
        const explicitlyFree = settings.needCharge === false;
        const ratingRange = Number.isFinite(Number(settings.ratingUpperLimit))
            ? `0 - ${Number(settings.ratingUpperLimit)}`
            : null;
        const contest = createContest({
            id: `nowcoder-${item.contestId}`,
            platform: PLATFORM_NAMES.nowcoder,
            title: item.contestName,
            url: `https://ac.nowcoder.com/acm/contest/${item.contestId}`,
            startTime: Number(item.contestStartTime),
            endTime: Number(item.contestEndTime),
            durationSeconds: Number(item.contestDuration) / 1000,
            registrationDeadline: Number(item.contestSignUpEndTime),
            feeType: explicitlyFree ? "free" : "unknown",
            feeAmount: explicitlyFree ? 0 : null,
            rated: settings.needRatingUpperLimit === true ? true : null,
            ratingRange,
            sourceUpdatedAt: now
        }, now);
        if (contest) {
            Object.defineProperty(contest, "needsFeeLookup", {
                value: settings.needCharge === true,
                enumerable: false
            });
            contests.push(contest);
        }
    }
    if (!contests.length) throw new Error("NowCoder contest data was not found");
    return contests;
}

export async function fetchNowCoderContests(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(CONTESTS_URL, {
        headers: { "User-Agent": "ContestCenter/1.0" }
    });
    if (!response.ok) throw new Error(`NowCoder HTTP ${response.status}`);
    const contests = parseNowCoderHtml(await response.text(), now);
    const paidUpcoming = contests
        .filter((contest) => contest.needsFeeLookup && contest.status !== "finished")
        .slice(0, 6);

    await Promise.all(paidUpcoming.map(async (contest) => {
        try {
            const detailResponse = await fetchImpl(contest.url, {
                headers: { "User-Agent": "ContestCenter/1.0" }
            });
            if (!detailResponse.ok) return;
            const plainText = stripHtml(await detailResponse.text())
                .replace(/\\[nrt]/g, " ")
                .replace(/\s+/g, " ");
            const fee = plainText.match(/报名费用\s*[：:]?\s*(\d+(?:\.\d+)?)\s*元\s*[/／]\s*(队|人)/);
            if (!fee) return;
            contest.feeType = "paid";
            contest.feeAmount = Number(fee[1]);
            contest.feeCurrency = "CNY";
            contest.feeUnit = fee[2] === "队" ? "team" : "person";
        } catch (error) {
            // Fee details are optional. Unknown is safer than inferring a price.
        }
    }));

    return contests;
}

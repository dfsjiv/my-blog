import { createContest } from "./normalize.mjs";

const ICPC_ASIA_EAST_URL = "https://icpc.global/regionals/finder/AEC";

const ASIA_EAST_SITES = [
    ["nanchang", "The 2026 ICPC Asia Nanchang Regional Contest", "Nanchang"],
    ["xian", "The 2026 ICPC Asia Xi'an Regional Contest", "Xi'an"],
    ["wuhan", "The 2026 ICPC Asia Wuhan Regional Contest", "Wuhan"],
    ["nanjing", "The 2026 ICPC Asia Nanjing Regional Contest", "Nanjing"],
    ["chengdu", "The 2026 ICPC Asia Chengdu Regional Contest", "Chengdu"],
    ["hong-kong", "The 2026 ICPC Asia Hong Kong Regional Contest", "Hong Kong"],
    ["shenyang", "The 2026 ICPC Asia Shenyang Regional Contest", "Shenyang"],
    ["shanghai", "The 2026 ICPC Asia Shanghai Regional Contest", "Shanghai"],
];

const DATED_EVENTS = [
    {
        id: "icpc-asia-west-preliminary-2026",
        title: "The 2026 ICPC Asia West Preliminary Contests",
        url: "https://icpc.global/regionals/results",
        startTime: "2026-10-03T06:30:00+05:30",
        durationSeconds: 3 * 60 * 60,
        eventMode: "online",
        location: "Asia West",
    },
    {
        id: "icpc-seoul-preliminary-2026",
        title: "2026 ICPC Asia Seoul National Preliminary Contest",
        url: "https://icpckorea.org/",
        startTime: "2026-10-16T09:00:00+09:00",
        endTime: "2026-10-17T18:00:00+09:00",
        eventMode: "online",
        location: "South Korea",
    },
    {
        id: "icpc-yokohama-2026",
        title: "The 2026 ICPC Asia Yokohama Regional Contest",
        url: "https://icpc.jp/2026/",
        startTime: "2026-12-06T09:30:00+09:00",
        durationSeconds: 5 * 60 * 60,
        eventMode: "onsite",
        location: "Yokohama",
    },
    {
        id: "icpc-chennai-2026",
        title: "The 2026 ICPC Asia Chennai Regional Contest",
        url: "https://icpc.global/regionals/finder/ICPC-Asia-Chennai",
        startTime: "2026-12-11T12:00:00+05:30",
        endTime: "2026-12-12T12:00:00+05:30",
        eventMode: "onsite",
        location: "Chennai",
    },
    {
        id: "icpc-yunlin-2026",
        title: "The 2026 ICPC Asia Yunlin Regional Contest",
        url: "https://www.icpc.tw/2026/",
        startTime: "2026-12-13T09:30:00+08:00",
        durationSeconds: 5 * 60 * 60,
        eventMode: "onsite",
        location: "Yunlin",
    },
    {
        id: "icpc-kanpur-2026",
        title: "The 2026 ICPC Asia West Kanpur Multi Site Regional Contest",
        url: "https://icpc.global/regionals/results",
        startTime: "2026-12-22T09:00:00+05:30",
        durationSeconds: 5 * 60 * 60,
        eventMode: "onsite",
        location: "Kanpur",
    },
    {
        id: "icpc-mathura-2026",
        title: "The 2026 ICPC Asia West Mathura Regional Contest",
        url: "https://mathuraicpc.in/",
        startTime: "2026-12-27T09:00:00+05:30",
        endTime: "2026-12-28T18:00:00+05:30",
        eventMode: "onsite",
        location: "Mathura",
    },
];

export function getOfficialIcpcContests(now = Date.now()) {
    const tbaContests = ASIA_EAST_SITES.map(([id, title, location]) => createContest({
        id: `icpc-asia-east-${id}-2026`,
        platform: "ICPC",
        title,
        url: ICPC_ASIA_EAST_URL,
        dateTba: true,
        series: "ICPC",
        eventMode: "onsite",
        location,
        importance: "high",
        sourceConfidence: "official-page",
    }, now));

    const datedContests = DATED_EVENTS.map((event) => createContest({
        ...event,
        platform: "ICPC",
        series: "ICPC",
        importance: "high",
        sourceConfidence: "official-page",
    }, now));

    return [...datedContests, ...tbaContests].filter(Boolean);
}

export async function fetchOfficialIcpcContests(_fetchImpl = fetch, now = Date.now()) {
    return getOfficialIcpcContests(now);
}

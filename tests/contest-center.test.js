const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = path.resolve(__dirname, '..');

(async function run() {
  const normalize = await import(pathToFileURL(path.join(
    rootDir,
    'functions/lib/contests/normalize.mjs'
  )));
  const atcoder = await import(pathToFileURL(path.join(
    rootDir,
    'functions/lib/contests/atcoder.mjs'
  )));
  const nowcoder = await import(pathToFileURL(path.join(
    rootDir,
    'functions/lib/contests/nowcoder.mjs'
  )));
  const luogu = await import(pathToFileURL(path.join(
    rootDir,
    'functions/lib/contests/luogu.mjs'
  )));
  const leetcode = await import(pathToFileURL(path.join(rootDir, 'functions/lib/contests/leetcode.mjs')));
  const codechef = await import(pathToFileURL(path.join(rootDir, 'functions/lib/contests/codechef.mjs')));
  const hackerrank = await import(pathToFileURL(path.join(rootDir, 'functions/lib/contests/hackerrank.mjs')));
  const dmoj = await import(pathToFileURL(path.join(rootDir, 'functions/lib/contests/dmoj.mjs')));
  const kattis = await import(pathToFileURL(path.join(rootDir, 'functions/lib/contests/kattis.mjs')));
  const chinaEvents = await import(pathToFileURL(path.join(rootDir, 'functions/lib/contests/china-events.mjs')));

  const normalized = normalize.createContest({
    id: 'test-1',
    platform: 'Test',
    title: 'Contest',
    url: 'https://example.com/contest',
    startTime: '2026-07-18T12:00:00Z',
    durationSeconds: 7200,
    feeType: 'unknown',
    feeAmount: null,
  }, Date.parse('2026-07-15T00:00:00Z'));
  assert.strictEqual(normalized.endTime, '2026-07-18T14:00:00.000Z');
  assert.strictEqual(normalized.feeAmount, null);
  assert.strictEqual(normalized.status, 'upcoming');
  assert.strictEqual(normalized.contestKind, 'competitive-programming');
  assert.strictEqual(normalized.importance, 'normal');
  assert.strictEqual(normalized.sourceConfidence, 'official-page');

  const atCoderHtml = `
    <div id="contest-table-upcoming"><table><tbody><tr>
      <td><time>2026-07-18 21:00:00+0900</time></td>
      <td><a href="/contests/abc467">AtCoder Beginner Contest 467</a></td>
      <td>01:40</td><td>- 1999</td>
    </tr></tbody></table></div>`;
  const atCoderContests = atcoder.parseAtCoderHtml(atCoderHtml);
  assert.strictEqual(atCoderContests.length, 1);
  assert.strictEqual(atCoderContests[0].startTime, '2026-07-18T12:00:00.000Z');
  assert.strictEqual(atCoderContests[0].durationSeconds, 6000);
  assert.strictEqual(atCoderContests[0].feeType, 'unknown');

  const nowCoderData = {
    contestId: 137561,
    contestName: '牛客周赛 Round 153',
    contestStartTime: Date.parse('2026-07-19T11:00:00Z'),
    contestEndTime: Date.parse('2026-07-19T13:00:00Z'),
    contestDuration: 7200000,
    contestSignUpEndTime: Date.parse('2026-07-19T13:00:00Z'),
    settingInfo: { needCharge: false, needRatingUpperLimit: true, ratingUpperLimit: 1599 },
  };
  const encoded = JSON.stringify(nowCoderData).replace(/"/g, '&amp;quot;');
  const nowCoderContests = nowcoder.parseNowCoderHtml(`<div data-json="${encoded}"></div>`);
  assert.strictEqual(nowCoderContests.length, 1);
  assert.strictEqual(nowCoderContests[0].feeType, 'free');
  assert.strictEqual(nowCoderContests[0].feeAmount, 0);
  assert.strictEqual(nowCoderContests[0].ratingRange, '0 - 1599');

  const paidData = {
    ...nowCoderData,
    contestId: 133876,
    contestName: '牛客暑期多校',
    settingInfo: { needCharge: true },
  };
  const paidIndexHtml = `<div data-json="${JSON.stringify(paidData).replace(/"/g, '&amp;quot;')}"></div>`;
  const paidResponses = [
    { ok: true, async text() { return paidIndexHtml; } },
    { ok: true, async text() { return '<div>报名费用：<span>800元/队</span></div>'; } },
  ];
  const paidContests = await nowcoder.fetchNowCoderContests(async () => paidResponses.shift());
  assert.strictEqual(paidContests[0].feeType, 'paid');
  assert.strictEqual(paidContests[0].feeAmount, 800);
  assert.strictEqual(paidContests[0].feeUnit, 'team');

  const luoguContests = luogu.parseLuoguPayload({
    currentData: {
      contests: {
        result: [{ id: 100, name: '洛谷月赛', startTime: 1784376000, endTime: 1784390400 }],
      },
    },
  });
  assert.strictEqual(luoguContests.length, 1);
  assert.strictEqual(luoguContests[0].id, 'luogu-100');
  assert.strictEqual(luoguContests[0].feeType, 'unknown');

  const leetCodeContests = leetcode.parseLeetCodePayload({
    data: { contestUpcomingContests: [
      { title: 'Weekly Contest 512', titleSlug: 'weekly-contest-512', startTime: 1784451600, duration: 5400 },
      { title: 'LeetCode Live Event', titleSlug: 'live-event', startTime: 1784451600, duration: 5400 },
    ] },
  }, Date.parse('2026-07-15T00:00:00Z'));
  assert.strictEqual(leetCodeContests.length, 1);
  assert.strictEqual(leetCodeContests[0].importance, 'high');

  const codeChefContests = codechef.parseCodeChefPayload({
    status: 'success',
    present_contests: [],
    future_contests: [{
      contest_code: 'START247',
      contest_name: 'Starters 247 (Rated)',
      contest_start_date_iso: '2026-07-15T20:00:00+05:30',
      contest_end_date_iso: '2026-07-15T22:00:00+05:30',
      contest_duration: '120',
    }],
  }, Date.parse('2026-07-15T00:00:00Z'));
  assert.strictEqual(codeChefContests[0].importance, 'high');
  assert.strictEqual(codeChefContests[0].durationSeconds, 7200);

  const hackerRankContests = hackerrank.parseHackerRankPayload({
    models: [
      { id: 1, name: 'HourRank 99', slug: 'hourrank-99', epoch_starttime: 1784500000, epoch_endtime: 1784503600, rated: true },
      { id: 2, name: 'Company Hiring Challenge', slug: 'hiring', epoch_starttime: 1784500000, epoch_endtime: 1784503600 },
      { id: 3, name: 'ProjectEuler+', slug: 'projecteuler', epoch_starttime: 1404747480, epoch_endtime: 1817441090 },
    ],
  }, Date.parse('2026-07-15T00:00:00Z'));
  assert.strictEqual(hackerRankContests.length, 1);
  assert.strictEqual(hackerRankContests[0].contestKind, 'competitive-programming');

  const dmojContests = dmoj.parseDmojHtml(
    '<section id="upcoming-contests"><table><tr>'
      + '<td><a href="/contest/test-round">DMOJ Test Round</a></td>'
      + '<td><time datetime="2026-07-20T12:00:00Z"></time></td>'
      + '<td><time datetime="2026-07-20T14:00:00Z"></time></td>'
      + '</tr></table></section>',
    Date.parse('2026-07-15T00:00:00Z')
  );
  assert.strictEqual(dmojContests.length, 1);

  const kattisContests = kattis.parseKattisHtml(
    '<table id="table-contests-upcoming"><tr>'
      + '<td><div class="contest-list-name"><a href="/contests/icpc-open">ICPC Open Contest</a></div></td>'
      + '<td data-col="start">2026-07-20 12:00:00 CEST</td><td data-col="length">05:00:00</td>'
      + '</tr><tr><td><span class="fas fa-user"></span>'
      + '<a href="/contests/class-practice">Class Practice</a></td>'
      + '<td data-col="start">2026-07-21 12:00:00 CEST</td><td data-col="length">168:00:00</td>'
      + '</tr></table>',
    Date.parse('2026-07-15T00:00:00Z')
  );
  assert.strictEqual(kattisContests[0].importance, 'high');
  assert.strictEqual(kattisContests[1].importance, 'low');
  assert.strictEqual(kattisContests[1].contestKind, 'training');

  const officialPageContests = chinaEvents.parseOfficialEventText(
    '<main>2026年10月18日举行程序设计竞赛全国总决赛</main>',
    {
      idPrefix: 'fixture', platform: '天梯赛', title: '团体程序设计天梯赛',
      url: 'https://gplt.patest.cn/', durationSeconds: 10800,
    },
    Date.parse('2026-07-15T00:00:00Z')
  );
  assert.strictEqual(officialPageContests.length, 1);
  assert.strictEqual(officialPageContests[0].platform, '天梯赛');
  assert.strictEqual(officialPageContests[0].importance, 'high');

  const lanqiaoContests = chinaEvents.parseLanqiaoPayload({
    datalist: [{
      nnid: 2001,
      title: '关于第十八届蓝桥杯省赛比赛时间的通知',
      synopsis: '软件赛定于2026年11月22日举行。',
    }],
  }, Date.parse('2026-07-15T00:00:00Z'));
  assert.strictEqual(lanqiaoContests.length, 1);
  assert.strictEqual(lanqiaoContests[0].platform, '蓝桥杯');
  assert.match(lanqiaoContests[0].url, /notices\/2001/);

  const raicomContests = chinaEvents.parseRaicomPayload({
    data: [{
      id: 99,
      matchname: '2026睿抗机器人开发者大赛',
      enrollstartdate: Date.parse('2026-03-20T00:00:00+08:00'),
      enrollenddate: Date.parse('2026-11-30T00:00:00+08:00'),
      created: Date.parse('2026-03-01T00:00:00+08:00'),
    }],
  }, Date.parse('2026-07-15T00:00:00Z'));
  assert.strictEqual(raicomContests.length, 1);
  assert.strictEqual(raicomContests[0].status, 'running');
  assert.strictEqual(raicomContests[0].sourceConfidence, 'official-api');

  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(rootDir, 'contest-center.js'), 'utf8');
  const apiRoute = fs.readFileSync(path.join(rootDir, 'functions/api/[[path]].js'), 'utf8');
  assert.match(indexHtml, /id="contestDesktopIcon"/);
  assert.match(indexHtml, /id="contestWindow"/);
  assert.match(indexHtml, /id="contestTaskbarButton"/);
  assert.match(indexHtml, /data-contest-view="timeline"/);
  assert.match(indexHtml, /id="contestCalendarView"/);
  assert.match(indexHtml, /id="contestSearch"/);
  assert.match(frontend, /webos_contest_favorites/);
  assert.match(frontend, /webos_contest_reminders/);
  assert.match(frontend, /fetch\('\/api\/contests'/);
  assert.doesNotMatch(frontend, /eval\(|new Function/);
  assert.match(frontend, /PLATFORM_ORDER = \[[\s\S]*'Codeforces'[\s\S]*'码蹄杯'/);
  assert.match(apiRoute, /url\.pathname === "\/api\/contests"/);

  console.log('contest-center tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

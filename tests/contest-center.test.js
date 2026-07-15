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

  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(rootDir, 'contest-center.js'), 'utf8');
  const apiRoute = fs.readFileSync(path.join(rootDir, 'functions/api/[[path]].js'), 'utf8');
  assert.match(indexHtml, /id="contestDesktopIcon"/);
  assert.match(indexHtml, /id="contestWindow"/);
  assert.match(indexHtml, /id="contestTaskbarButton"/);
  assert.match(frontend, /webos_contest_favorites/);
  assert.match(frontend, /webos_contest_reminders/);
  assert.match(frontend, /fetch\('\/api\/contests'/);
  assert.doesNotMatch(frontend, /eval\(|new Function/);
  assert.match(apiRoute, /url\.pathname === "\/api\/contests"/);

  console.log('contest-center tests passed');
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

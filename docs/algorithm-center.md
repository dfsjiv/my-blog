# Contest and Algorithm Center — first iteration

## Scope

- Blog navigation: Contest Center → Find Contests / Algorithm Center.
- Contest query adds yukicoder and Topcoder algorithm/Marathon events, includes active AtCoder events, and exposes platform filtering and individual source availability.
- Algorithm Center supports ordinary members and administrators, with one Codeforces handle and one AtCoder handle per blog user. Visitors must sign in through the existing blog login.
- Handles are self-declared public-profile associations, **not verified ownership**. Platform passwords, private source code and OAuth credentials are never collected. CF/AtCoder use public records; the additional four platforms accept an optional, one-request Cookie, never persisted.

## Database / rollout

Run `migrations/0010_add_algorithm_center.sql` against the existing D1 `DB` binding before deploying. The migration is idempotent and only adds two tables and an index. No existing articles, comments, invitations, sessions or user roles are altered. If the migration has not run, only Algorithm Center returns `MIGRATION_REQUIRED`; existing blog APIs remain independent.

- `algorithm_accounts`: scoped to a blog user; profile, sync cursor, completeness flag and sync lease.
- `algorithm_submissions`: deduplicated by platform account + submission ID; only public summary metadata is retained.
- Unlink removes only that account's locally cached submissions and association. The external account is untouched.

## Synchronization

`GET /api/algorithm/dashboard`, `POST /api/algorithm/accounts`, `POST /api/algorithm/accounts/:id/sync`, `DELETE /api/algorithm/accounts/:id` all authenticate via the existing bearer session and constrain records to the current user, including administrators. Responses are `private, no-store`.

- Codeforces: 1,000 submissions per page, API offset cursor; initial import is newest-first. Refresh detects a latest-page gap and reopens historical import.
- AtCoder Problems: 500 submissions per page, oldest-first timestamp cursor. Inclusive timestamp + upsert avoids loss at page boundaries; a stalled boundary fails visibly rather than silently skipping records.
- Each successful sync has a 30-second cooldown, bounded upstream timeouts, and an atomic 90-second sync lease. Optional rating/difficulty failures do not discard submissions. Failed pages do not advance the cursor; retrying is idempotent.
- At most 20,000 saved submissions per linked platform account. Reaching the limit is explicitly shown as partial coverage, never complete. This first iteration requires users to request subsequent pages manually.
- Providers can lag, hide records, throttle or change endpoints. History-complete means all available public pages were imported, not that every submission ever made is available.

## Analysis definitions

- Unique solves: one accepted problem per platform and problem key. Same problem mirrored on different platforms is not cross-platform deduplicated.
- Acceptance rate: accepted submissions / judged submissions; pending/testing submissions are excluded.
- First-try solve rate: solved problems whose earliest available submission was accepted / solved problems. Incomplete historical coverage can bias this, and is visibly disclosed.
- 7/30-day progress and monthly trends use the first recorded acceptance, not repeated accepted submissions. Activity and streaks use Asia/Shanghai dates; a current streak may end yesterday if today has no practice yet.
- Platform difficulty distributions are separate. Codeforces uses published problem ratings; AtCoder uses AtCoder Problems estimated difficulty and its low-rating conversion. Missing values remain unknown, not zero.
- Topics use Codeforces tags only. One problem may count in multiple tags. Topic completion uses unique solved / attempted problems. No invented AtCoder topic classifications or composite ability score.
- Weak-topic suggestions require at least three attempted problems and <70% completion. Stable-topic suggestions require at least five solved problems and ≥80% completion. These are transparent practice heuristics, not standardized ability assessments.
- Ratings retain the latest 100 data points; the UI shows the latest 10 and the provider's total rated-contest count. AtCoder heuristic contests are excluded from algorithm rating analysis.

## One-time Cookie sync — four additional platforms

Apply `migrations/0011_add_algorithm_external_snapshots.sql` to the existing DB binding before deployment. It only creates `algorithm_external_accounts`; it does not rebuild the older constrained accounts table or change existing article/comment/auth data. Missing migration affects only the additional-platform panel.

- Endpoints: `GET /api/algorithm/external/dashboard`, `POST /api/algorithm/external/sync` with `{platform, handle, cookie?}`, `DELETE /api/algorithm/external/accounts/:id`. Existing session and per-user ownership checks apply, including administrators.
- Each user has at most one association per additional platform. Initial failed sync keeps a reserved, unsynced association with visible retry/unlink actions. Changing the handle requires unlinking. Sync uses a 90-second atomic lease and 30-second successful-sync cooldown.
- Cookie is optional. Public data is tried without it. An entered Cookie is used only within that request, with exact hard-coded HTTPS provider endpoints, `redirect: manual`, no shared cache, no request-body/error logging and no raw provider response persistence. Only normalized numeric statistics and enumerated category names are saved. Private source code is never requested.
- Input clears immediately on submit, after success/failure, on platform change, page hide, route abort and account change. The backend clears its references in `finally`. JavaScript garbage collection is not guaranteed physical memory erasure. Browser extensions, network tooling and independently configured infrastructure logging are outside this application-level retention guarantee; do not paste real credentials into test tools or chat.
- Credentials cannot support automatic background sync because they are not retained. To sync cookie-protected data again, the user must re-enter a valid Cookie. Luogu and LeetCode reject expired/mismatched cookies when current-user identity is available; VJudge/Nowcoder associations remain self-declared rather than ownership verified.
- Request bodies: at most 12 KiB, Cookie at most 8,192 printable ASCII characters in `name=value; ...` format. Upstream responses are bounded to 2 MiB and 15 seconds per request. Captchas, anti-bot restrictions and private statistics are not bypassed. Failed/changed responses preserve the last successful snapshot.

| Platform | Account input | Stored statistics / limitations |
| --- | --- | --- |
| VJudge | Username | Unique solved/attempted OJ problem IDs, grouped by source OJ; only records submitted through VJudge. Lists are checked against header counts to reject hidden/truncated data. |
| Luogu | Numeric UID | Profile passed/submitted **problem** counts; submitted problems are not submission attempts. Hidden counts fail visibly. Uses the accessible `www.luogu.com` alternate domain directly, never by forwarding a redirect. |
| Nowcoder | Numeric UID | Coding-practice solved problems, challenged problems and submissions. This is practice-coding coverage, not a claim of all contest history. |
| LeetCode China | Profile slug | Current progress by Easy/Medium/Hard; solved + failed problem counts. Submission attempts are unknown, not inferred from problem counts. International `leetcode.com` is not included. |

These site-owned page/GraphQL interfaces are not guaranteed stable public APIs. They were read-only probed on 2026-10-11 using public demo handles. Real signed-in Cookie flows require user verification; no real Cookie was collected during development. New snapshots are not mixed into CF/AtCoder submission calendars or acceptance metrics. A difference between the last two snapshot solve counts is shown as a count change, not a fabricated daily first-solve count. Cross-platform mirrored problems remain separate.

## Reference sources

- [Codeforces official API methods](https://codeforces.com/apiHelp/methods)
- [AtCoder public contest listing](https://atcoder.jp/contests/?lang=en)
- [AtCoder Problems maintainer API documentation](https://github.com/kenkoooo/AtCoderProblems/blob/main/doc/api.md) — unofficial submissions and estimated difficulty, not an official AtCoder API.
- [yukicoder official API](https://yukicoder.me/api/v1/contest/future)
- [Topcoder official challenge API implementation](https://github.com/topcoder-platform/challenge-api-v6)
- [VJudge profile](https://vjudge.net/user/tourist) — current site embeds `profile-header-data` and serves `/user/solveDetail/:handle`.
- [Luogu public profile](https://www.luogu.com/user/2) — current `lentille-context` profile counts.
- [Nowcoder coding practice profile](https://ac.nowcoder.com/acm/contest/profile/733965206/practice-coding) — labelled problem/submission totals.
- [LeetCode China](https://leetcode.cn/) — own `/graphql/` profile progress queries.

## Verification

Run `npm test`. The added tests cover isolated/additive migration, normal-user access, session checks, cross-user rejection, duplicate bindings, idempotent synchronization, upstream failures, locking, cursor boundaries, time-zone/deduplication analysis, separate rating scales, and new contest adapters. Synthetic UI previews and diagnostic assets belong in the untracked `output/` directory and must not be deployed or committed.

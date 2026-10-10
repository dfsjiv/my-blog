# Contest and Algorithm Center — first iteration

## Scope

- Blog navigation: Contest Center → Find Contests / Algorithm Center.
- Contest query adds yukicoder and Topcoder algorithm/Marathon events, includes active AtCoder events, and exposes platform filtering and individual source availability.
- Algorithm Center supports ordinary members and administrators, with one Codeforces handle and one AtCoder handle per blog user. Visitors must sign in through the existing blog login.
- Handles are self-declared public-profile associations, **not verified ownership**. No platform passwords, cookies, private submission contents or OAuth credentials are collected.

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

## Reference sources

- [Codeforces official API methods](https://codeforces.com/apiHelp/methods)
- [AtCoder public contest listing](https://atcoder.jp/contests/?lang=en)
- [AtCoder Problems maintainer API documentation](https://github.com/kenkoooo/AtCoderProblems/blob/main/doc/api.md) — unofficial submissions and estimated difficulty, not an official AtCoder API.
- [yukicoder official API](https://yukicoder.me/api/v1/contest/future)
- [Topcoder official challenge API implementation](https://github.com/topcoder-platform/challenge-api-v6)

## Verification

Run `npm test`. The added tests cover isolated/additive migration, normal-user access, session checks, cross-user rejection, duplicate bindings, idempotent synchronization, upstream failures, locking, cursor boundaries, time-zone/deduplication analysis, separate rating scales, and new contest adapters. Synthetic UI previews and diagnostic assets belong in the untracked `output/` directory and must not be deployed or committed.

# Database capacity check — 2026-10-11 (Asia/Shanghai)

## Observed database state

Cloudflare D1 `blog-db` dashboard currently reports **401 kB** storage used. Dashboard metrics can lag recent schema changes. Queries were run read-only except for the additive migration 0011, which successfully created `algorithm_external_accounts`. No existing rows or tables were removed or rewritten.

| Data | Observed records |
| --- | ---: |
| Users | 5 |
| `knowledge_posts` | 17 |
| Legacy `articles` | 2 |
| Article comments | 2 |
| Existing algorithm associations | 1 |
| Existing algorithm submissions | 221 |
| Additional-platform associations | 0 (new table) |
| Chat messages | 17 |

Article table counts include all statuses, not necessarily distinct published posts; legacy content may have migrated equivalents. The measured `knowledge_posts.content_markdown` payload totals **47,828 bytes**, and submission `problem_json` payload totals **33,702 bytes** (mean **152.5 bytes**). These payload measurements exclude other columns, indexes, SQLite pages and metadata; they must not be used as total database size.

## What grows with this feature

- The four new platforms each keep only the latest normalized statistical snapshot per blog user, plus the previous solve count and sync metadata. Repeated syncs update the same row, not an ever-growing submission/history archive. No Cookie columns, passwords, raw pages or source code are stored.
- Preliminary budgeting allowance: **4–20 kB per user for all four new snapshots**, including ordinary row/index overhead and variation in VJudge OJ groups. This is an estimate, not a measured production average. 1,000 such users would add roughly **4–20 MB**, excluding articles, comments and CF/AtCoder history. Recalculate from actual D1 storage after representative usage.
- Existing CF/AtCoder are different: each account can save up to 20,000 individual submissions (40,000 across both platforms). A conservative allowance is **15–35 MB per user if both histories reach the cap**, depending on metadata/index sizes. Heavy history users, not Cookie snapshots, will dominate storage. This estimate is not a guaranteed limit or permission to import every user's cap.
- Uploaded image binaries use the existing `KNOWLEDGE_IMAGES` object-storage binding, not article SQL text. Budget image storage separately; this check does not establish the current object-store usage or billing plan.

## Cloudflare limits and budget distinction

This is **persistent storage**, not a configurable database RAM allocation. D1 bills reads, writes and stored bytes; app execution memory/CPU is a separate Workers concern. Do not infer an account's subscription from small usage; the current plan was not verified in this check.

According to the official documentation checked on this date:

- Workers Free: **500 MB per D1 database**, **5 GB across the account**, 5 million rows read/day and 100,000 rows written/day. Current displayed 401 kB is approximately **0.08%** of the 500 MB single-database limit.
- Workers Paid: **10 GB per database**. D1 includes the first 5 GB of total storage, with additional storage at **USD 0.75/GB-month**, separate from the Workers subscription and query overages.
- Free-tier read/write limits can fail before storage is full. Account and submission indexes reduce unnecessary scans; detailed CF/AtCoder dashboards still read the user's imported history and should be pre-aggregated if active users grow substantially.
- Retain a storage safety margin for the rest of the blog. A practical initial alert threshold is 70% of the applicable single-database cap; this is a recommendation, not an alert installed by this change.

Sources: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

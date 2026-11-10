# 臻写代码 · Zhen Codes

[中文](README.md) · [English](README.en.md)

A personal blog and knowledge site for code, notes, algorithm write-ups, and small interactive tools.

**Visit: [lilinzheng.top](https://lilinzheng.top/)**

## Features

- **Reading and discovery:** categories, tags, archives, site search, featured articles, RSS, and article permalinks.
- **Writing:** Markdown and rich-text editing, `.md` imports, LaTeX math, code copying, drafts, and portable article backups and exports.
- **Post presentation:** animated card styles, cover cropping, and appearance previews.
- **Personalization:** light/dark modes, custom full color palettes, rotating backgrounds, avatar cropping, and nicknames.
- **Reading tools:** local bookmarks and progress, typography controls, focus mode, image zoom, and print layouts.
- **Algorithms and contests:** aggregated practice statistics, topic/difficulty analysis, charts, and contest discovery.
- **Other spaces:** a Web OS-style desktop, chat, optional AI chat, and mini games.

Some features require an account, administrator access, or configured backend services. Reading records, bookmarks, and appearance preferences stay in the current browser. Platform Cookies are used only for the current synchronization request and are not persisted. See the [algorithm center documentation](docs/algorithm-center.md) for coverage and statistical definitions.

## Roadmap

Last updated **2026-11-10**. All items below are planned work, organized into phases. Update their status and link the relevant PR or commit when completed. Scope may change after validation; no release dates are committed yet.

Preserve the established homepage, opening animation, grid background, and post styles. Explain proposed visual changes before implementation. Assess capacity, retention, and backups before adding stored data.

| Phase | Status | Item | Planned outcome and acceptance criteria | Database and storage impact |
| --- | --- | --- | --- | --- |
| Phase 1 | Planned | First-visit loading | Measure cold-start requests and time until the page is usable; enter the site promptly once content is ready, reducing delays from slow images and noncritical resources; compare results before and after. | No new tables expected. |
| Phase 1 | Planned | Automated browser checks | Add CI browser checks for the homepage, article reading, writing previews, mobile layouts, and light/dark themes, using local fixtures without production writes. | No new tables. |
| Phase 2 | Planned | Import Markdown with local images | Accept Markdown with accompanying images or a ZIP archive; resolve relative paths, preview uploads, report missing images, and respect existing account upload limits. | Reuse existing upload APIs; additional images count toward R2 storage. |
| Phase 2 | Planned | Article revision history | Extend existing draft backups, edit conflict detection, and deleted-post recovery with revision lists, diffs, and restoration; bound revision counts and total storage. | Revision storage expected; assess D1 capacity before implementation. |
| Phase 3 | Planned | Algorithm progress history | Compare weekly and monthly progress with explicit platform coverage, metric definitions, and update times; distinguish snapshot changes from submission-based trends and avoid ability claims from insufficient data. | Bounded historical snapshots expected; Cookies remain transient and VJudge stays excluded. |
| Phase 3 | Planned | Article series and learning paths | Group and manually order articles into series, with a series index and previous/next navigation, retaining existing post styles. | Series and article association data expected. |
| Maintenance | Planned | Complete installation and recovery documentation | Document fresh database initialization, configuration examples, D1/image backups, and recovery; verify fresh installation and recovery in an isolated test environment. | Provide foundational schemas for new sites; do not rebuild the existing production database in place. |
| Optional | Planned | Cross-device reading synchronization | Let signed-in users opt into syncing reading lists and progress, with conflict handling and an option to disable sync; retain local-only guest records. | User-scoped records and database reads/writes expected; do not upload local history by default. |

Suggested order: finish Phase 1, then Markdown/image import and revision history, followed by algorithm progress history and article series. Installation and backup documentation can proceed between phases. Decide on cross-device synchronization after assessing demand and capacity.

Status convention: **Planned → In progress → Completed**; optional work may also be marked **Deferred**. These statuses describe future work; existing features are listed above.

## Stack and layout

The frontend uses HTML, CSS, and JavaScript, with esbuild for the site entry. Tiptap powers the editor; Marked, DOMPurify, and KaTeX handle Markdown, sanitization, and math. The backend runs on Cloudflare Pages Functions with D1, R2, and optional services such as Durable Objects.

```text
index.html                 Site entry
static/js/                 Frontend scripts
static/css/                Styles and themes
src/                       Bundle entries and editor extensions
assets/                    Images, fonts, models, and third-party assets
pages/                     Secondary pages
tools/                     Development pages
functions/                 Pages Functions APIs and server logic
workers/                   Standalone Workers
migrations/                Incremental database migrations
scripts/                   Build and asset maintenance scripts
tests/                     Automated tests
docs/                      Feature and maintenance documentation
```

## Local development

Node.js 24 is recommended to match CI.

```bash
git clone https://github.com/dfsjiv/my-blog.git
cd my-blog
npm ci
npm run build:knowledge-site
npm test
```

A static HTTP server can preview pages. Authentication, article writes, uploads, and other backend features need the corresponding Cloudflare services and data bindings. After configuring your own development resources, you can run Pages Functions with Wrangler:

```bash
npx wrangler pages dev .
```

After changing scripts included in the site entry, run `npm run build:knowledge-site` and commit the generated bundle together with its updated entry reference. After changing editor extensions, run `npm run build:knowledge-editor`. Do not edit generated vendor bundles directly.

Before submitting changes:

```bash
npm run check:knowledge-build
npm test
```

## Deployment

The site deploys through Cloudflare Pages, using the repository root as its output directory. Configure resources in your own Cloudflare account when reusing this project:

| Configuration | Purpose |
| --- | --- |
| D1 binding `DB` | Users, articles, comments, practice statistics, and other application records |
| R2 binding `KNOWLEDGE_IMAGES` | Uploaded images, avatars, backgrounds, and display settings |
| `CHAT_ROOM` and related realtime bindings | Configure for your chat deployment; see `workers/` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Optional Gemini chat |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | Optional DeepSeek chat |

The files in `migrations/` incrementally extend an existing application database; they are not a complete fresh-install schema. A new database also needs its foundational tables and initial administrator setup. Do not reuse production resource identifiers from historical documentation. Keep credentials in Cloudflare Secrets or local development configuration, outside version control.

The root `_redirects` file preserves older page URLs. For your own deployment, update the domain, sharing metadata, RSS/sitemap URLs, and social links.

Further documentation: [Algorithm center](docs/algorithm-center.md) · [Profiles and avatars](docs/profile-avatar.md) · [Background display](docs/background-display.md) · [Legacy content compatibility](docs/knowledge-legacy-migration.md)

## Code and content licensing

| Material | License and permitted use |
| --- | --- |
| Original project code and engineering documentation | [MIT License](LICENSE). Use, modify, distribute, and use commercially while retaining the copyright and license notices. |
| Original articles, write-ups, and original content data whose copyright belongs to the blog owner | [CC BY 4.0](LICENSE-CONTENT.md). Reuse, redistribute, adapt, and use commercially with the required attribution. No separate permission is needed. |
| Third-party code, fonts, illustrations, models, audiovisual assets, and republished articles | Their original licenses or permissions apply. Inclusion in this repository or website does not relicense them under MIT or CC BY 4.0. |

**When reusing covered original article content, credit the author and provide the original article URL and a CC BY 4.0 license link. Indicate modifications and retain applicable existing notices.** There is no additional noncommercial or ShareAlike requirement. See the [content license notice](LICENSE-CONTENT.md) for scope and full terms.

Example attribution; replace the placeholders with the actual author, title, and article URL:

```text
“Article title” by the credited author
Source: 臻写代码 / Zhen Codes, https://lilinzheng.top/original-article-url
License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
Changes: None / Excerpted and reformatted / Adapted ...
```

Other users' submissions, comments, and third-party platform content are covered only when their rights holders explicitly grant the corresponding permission. Account information, sessions, unpublished drafts, and other personal data are outside the open-content license.

Retain third-party notices, including LICENSE, NOTICE, `.LICENSE`, and font OFL files under `assets/`. Third-party assets without clear permission should not be treated as freely redistributable open-source assets.

## Contributing

Issues and pull requests are welcome. For visual changes, preserve the established style where practical and explain the purpose and validation.

Contribute only material you have the right to provide. Code contributions are offered under the project's MIT License; original articles and other content contributions should state their own licensing. Preserve authorship, source, and license information for third-party material.

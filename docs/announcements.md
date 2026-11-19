# 公告维护 / Maintaining announcements

顶部导航“公告”进入 `/?knowledge=announcements`。访客无需登录即可阅读；公告中的写作和设计入口继续沿用原有登录权限。公告按日期从新到旧显示，较早记录默认折叠；可筛选功能更新、问题修复，或搜索更新内容和操作步骤。历史条目明确标记为补录。

The top navigation opens `/?knowledge=announcements`. Announcements are public; linked authoring tools retain their existing account requirements. Entries appear newest first, with older entries collapsed, type filters, search, and permalinks. Backfilled historical records are labeled explicitly.

## 发布公告 / Publishing an announcement

当前公告随 Git 版本发布，**不新增数据库表，也没有新增网页后台发布入口**。

Announcements are versioned with Git. This version adds neither a database table nor a web-based announcement editor.

1. 在 `assets/knowledge/announcements.json` 的 `items` 中添加记录，保留 `version: 1`。
2. `id` 使用唯一的小写英文／数字／连字符标识；`date` 使用实际更新日期 `YYYY-MM-DD`，不要虚构日期。普通新公告设 `historical: false`。
3. `type` 为 `feature` 或 `fix`。`title`、`summary`、`changes`、`steps`、`notes` 提供 `zh` 和 `en` 两种语言；其中列表字段使用字符串数组。
4. `changes` 说明已经上线的内容，`steps` 说明如何进入与使用，`notes` 说明对用户有影响的限制。尚未实现的功能继续放在 README 更新计划中。
5. `links` 可提供相关功能入口或文档链接，格式为 `{ "label": { "zh": "中文", "en": "English" }, "url": "/?knowledge=pages" }`。
6. 修改 `static/js/knowledge-announcements.js` 中 `DATA_URL` 的版本参数，并更新 `index.html` 公告脚本的版本参数，避免旧资源缓存。
7. 运行 `npm test`；若修改站点主入口相关脚本，另运行 `npm run build:knowledge-site` 和 `npm run check:knowledge-build`。提交并部署后查看公告和操作链接。

Add a bilingual entry to the JSON file with a unique ID and a real update date. Describe shipped changes, instructions, and relevant limitations; keep future work in the README roadmap. Bump the data URL and announcement script versions, run the applicable checks, and verify the deployed entry and links.

每条公告的链接为 `/?knowledge=announcements#announcement-记录ID`。直接打开链接会展开对应条目。内容按纯文本渲染；操作链接只接受 HTTP(S)，不执行公告文本中的 HTML 或脚本。公告脚本、样式和数据仅在打开栏目时加载，不阻塞首页文章请求，也不新增 D1 读取。

Permalinks use `/?knowledge=announcements#announcement-ID` and expand the matching entry. Text is rendered as text, and action links only accept HTTP(S). Scripts, styles, and data load only when the route is opened, without additional D1 reads or blocking homepage article requests.

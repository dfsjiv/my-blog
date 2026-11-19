# 自定义页面 / Custom pages

第一版提供代码式页面设计器。入口为 **写文章 → 页面设计**，公开目录为 **文章 → 自定义页面**。默认博客不变；发布独立页面不会自动替换首页。

The first version is a code-based page studio. Open **Write → Page studio** to edit, or **Posts → Custom pages** to browse published pages. Publishing a standalone page does not replace the default homepage.

第一版页面目录和独立页面暂设为 `noindex`，分享链接可正常访问；尚未提供独立页面的搜索引擎收录与服务端正文渲染。

The gallery and standalone page routes use `noindex` in this version. Share links work normally; search indexing and server-rendered custom-page bodies are not included yet.

## 使用流程 / Workflow

1. 选择三个起始模板之一，或导入 HTML、CSS。支持完整 HTML 文件中的内联样式以及 HTTPS 样式表；本地相对资源需上传或替换为有效地址。
2. 编辑页面名称和访问标识。访问标识全站唯一，只允许小写英文、数字和连字符，首次保存后固定。
3. 关联最多 12 篇已发布文章，或导入页内 Markdown。关联保留原文章数据；页内 Markdown 保存在页面配置中，不会自动创建或修改文章。
4. 在桌面／390px 手机宽度和深浅色预览中检查。CSS 动画、悬停和响应式布局可直接预览。
5. 保存草稿，再发布。后续保存只修改草稿，访客继续看到上次发布的设计；再次发布才更新设计快照。
6. 页面发布后可分享 `/?knowledge=page&slug=你的访问标识`。管理员可明确选择将已发布版本设为全站首页。
7. “撤下页面 / 恢复默认”会撤下该页面；如果它是当前首页，同时恢复默认首页。`/?default=1` 可临时查看原首页，不改变全站设置。

Start from a template or import HTML/CSS; bind published articles or import inline Markdown; preview, save a draft, then publish. Draft changes are isolated from the last published design snapshot. Only administrators may explicitly set a published page as the site-wide homepage. Unpublishing the active homepage restores the original homepage; `/?default=1` temporarily bypasses customization without changing the site setting.

## 内容区域 / Content slots

| 标记 / Token | 内容 / Content |
| --- | --- |
| `{{title}}` | 页面名称 / Page title |
| `{{author}}` | 作者名称 / Author name |
| `{{articles}}` | 关联文章卡片 / Linked article cards |
| `{{article-bodies}}` | 关联文章全文 / Linked article bodies |
| `{{content}}` | 页内 Markdown / Inline page Markdown |

也可使用 `<section data-page-slot="articles"></section>` 等区域。未放置内容标记时，已导入的 Markdown 和文章卡片追加在页面底部，避免内容被静默丢弃。关联文章按当前公开内容读取；文章撤下或读取失败时略过并显示提示，不公开原文章的草稿。

Named `data-page-slot` elements also work. Inline Markdown and article cards are appended when their slots are absent. Linked articles use their current public content; unavailable articles are omitted with a notice, never replaced with private drafts.

可使用 `--page-bg`、`--page-surface`、`--page-text`、`--page-muted`、`--page-accent`、`--page-line` 编写适配深浅色的 CSS。主题改变不会改写你的代码。

Use the CSS variables above for theme-aware designs. Theme changes do not rewrite saved code.

## 图片与文件 / Assets and files

“上传并插入图片”复用现有图片上传服务和 R2，普通用户单张上限 2 MiB，管理员 8 MiB。第一版不自动打包或上传 HTML／Markdown 引用的本地文件夹，不执行 Tailwind CDN 等外部脚本；使用这类脚本生成的样式需先导出为 CSS。

Image uploads reuse the existing service and R2, with the existing 2 MiB member / 8 MiB administrator limits. Local folders are not uploaded automatically. External scripts, including runtime CSS generators such as Tailwind CDN scripts, are not executed; export their CSS before importing.

页面备份导出为 JSON，包含布局、CSS、页内 Markdown 和文章 slug 引用，不打包图片或文章正文。导入备份创建一个未保存的新设计，不接受账号 ID、权限、发布状态或首页设置；发布前需重新检查访问标识。离开有修改的设计器时会提示，尚无本机自动恢复功能，请主动保存或导出。

JSON backups contain the design, inline Markdown and article slug references, not image files or linked article bodies. Imports open as unsaved designs and never import permissions or publication/homepage state. Save or export before leaving; local automatic recovery is not part of this version.

## 数据与容量 / Data and capacity

迁移：`migrations/0014_add_custom_pages.sql`，在现有 `DB` 上新增 **一张 `custom_pages` 表**和两个显式索引；复用 `users` 外键及文章 API，不修改原表数据。迁移可重复执行。尚未迁移时，公开首页接口返回无自定义页面，管理接口返回 `MIGRATION_REQUIRED`。

The additive migration creates one table and two explicit indexes on the existing D1 binding. Existing users and articles are unchanged. Without the migration, the public homepage falls back normally and management reports `MIGRATION_REQUIRED`.

| 账号 / Account | 页面数（含回收站） / Pages including trash | 每个设计版本的 UTF-8 上限 / UTF-8 bytes per design version |
| --- | --- | --- |
| 普通用户 / Member | 8 | 256 KiB |
| 管理员 / Administrator | 30 | 1 MiB |

每个页面最多同时保存一份草稿和一份发布快照。因此正文配置理论上限约为普通账号 4 MiB、管理员账号 60 MiB，另有元数据和数据库开销；不是新建空表就会占用这些容量。图片另计 R2。回收站保留设计并计入配额，可恢复为未发布草稿。

Each page keeps at most one draft and one published snapshot. Maximum design payloads are approximately 4 MiB per member account or 60 MiB per administrator account, plus metadata/database overhead. Empty pages do not reserve this capacity. Images count toward R2; trash remains recoverable and counts toward the page quota.

管理接口按账号隔离，包括管理员也只编辑自己的页面；全站首页设置额外要求管理员权限。保存、发布和状态操作使用版本条件避免旧窗口覆盖。公开接口只读取发布快照。预览与展示放在隔离 iframe 中，使用 HTML 清理和 CSP；第一版支持 HTML／CSS 动态设计，不执行自定义 JavaScript、表单或嵌入 iframe，也不接触父页面账号信息。站点外层导航保留，页面内容区由设计控制，可全屏查看。

Management is scoped to each owner, including administrators; site-wide homepage changes additionally require administrator status. Version checks reject stale writes. Public reads expose only published snapshots. Sanitized designs render inside sandboxed iframes with CSP; custom JavaScript, forms and embedded iframes do not run. The outer site navigation remains available, and designs control the content area with an optional fullscreen view.

## 验证 / Validation

```bash
npm run check:knowledge-build
npm test
```

本地端到端验证可分别启动已有模拟站点和真实页面 API 的内存数据库服务：

```bash
node tests/fixtures/knowledge-browser-server.mjs 8766
node tests/fixtures/custom-pages-browser-server.mjs
```

访问 `http://127.0.0.1:8767`。两个服务只使用模拟账号和本地内存数据，不连接生产数据库；停止服务即清除页面测试数据。

Both browser fixtures use synthetic accounts and local in-memory page data; they never connect to production. Stopping the servers discards test pages.
